from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

from .model import (
    ContractError,
    canonical_json,
    load_json,
    sha256_file,
    validate_manifest,
    validate_profile,
    validate_profile_against_manifest,
)


SOURCE_DATE_EPOCH = 1_700_000_000


def platform_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _ensure_empty_output(output: Path) -> None:
    if output.exists():
        if not output.is_dir():
            raise ContractError(f"render output is not a directory: {output}")
        if any(output.iterdir()):
            raise ContractError(
                f"render output must not exist or must be empty: {output}"
            )
    else:
        output.mkdir(parents=True)


def _render_text(source: Path, replacements: dict[str, str]) -> bytes:
    text = source.read_text(encoding="utf-8")
    for key, value in replacements.items():
        text = text.replace("{{" + key + "}}", value)
    if "{{" in text or "}}" in text:
        raise ContractError(f"unresolved template marker in {source}")
    return text.encode("utf-8")


def _write_file(path: Path, content: bytes, mode: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    os.chmod(path, mode)
    os.utime(path, (SOURCE_DATE_EPOCH, SOURCE_DATE_EPOCH))


def _target_path(output: Path, absolute_target: str) -> Path:
    relative = Path(absolute_target.lstrip("/"))
    target = (output / relative).resolve()
    try:
        target.relative_to(output.resolve())
    except ValueError as exc:
        raise ContractError(f"install target escapes render root: {absolute_target}") from exc
    return target


def render_overlay(
    manifest_path: Path, profile_path: Path, output: Path
) -> dict[str, Any]:
    manifest = load_json(manifest_path)
    profile = load_json(profile_path)
    validate_manifest(manifest)
    validate_profile(profile)
    validate_profile_against_manifest(manifest, profile)
    _ensure_empty_output(output)

    replacements = {
        "WIRED_INTERFACE": profile["network"]["wiredInterface"],
        "WIRED_MAC": profile["network"]["wiredMac"].lower(),
        "WINDOWS_PARTUUID": profile["target"]["windowsPartuuid"],
    }
    installed: list[dict[str, Any]] = []
    root = platform_root()
    for entry in manifest["installFiles"]:
        source = root / entry["source"]
        if not source.is_file():
            raise ContractError(f"manifest source does not exist: {source}")
        content = (
            _render_text(source, replacements)
            if entry["template"]
            else source.read_bytes()
        )
        mode = int(entry["mode"], 8)
        target = _target_path(output, entry["target"])
        _write_file(target, content, mode)
        installed.append(
            {
                "target": entry["target"],
                "mode": entry["mode"],
                "sha256": hashlib.sha256(content).hexdigest(),
            }
        )

    package_source = root / "open_world_platform"
    for source in sorted(package_source.glob("*.py")):
        target_name = (
            "/usr/local/lib/open-world-platform/open_world_platform/" + source.name
        )
        target = _target_path(output, target_name)
        content = source.read_bytes()
        _write_file(target, content, 0o644)
        installed.append(
            {
                "target": target_name,
                "mode": "0644",
                "sha256": hashlib.sha256(content).hexdigest(),
            }
        )

    profile_target_name = "/etc/open-world-lab/profile.json"
    profile_content = canonical_json(profile)
    _write_file(_target_path(output, profile_target_name), profile_content, 0o600)
    installed.append(
        {
            "target": profile_target_name,
            "mode": "0600",
            "sha256": hashlib.sha256(profile_content).hexdigest(),
        }
    )

    packages_target_name = "/usr/local/share/open-world-lab/packages.txt"
    packages_content = (
        "\n".join(manifest["packages"]) + "\n"
    ).encode("utf-8")
    _write_file(_target_path(output, packages_target_name), packages_content, 0o644)
    installed.append(
        {
            "target": packages_target_name,
            "mode": "0644",
            "sha256": hashlib.sha256(packages_content).hexdigest(),
        }
    )

    source_manifest_target_name = (
        "/usr/local/share/open-world-lab/platform-manifest.json"
    )
    source_manifest_content = canonical_json(manifest)
    _write_file(
        _target_path(output, source_manifest_target_name),
        source_manifest_content,
        0o644,
    )
    installed.append(
        {
            "target": source_manifest_target_name,
            "mode": "0644",
            "sha256": hashlib.sha256(source_manifest_content).hexdigest(),
        }
    )

    generated_manifest = {
        "schemaVersion": 1,
        "labId": manifest["labId"],
        "sourceManifestSha256": sha256_file(manifest_path),
        "files": sorted(installed, key=lambda item: item["target"]),
    }
    generated_path = _target_path(
        output, "/usr/local/share/open-world-lab/install-manifest.json"
    )
    _write_file(generated_path, canonical_json(generated_manifest), 0o644)
    return generated_manifest


def tree_digest(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        relative = path.relative_to(root).as_posix().encode("utf-8")
        digest.update(relative + b"\0")
        digest.update(f"{path.stat().st_mode & 0o777:04o}".encode("ascii") + b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def write_overlay_archive_manifest(output: Path, destination: Path) -> None:
    value = {
        "schemaVersion": 1,
        "treeSha256": tree_digest(output),
    }
    destination.write_text(
        json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
