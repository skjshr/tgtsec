from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any


PLATFORM_ROOT = Path(__file__).resolve().parents[1] / "platform"
sys.path.insert(0, str(PLATFORM_ROOT))

from open_world_platform.model import (  # noqa: E402
    ContractError,
    canonical_json,
    load_json,
    sha256_file,
    validate_profile,
)


LAUNCHER = """#!/bin/sh
set -eu
KIT_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
export PYTHONPATH="$KIT_ROOT/tool${PYTHONPATH:+:$PYTHONPATH}"
export OPEN_WORLD_PLATFORM_MANIFEST="$KIT_ROOT/tool/platform-manifest.json"
exec /usr/bin/python3 -m open_world_platform.cli "$@"
"""


def _safe_empty_destination(output: Path) -> None:
    if str(output).startswith("/dev/"):
        raise ContractError("kit output must be a directory, never a block device")
    if output.exists():
        if not output.is_dir() or output.is_symlink() or any(output.iterdir()):
            raise ContractError("kit output must not exist or must be an empty directory")
    else:
        output.parent.mkdir(parents=True, exist_ok=True)


def _asset_sources(
    profile: dict[str, Any], asset_root: Path
) -> list[tuple[Path, Path, str]]:
    values: list[tuple[Path, Path, str]] = []
    for key in ("goldenBtrfsStream", "debianEfiArchive", "bareMetalImage"):
        entry = profile["recovery"][key]
        relative = Path(entry["path"])
        source = (asset_root / relative).resolve(strict=True)
        try:
            source.relative_to(asset_root.resolve(strict=True))
        except ValueError as exc:
            raise ContractError(f"asset escapes asset root: {relative}") from exc
        if not source.is_file() or source.is_symlink():
            raise ContractError(f"asset must be a regular file: {source}")
        observed = sha256_file(source)
        if observed != entry["sha256"].lower():
            raise ContractError(f"asset hash mismatch for {key}")
        if (
            key == "bareMetalImage"
            and source.stat().st_size != profile["target"]["diskSizeBytes"]
        ):
            raise ContractError(
                "bare-metal image logical size does not exactly match "
                "target.diskSizeBytes"
            )
        values.append((source, relative, observed))
    return values


def _write(path: Path, content: bytes, mode: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    os.chmod(path, mode)


def _file_manifest(root: Path) -> list[dict[str, Any]]:
    files = []
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ContractError(f"kit source contains a symlink: {path}")
        if path.is_dir():
            continue
        if not path.is_file():
            raise ContractError(f"kit source contains a special file: {path}")
        if path.name == "KIT-MANIFEST.json":
            continue
        files.append(
            {
                "path": path.relative_to(root).as_posix(),
                "sha256": sha256_file(path),
                "mode": f"{path.stat().st_mode & 0o777:04o}",
            }
        )
    return files


def build_kit(
    profile_path: Path,
    asset_root: Path,
    output: Path,
) -> dict[str, Any]:
    profile = load_json(profile_path)
    validate_profile(profile)
    _safe_empty_destination(output)
    assets = _asset_sources(profile, asset_root)
    platform_manifest = PLATFORM_ROOT / "manifest.json"
    if not platform_manifest.is_file():
        raise ContractError("platform manifest is missing")

    with tempfile.TemporaryDirectory(
        prefix=".open-world-kit-", dir=output.parent
    ) as temporary_name:
        temporary = Path(temporary_name)
        shutil.copy2(profile_path, temporary / "profile.json")
        (temporary / "tool").mkdir(parents=True, exist_ok=True)
        shutil.copy2(
            platform_manifest, temporary / "tool/platform-manifest.json"
        )
        for module in sorted((PLATFORM_ROOT / "open_world_platform").glob("*.py")):
            destination = temporary / "tool/open_world_platform" / module.name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(module, destination)
        _write(temporary / "tool/open-world-platform", LAUNCHER.encode("utf-8"), 0o755)
        for source, relative, _ in assets:
            destination = temporary / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
        marker = {
            "schemaVersion": 1,
            "trustedPurpose": "examserver-open-world-recovery",
            "kitId": profile["recovery"]["kitId"],
            "mediaUuid": profile["recovery"]["mediaUuid"],
            "goldenDebianFilesystemUuid": profile["recovery"][
                "goldenBtrfsStream"
            ]["filesystemUuid"],
        }
        _write(
            temporary / "RECOVERY-MEDIA.json",
            canonical_json(marker),
            0o444,
        )
        kit_manifest = {
            "schemaVersion": 1,
            "kitId": profile["recovery"]["kitId"],
            "mediaUuid": profile["recovery"]["mediaUuid"],
            "goldenDebianFilesystemUuid": profile["recovery"][
                "goldenBtrfsStream"
            ]["filesystemUuid"],
            "files": _file_manifest(temporary),
        }
        _write(
            temporary / "KIT-MANIFEST.json",
            canonical_json(kit_manifest),
            0o444,
        )
        if output.exists():
            output.rmdir()
        temporary.replace(output)
    return verify_kit(output)


def verify_kit(root: Path) -> dict[str, Any]:
    if not root.is_dir() or root.is_symlink():
        raise ContractError("kit root must be a real directory")
    manifest_path = root / "KIT-MANIFEST.json"
    if not manifest_path.is_file() or manifest_path.is_symlink():
        raise ContractError("kit manifest must be a regular file")
    manifest = load_json(manifest_path)
    if manifest.get("schemaVersion") != 1:
        raise ContractError("kit manifest schemaVersion must be 1")
    expected_entries = manifest.get("files")
    if not isinstance(expected_entries, list) or not expected_entries:
        raise ContractError("kit manifest has no files")
    expected_paths = set()
    for entry in expected_entries:
        if not isinstance(entry, dict):
            raise ContractError("invalid kit file entry")
        relative = Path(str(entry.get("path", "")))
        if relative.is_absolute() or ".." in relative.parts:
            raise ContractError("unsafe path in kit manifest")
        expected_paths.add(relative.as_posix())
        path = root / relative
        if not path.is_file() or path.is_symlink():
            raise ContractError(f"kit file is missing or unsafe: {relative}")
        if sha256_file(path) != entry.get("sha256"):
            raise ContractError(f"kit file hash mismatch: {relative}")
    observed_paths = {
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_file() and path.name != "KIT-MANIFEST.json"
    }
    resolved_root = root.resolve(strict=True)
    for path in root.rglob("*"):
        if path.is_symlink():
            raise ContractError(f"kit contains a symlink: {path}")
        try:
            path.resolve(strict=True).relative_to(resolved_root)
        except (OSError, ValueError) as exc:
            raise ContractError(f"kit path escapes recovery root: {path}") from exc
        if not (path.is_file() or path.is_dir()):
            raise ContractError(f"kit contains a special file: {path}")
    if observed_paths != expected_paths:
        raise ContractError("kit contains unmanifested or missing files")
    bundled_profile = load_json(root / "profile.json")
    validate_profile(bundled_profile)
    if manifest.get("goldenDebianFilesystemUuid") != bundled_profile[
        "recovery"
    ]["goldenBtrfsStream"]["filesystemUuid"]:
        raise ContractError(
            "kit golden Debian filesystem UUID does not match bundled profile"
        )
    digest = hashlib.sha256(canonical_json(manifest)).hexdigest()
    return {
        "ok": True,
        "kitId": manifest.get("kitId"),
        "fileCount": len(expected_paths),
        "kitManifestSha256": digest,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build or verify a non-bootable recovery-kit directory"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    build = subparsers.add_parser("build")
    build.add_argument("--profile", type=Path, required=True)
    build.add_argument("--asset-root", type=Path, required=True)
    build.add_argument("--output", type=Path, required=True)
    verify = subparsers.add_parser("verify")
    verify.add_argument("--root", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        result = (
            build_kit(args.profile, args.asset_root, args.output)
            if args.command == "build"
            else verify_kit(args.root)
        )
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except ContractError as exc:
        print(
            json.dumps(
                {"ok": False, "error": str(exc)},
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
