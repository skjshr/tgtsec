from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

from .install import (
    InstallRequest,
    apply_install,
    install_plan,
    validate_install_request,
)
from .inventory import collect_live_inventory
from .mode import (
    enter_exercise,
    enter_maintenance,
    set_maintenance_connectivity,
)
from .model import (
    ContractError,
    canonical_json,
    load_json,
    sha256_file,
    validate_manifest,
    validate_profile,
    validate_profile_against_manifest,
)
from .preflight import evaluate_exercise, evaluate_maintenance, result
from .recovery import (
    RecoveryRequest,
    apply_recovery,
    recovery_plan,
    tree_sha256,
    validate_recovery_request,
)
from .render import platform_root, render_overlay, tree_digest
from .target_bundle import build_target_bundle, validate_target_bundle
from .target_install import (
    TargetInstallRequest,
    apply_target_install,
    target_install_plan,
    validate_target_install_request,
)


INSTALLED_MANIFEST = Path(
    "/usr/local/share/open-world-lab/platform-manifest.json"
)
SOURCE_MANIFEST = platform_root() / "manifest.json"


def _default_manifest() -> Path:
    configured = os.environ.get("OPEN_WORLD_PLATFORM_MANIFEST")
    if configured:
        return Path(configured)
    return INSTALLED_MANIFEST if INSTALLED_MANIFEST.is_file() else SOURCE_MANIFEST


def _write_result(value: dict[str, Any], output: Path | None = None) -> None:
    content = canonical_json(value)
    if output is None:
        sys.stdout.buffer.write(content)
        return
    if output.exists():
        raise ContractError(f"refusing to overwrite output: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(content)


def _add_contract_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--manifest", type=Path, default=_default_manifest())
    parser.add_argument("--profile", type=Path, required=True)


def _contracts(args: argparse.Namespace) -> tuple[dict[str, Any], dict[str, Any]]:
    manifest = load_json(args.manifest)
    profile = load_json(args.profile)
    validate_manifest(manifest)
    validate_profile(profile)
    validate_profile_against_manifest(manifest, profile)
    return manifest, profile


def _inventory(
    args: argparse.Namespace,
    manifest: dict[str, Any],
    profile: dict[str, Any],
) -> dict[str, Any]:
    if getattr(args, "inventory", None):
        return load_json(args.inventory)
    inventory = collect_live_inventory(
        manifest,
        profile,
        recovery_mount=getattr(args, "recovery_mount", None),
    )
    expected = getattr(args, "boot_environment", None)
    if expected and inventory.get("bootEnvironment") != expected:
        raise ContractError(
            f"derived boot environment is {inventory.get('bootEnvironment')!r}, "
            f"not {expected!r}"
        )
    return inventory


def _cmd_validate(args: argparse.Namespace) -> dict[str, Any]:
    manifest, profile = _contracts(args)
    return {
        "ok": True,
        "labId": manifest["labId"],
        "wiredInterface": profile["network"]["wiredInterface"],
    }


def _cmd_render(args: argparse.Namespace) -> dict[str, Any]:
    generated = render_overlay(args.manifest, args.profile, args.output)
    return {
        "ok": True,
        "output": str(args.output.resolve()),
        "treeSha256": tree_digest(args.output),
        "fileCount": len(generated["files"]) + 1,
    }


def _cmd_inventory(args: argparse.Namespace) -> dict[str, Any]:
    manifest, profile = _contracts(args)
    inventory = collect_live_inventory(
        manifest,
        profile,
        recovery_mount=args.recovery_mount,
    )
    if inventory.get("bootEnvironment") != args.boot_environment:
        raise ContractError(
            f"derived boot environment is {inventory.get('bootEnvironment')!r}, "
            f"not {args.boot_environment!r}"
        )
    return inventory


def _cmd_preflight(args: argparse.Namespace) -> dict[str, Any]:
    manifest, profile = _contracts(args)
    inventory = _inventory(args, manifest, profile)
    if args.mode == "exercise":
        issues = evaluate_exercise(
            manifest,
            profile,
            inventory,
            require_services=args.stage == "ready",
        )
    else:
        issues = evaluate_maintenance(
            manifest,
            profile,
            inventory,
            connectivity_may_be_enabled=args.mode == "maintenance-connectivity",
        )
    return result(args.mode, issues)


def _cmd_mode(args: argparse.Namespace) -> dict[str, Any]:
    manifest, profile = _contracts(args)
    inventory = (
        collect_live_inventory(manifest, profile)
        if args.apply
        else _inventory(args, manifest, profile)
    )
    provider = None
    if args.apply:
        provider = lambda: collect_live_inventory(
            manifest,
            profile,
        )
    if args.to == "exercise":
        return enter_exercise(
            manifest,
            profile,
            inventory,
            apply=args.apply,
            confirmation=args.confirm,
            inventory_provider=provider,
        )
    if args.to == "maintenance":
        return enter_maintenance(
            manifest,
            profile,
            apply=args.apply,
            confirmation=args.confirm,
            inventory_provider=provider,
        )
    return set_maintenance_connectivity(
        manifest,
        profile,
        inventory,
        enabled=args.to == "connectivity-on",
        apply=args.apply,
        confirmation=args.confirm,
        inventory_provider=provider,
    )


def _install_request(args: argparse.Namespace) -> InstallRequest:
    return InstallRequest(
        disk_by_id=args.disk_by_id,
        debian_partuuid=args.debian_partuuid,
        esp_partuuid=args.esp_partuuid,
        windows_partuuid=args.windows_partuuid,
        overlay_sha256=args.overlay_sha256.lower(),
        confirmation=args.confirm,
    )


def _cmd_install(args: argparse.Namespace) -> dict[str, Any]:
    manifest, profile = _contracts(args)
    inventory = (
        collect_live_inventory(
            manifest,
            profile,
        )
        if args.apply
        else _inventory(args, manifest, profile)
    )
    request = _install_request(args)
    generated = validate_install_request(
        manifest, profile, inventory, args.overlay, request
    )
    if not args.apply:
        return install_plan(profile, request, generated)
    return apply_install(args.overlay, generated)


def _cmd_build_target_bundle(args: argparse.Namespace) -> dict[str, Any]:
    return build_target_bundle(
        args.repo_root, args.output, node_binary=args.node
    )


def _cmd_verify_target_bundle(args: argparse.Namespace) -> dict[str, Any]:
    return validate_target_bundle(args.bundle)


def _target_install_request(args: argparse.Namespace) -> TargetInstallRequest:
    return TargetInstallRequest(
        disk_by_id=args.disk_by_id,
        debian_partuuid=args.debian_partuuid,
        esp_partuuid=args.esp_partuuid,
        windows_partuuid=args.windows_partuuid,
        bundle_manifest_sha256=args.bundle_manifest_sha256.lower(),
        confirmation=args.confirm,
    )


def _cmd_install_target(args: argparse.Namespace) -> dict[str, Any]:
    manifest, profile = _contracts(args)
    inventory = (
        collect_live_inventory(manifest, profile)
        if args.apply
        else _inventory(args, manifest, profile)
    )
    request = _target_install_request(args)
    validation = validate_target_install_request(
        manifest, profile, inventory, args.bundle, request
    )
    if not args.apply:
        return target_install_plan(profile, request, validation)
    return apply_target_install(args.bundle, validation)


def _recovery_request(args: argparse.Namespace) -> RecoveryRequest:
    return RecoveryRequest(
        operation=args.operation,
        disk_by_id=args.disk_by_id,
        debian_partuuid=args.debian_partuuid,
        esp_partuuid=args.esp_partuuid,
        windows_partuuid=args.windows_partuuid,
        image_sha256=args.image_sha256.lower(),
        efi_sha256=args.efi_sha256.lower() if args.efi_sha256 else None,
        confirmation=args.confirm,
    )


def _cmd_recover(args: argparse.Namespace) -> dict[str, Any]:
    manifest, profile = _contracts(args)
    inventory = (
        collect_live_inventory(
            manifest,
            profile,
            recovery_mount=args.recovery_mount,
        )
        if args.apply
        else _inventory(args, manifest, profile)
    )
    request = _recovery_request(args)
    context = validate_recovery_request(
        profile,
        inventory,
        request,
        recovery_mount=args.recovery_mount,
        marker_path=args.marker,
    )
    if not args.apply:
        return recovery_plan(profile, request, context)
    return apply_recovery(profile, request, context)


def _cmd_marker(args: argparse.Namespace) -> dict[str, Any]:
    profile = load_json(args.profile)
    validate_profile(profile)
    marker = {
        "schemaVersion": 1,
        "trustedPurpose": "examserver-open-world-recovery",
        "kitId": profile["recovery"]["kitId"],
        "mediaUuid": profile["recovery"]["mediaUuid"],
        "goldenDebianFilesystemUuid": profile["recovery"][
            "goldenBtrfsStream"
        ]["filesystemUuid"],
    }
    _write_result(marker, args.output)
    return {"ok": True, "output": str(args.output.resolve())}


def _cmd_hash(args: argparse.Namespace) -> dict[str, Any]:
    if args.kind == "file":
        digest = sha256_file(args.path)
    elif args.kind == "tree":
        digest = tree_digest(args.path)
    else:
        digest = tree_sha256(args.path)
    return {"ok": True, "kind": args.kind, "path": str(args.path), "sha256": digest}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="open-world-platform",
        description="Fail-closed Debian lab platform and recovery tooling",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate = subparsers.add_parser("validate")
    _add_contract_args(validate)
    validate.set_defaults(handler=_cmd_validate)

    render = subparsers.add_parser("render")
    _add_contract_args(render)
    render.add_argument("--output", type=Path, required=True)
    render.set_defaults(handler=_cmd_render)

    inventory = subparsers.add_parser("inventory")
    _add_contract_args(inventory)
    inventory.add_argument(
        "--boot-environment",
        choices=[
            "installed-debian",
            "installed-debian-maintenance",
            "trusted-recovery-media",
        ],
        required=True,
    )
    inventory.add_argument("--recovery-mount", type=Path)
    inventory.add_argument("--output", type=Path)
    inventory.set_defaults(handler=_cmd_inventory)

    preflight = subparsers.add_parser("preflight")
    _add_contract_args(preflight)
    preflight.add_argument(
        "--mode",
        choices=["exercise", "maintenance", "maintenance-connectivity"],
        required=True,
    )
    preflight.add_argument(
        "--stage", choices=["isolation", "ready"], default="ready"
    )
    preflight.add_argument("--inventory", type=Path)
    preflight.add_argument("--boot-environment")
    preflight.set_defaults(handler=_cmd_preflight)

    mode = subparsers.add_parser("mode")
    _add_contract_args(mode)
    mode.add_argument(
        "--to",
        choices=[
            "exercise",
            "maintenance",
            "connectivity-on",
            "connectivity-off",
        ],
        required=True,
    )
    mode.add_argument("--inventory", type=Path)
    mode.add_argument("--boot-environment")
    mode.add_argument("--confirm")
    mode.add_argument("--apply", action="store_true")
    mode.set_defaults(handler=_cmd_mode)

    install = subparsers.add_parser("install")
    _add_contract_args(install)
    install.add_argument("--overlay", type=Path, required=True)
    install.add_argument("--overlay-sha256", required=True)
    install.add_argument("--disk-by-id", required=True)
    install.add_argument("--debian-partuuid", required=True)
    install.add_argument("--esp-partuuid", required=True)
    install.add_argument("--windows-partuuid", required=True)
    install.add_argument("--confirm", required=True)
    install.add_argument("--inventory", type=Path)
    install.add_argument("--boot-environment")
    install.add_argument("--apply", action="store_true")
    install.set_defaults(handler=_cmd_install)

    build_target = subparsers.add_parser("build-target-bundle")
    build_target.add_argument("--repo-root", type=Path, required=True)
    build_target.add_argument("--output", type=Path, required=True)
    build_target.add_argument("--node", default="node")
    build_target.set_defaults(handler=_cmd_build_target_bundle)

    verify_target = subparsers.add_parser("verify-target-bundle")
    verify_target.add_argument("--bundle", type=Path, required=True)
    verify_target.set_defaults(handler=_cmd_verify_target_bundle)

    install_target = subparsers.add_parser("install-target")
    _add_contract_args(install_target)
    install_target.add_argument("--bundle", type=Path, required=True)
    install_target.add_argument("--bundle-manifest-sha256", required=True)
    install_target.add_argument("--disk-by-id", required=True)
    install_target.add_argument("--debian-partuuid", required=True)
    install_target.add_argument("--esp-partuuid", required=True)
    install_target.add_argument("--windows-partuuid", required=True)
    install_target.add_argument("--confirm", required=True)
    install_target.add_argument("--inventory", type=Path)
    install_target.add_argument("--boot-environment")
    install_target.add_argument("--apply", action="store_true")
    install_target.set_defaults(handler=_cmd_install_target)

    recover = subparsers.add_parser("recover")
    _add_contract_args(recover)
    recover.add_argument("--operation", choices=["normal", "full"], required=True)
    recover.add_argument("--recovery-mount", type=Path, required=True)
    recover.add_argument("--marker", type=Path, required=True)
    recover.add_argument("--disk-by-id", required=True)
    recover.add_argument("--debian-partuuid", required=True)
    recover.add_argument("--esp-partuuid", required=True)
    recover.add_argument("--windows-partuuid", required=True)
    recover.add_argument("--image-sha256", required=True)
    recover.add_argument("--efi-sha256")
    recover.add_argument("--confirm", required=True)
    recover.add_argument("--inventory", type=Path)
    recover.add_argument(
        "--boot-environment", default="trusted-recovery-media"
    )
    recover.add_argument("--apply", action="store_true")
    recover.set_defaults(handler=_cmd_recover)

    marker = subparsers.add_parser("write-recovery-marker")
    marker.add_argument("--profile", type=Path, required=True)
    marker.add_argument("--output", type=Path, required=True)
    marker.set_defaults(handler=_cmd_marker)

    digest = subparsers.add_parser("hash")
    digest.add_argument("--kind", choices=["file", "tree", "efi-tree"], required=True)
    digest.add_argument("--path", type=Path, required=True)
    digest.set_defaults(handler=_cmd_hash)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        value = args.handler(args)
        if args.command == "inventory" and args.output is not None:
            _write_result(value, args.output)
        elif args.command != "write-recovery-marker":
            _write_result(value)
        return 0 if value.get("passed", True) else 1
    except ContractError as exc:
        _write_result({"ok": False, "error": str(exc)})
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
