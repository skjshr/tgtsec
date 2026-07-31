from __future__ import annotations

import hashlib
import ipaddress
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .model import (
    ALWAYS_MASKED_UNITS,
    ContractError,
    RAW_AUDIT_UNITS,
    load_json,
    validate_exact_identity,
    validate_platform_identity,
    validate_profile,
    validate_required_packages,
)
from .render import tree_digest


BUNDLE_ONLY_UNITS = (
    "open-world-file-watch.service",
    "open-world-nfs-watch.service",
    "open-world-root-timer.service",
    "open-world-root-timer.timer",
    "open-world-telemetry.service",
    "open-world-telemetry.socket",
)


@dataclass(frozen=True)
class InstallRequest:
    disk_by_id: str
    debian_partuuid: str
    esp_partuuid: str
    overlay_sha256: str
    confirmation: str


def validate_install_request(
    manifest: dict[str, Any],
    profile: dict[str, Any],
    inventory: dict[str, Any],
    overlay: Path,
    request: InstallRequest,
) -> dict[str, Any]:
    validate_profile(profile)
    validate_platform_identity(manifest, inventory)
    boot_environment = inventory.get("bootEnvironment")
    if boot_environment == "installed-debian":
        _validate_initial_offline_bootstrap(manifest, profile, inventory)
    elif boot_environment != "installed-debian-maintenance":
        raise ContractError(
            "platform install requires the exact installed target Debian"
        )
    debian_partition = inventory.get("partitions", {}).get("debian")
    root_filesystem = inventory.get("rootFilesystem")
    if not isinstance(debian_partition, dict) or not isinstance(
        root_filesystem, dict
    ):
        raise ContractError("live root/partition evidence is missing")
    debian_device = debian_partition.get("device")
    if (
        not isinstance(debian_device, str)
        or root_filesystem.get("sourceDevice") != debian_device
        or "/" not in (debian_partition.get("mountpoints") or [])
    ):
        raise ContractError("live / is not the profile Debian PARTUUID partition")
    identity_errors = validate_exact_identity(profile, inventory)
    if identity_errors:
        raise ContractError("; ".join(identity_errors))
    validate_required_packages(manifest, inventory)
    expected = profile["target"]
    supplied = {
        "diskById": request.disk_by_id,
        "debianPartuuid": request.debian_partuuid,
        "espPartuuid": request.esp_partuuid,
    }
    for key, value in supplied.items():
        if value != expected[key]:
            raise ContractError(f"supplied {key} does not exactly match profile")
    expected_phrase = f"INSTALL PLATFORM {expected['diskById']}"
    if request.confirmation != expected_phrase:
        raise ContractError(f"confirmation must exactly equal: {expected_phrase}")
    if not overlay.is_dir() or overlay.is_symlink():
        raise ContractError("overlay must be a real directory")
    observed_hash = tree_digest(overlay)
    if request.overlay_sha256.lower() != observed_hash:
        raise ContractError("supplied overlay image hash does not match its contents")

    install_manifest_path = (
        overlay / "usr/local/share/open-world-lab/install-manifest.json"
    )
    install_manifest = load_json(install_manifest_path)
    if install_manifest.get("schemaVersion") != 2:
        raise ContractError("generated install manifest schema is invalid")
    files = install_manifest.get("files")
    if not isinstance(files, list) or not files:
        raise ContractError("generated install manifest has no files")
    for entry in files:
        if not isinstance(entry, dict):
            raise ContractError("invalid generated install file entry")
        target = entry.get("target")
        expected_hash = entry.get("sha256")
        if not isinstance(target, str) or not target.startswith("/"):
            raise ContractError("generated install target must be absolute")
        source = overlay / target.lstrip("/")
        if not source.is_file() or source.is_symlink():
            raise ContractError(f"overlay source is missing or unsafe: {target}")
        actual_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        if actual_hash != expected_hash:
            raise ContractError(f"overlay source hash mismatch: {target}")
    return install_manifest


def _validate_initial_offline_bootstrap(
    manifest: dict[str, Any],
    profile: dict[str, Any],
    inventory: dict[str, Any],
) -> None:
    errors: list[str] = []
    if inventory.get("collectionErrors"):
        errors.append("inventory collection is incomplete")
    network = inventory.get("network")
    if not isinstance(network, dict):
        errors.append("network inventory is missing")
        network = {}
    if network.get("defaultRoutesV4", []) != []:
        errors.append("an IPv4 default route exists")
    if network.get("defaultRoutesV6", []) != []:
        errors.append("an IPv6 default route exists")
    external_dns = []
    for value in network.get("dnsServers", []):
        try:
            if not ipaddress.ip_address(value).is_loopback:
                external_dns.append(value)
        except (TypeError, ValueError):
            external_dns.append(value)
    if external_dns:
        errors.append(f"external DNS remains configured: {external_dns!r}")
    for interface in network.get("interfaces", []):
        if not isinstance(interface, dict) or interface.get("name") == "lo":
            continue
        if (
            interface.get("up") is True
            or interface.get("carrier") is True
            or interface.get("addresses")
        ):
            errors.append(
                f"non-loopback interface is not offline: {interface.get('name')}"
            )
    radio = network.get("radio")
    if not isinstance(radio, dict):
        errors.append("rfkill inventory is missing")
    else:
        for name in ("wifi", "wwan", "bluetooth"):
            if radio.get(name) is False:
                errors.append(f"{name} radio is not blocked")
    for listener in network.get("listeners", []):
        if not isinstance(listener, dict):
            errors.append("listener inventory is malformed")
            continue
        address = listener.get("address")
        try:
            loopback = ipaddress.ip_address(address).is_loopback
        except (TypeError, ValueError):
            loopback = False
        if not loopback:
            errors.append(
                "non-loopback listener remains during bootstrap: "
                f"{listener.get('protocol')}/{listener.get('port')} on {address}"
            )
    if network.get("ipv4Forwarding") is not False:
        errors.append("IPv4 forwarding is not disabled")
    services = inventory.get("services")
    if not isinstance(services, dict):
        errors.append("service inventory is missing")
    else:
        not_inactive = sorted(
            name for name, state in services.items() if state != "inactive"
        )
        if not_inactive:
            errors.append(
                "services are not proven inactive: "
                + ", ".join(not_inactive)
            )
    if inventory.get("markers", {}).get("exerciseReady") is True:
        errors.append("exercise-ready marker unexpectedly exists")
    if errors:
        raise ContractError(
            "initial platform bootstrap is not strictly offline: "
            + "; ".join(errors)
        )


def install_plan(
    profile: dict[str, Any],
    request: InstallRequest,
    install_manifest: dict[str, Any],
) -> dict[str, Any]:
    return {
        "applied": False,
        "operation": "install-platform-overlay",
        "diskById": profile["target"]["diskById"],
        "debianPartuuid": request.debian_partuuid,
        "overlaySha256": request.overlay_sha256,
        "files": [
            {"target": entry["target"], "sha256": entry["sha256"]}
            for entry in install_manifest["files"]
        ],
        "packageManifest": "/usr/local/share/open-world-lab/packages.txt",
    }


def _copy_atomic(source: Path, target: Path, mode: int) -> None:
    if target.exists() and (target.is_symlink() or not target.is_file()):
        raise ContractError(f"refusing to replace non-regular target: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{target.name}.", dir=target.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as destination, source.open("rb") as incoming:
            shutil.copyfileobj(incoming, destination)
            destination.flush()
            os.fsync(destination.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def verify_units_absent(
    units: tuple[str, ...] | list[str],
    *,
    runner=subprocess.run,
) -> None:
    for unit in units:
        completed = runner(
            [
                "systemctl",
                "show",
                "--property=LoadState",
                "--value",
                unit,
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if completed.returncode != 0 or completed.stdout.strip() != "not-found":
            detail = completed.stderr.strip() or completed.stdout.strip()
            raise ContractError(
                f"future bundle unit is unexpectedly present: {unit}: {detail}"
            )


def verify_units_masked_inactive(
    units: tuple[str, ...] | list[str],
    *,
    runner=subprocess.run,
) -> None:
    for unit in units:
        active = runner(
            ["systemctl", "is-active", unit],
            check=False,
            capture_output=True,
            text=True,
            timeout=60,
        )
        enabled = runner(
            ["systemctl", "is-enabled", unit],
            check=False,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if active.stdout.strip() != "inactive":
            raise ContractError(
                f"forbidden unit did not become inactive: {unit}: "
                f"{active.stdout.strip() or active.stderr.strip()}"
            )
        if enabled.stdout.strip() != "masked":
            raise ContractError(
                f"forbidden unit did not become masked: {unit}: "
                f"{enabled.stdout.strip() or enabled.stderr.strip()}"
            )


def disable_raw_audit_units(
    *,
    runner=subprocess.run,
) -> None:
    """Stop any optional auditd safely, then mask both raw audit consumers."""
    loaded = runner(
        [
            "systemctl",
            "show",
            "--property=LoadState",
            "--value",
            "auditd.service",
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=60,
    )
    load_state = loaded.stdout.strip()
    if loaded.returncode == 0 and load_state != "not-found":
        active = runner(
            ["systemctl", "is-active", "auditd.service"],
            check=False,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if active.stdout.strip() == "active":
            stopped = runner(
                ["service", "auditd", "stop"],
                check=False,
                capture_output=True,
                text=True,
                timeout=60,
            )
            if stopped.returncode != 0:
                detail = stopped.stderr.strip() or stopped.stdout.strip()
                raise ContractError(
                    "optional auditd could not be stopped through its "
                    f"supported control path: {detail}"
                )
        disabled = runner(
            ["systemctl", "disable", "auditd.service"],
            check=False,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if disabled.returncode != 0:
            detail = disabled.stderr.strip() or disabled.stdout.strip()
            raise ContractError(f"optional auditd could not be disabled: {detail}")
    elif loaded.returncode not in {0, 1, 4}:
        detail = loaded.stderr.strip() or load_state
        raise ContractError(f"could not inspect optional auditd: {detail}")

    for command in (
        ["systemctl", "mask", "auditd.service"],
        [
            "systemctl",
            "mask",
            "--now",
            "systemd-journald-audit.socket",
        ],
    ):
        completed = runner(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if completed.returncode != 0:
            detail = completed.stderr.strip() or completed.stdout.strip()
            raise ContractError(
                f"raw audit collection could not be masked: {command!r}: {detail}"
            )


def apply_install(
    overlay: Path,
    install_manifest: dict[str, Any],
    *,
    target_root: Path = Path("/"),
    runner=subprocess.run,
) -> dict[str, Any]:
    if os.name != "posix" or os.geteuid() != 0:
        raise ContractError("platform install mutation requires root on Debian")
    if target_root != Path("/"):
        raise ContractError("apply target_root must be exactly /")
    verify_units_absent(BUNDLE_ONLY_UNITS, runner=runner)
    for entry in install_manifest["files"]:
        source = overlay / entry["target"].lstrip("/")
        target = target_root / entry["target"].lstrip("/")
        _copy_atomic(source, target, int(entry["mode"], 8))
    generated_manifest = (
        overlay / "usr/local/share/open-world-lab/install-manifest.json"
    )
    _copy_atomic(
        generated_manifest,
        Path("/usr/local/share/open-world-lab/install-manifest.json"),
        0o644,
    )
    exercise_services = [
        "apache2.service",
        "dnsmasq.service",
        "nfs-server.service",
        "nmbd.service",
        "open-world-exercise.target",
        "open-world-vulnerable.target",
        "open-world-vulnerable-failure.service",
        "smbd.service",
        "ssh.service",
        "NetworkManager.service",
        "systemd-resolved.service",
        "wpa_supplicant.service",
    ]
    commands_before_raw_audit_mask = [
        [
            "systemd-tmpfiles",
            "--create",
            "/etc/tmpfiles.d/open-world-dnsmasq.conf",
        ],
        ["systemctl", "daemon-reload"],
        ["systemctl", "start", "open-world-boot-quarantine.service"],
        ["systemctl", "disable", "--now", *exercise_services],
    ]
    commands_after_raw_audit_mask = [
        [
            "systemctl",
            "mask",
            "--now",
            *[
                unit
                for unit in ALWAYS_MASKED_UNITS
                if unit not in RAW_AUDIT_UNITS
            ],
        ],
        [
            "systemctl",
            "enable",
            "open-world-boot-quarantine.service",
            "open-world-maintenance.target",
        ],
        ["systemctl", "start", "open-world-maintenance.target"],
    ]
    for command in commands_before_raw_audit_mask:
        completed = runner(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if completed.returncode != 0:
            message = completed.stderr.strip() or completed.stdout.strip()
            raise ContractError(
                "platform files were installed but fail-closed unit activation "
                f"failed: {command!r}: {message}"
            )
    disable_raw_audit_units(runner=runner)
    for command in commands_after_raw_audit_mask:
        completed = runner(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if completed.returncode != 0:
            message = completed.stderr.strip() or completed.stdout.strip()
            raise ContractError(
                "platform files were installed but fail-closed unit activation "
                f"failed: {command!r}: {message}"
            )
    verify_units_masked_inactive(ALWAYS_MASKED_UNITS, runner=runner)
    return {
        "applied": True,
        "operation": "install-platform-overlay",
        "filesInstalled": len(install_manifest["files"]) + 1,
        "rebootRequired": False,
        "physicalVerificationRequired": True,
    }
