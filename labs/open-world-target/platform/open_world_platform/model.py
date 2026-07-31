from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any


SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")
INTERFACE_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,15}$")
PARTUUID_RE = re.compile(r"^[A-Za-z0-9-]{8,}$")
UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
PLACEHOLDER_MARKERS = ("REPLACE_", "{{", "}}")
NFS_AUXILIARY_UNITS = (
    "rpcbind.service",
    "rpcbind.socket",
    "rpc-statd.service",
    "rpc-statd-notify.service",
)
FORBIDDEN_NETWORK_UNITS = ("nmbd.service",)
SECONDARY_NETWORK_OWNER_UNITS = ("systemd-networkd.service",)
RAW_AUDIT_UNITS = (
    "auditd.service",
    "systemd-journald-audit.socket",
)
ALWAYS_MASKED_UNITS = (
    NFS_AUXILIARY_UNITS
    + FORBIDDEN_NETWORK_UNITS
    + SECONDARY_NETWORK_OWNER_UNITS
    + RAW_AUDIT_UNITS
)
TRANSIENT_LAB_UNITS = ("open-world-root-timer.service",)


class ContractError(ValueError):
    """Raised when an operator-supplied contract cannot be trusted."""


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ContractError(f"cannot read JSON contract {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ContractError(f"JSON contract must be an object: {path}")
    return value


def canonical_json(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        + "\n"
    ).encode("utf-8")


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as source:
            while chunk := source.read(chunk_size):
                digest.update(chunk)
    except OSError as exc:
        raise ContractError(f"cannot hash {path}: {exc}") from exc
    return digest.hexdigest()


def _require_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ContractError(f"{label} must be a non-empty string")
    if any(marker in value for marker in PLACEHOLDER_MARKERS):
        raise ContractError(f"{label} still contains a placeholder")
    return value


def _require_sha256(value: Any, label: str) -> str:
    text = _require_string(value, label).lower()
    if not SHA256_RE.fullmatch(text):
        raise ContractError(f"{label} must be exactly 64 hexadecimal characters")
    return text


def validate_manifest(manifest: dict[str, Any]) -> None:
    if manifest.get("schemaVersion") != 2:
        raise ContractError("manifest schemaVersion must be 2")
    if manifest.get("labId") != "examserver-open-world-v1":
        raise ContractError("unexpected labId")

    packages = manifest.get("packages")
    if not isinstance(packages, list) or packages != sorted(set(packages)):
        raise ContractError("manifest packages must be unique and sorted")
    required_rebuild_packages = {
        "ca-certificates",
        "git",
        "nodejs",
        "npm",
    }
    if not required_rebuild_packages.issubset(packages):
        raise ContractError(
            "manifest is missing public reconstruction packages"
        )
    if "gh" in packages:
        raise ContractError(
            "GitHub CLI is forbidden; public reconstruction must be anonymous"
        )

    network = manifest.get("network")
    if not isinstance(network, dict):
        raise ContractError("manifest network must be an object")
    if network.get("targetAddress") != "10.13.37.10/24":
        raise ContractError("target address must remain 10.13.37.10/24")
    if network.get("dnsListenerEnabled") is not False:
        raise ContractError("target DNS listener must remain disabled")
    if network.get("advertiseDnsServer") is not False:
        raise ContractError("target DHCP must not advertise a DNS resolver")
    if network.get("allowUpstreamDns") is not False:
        raise ContractError("target must not allow upstream DNS")
    if network.get("allowedTcpPorts") != [22, 80, 445, 2049, 8787]:
        raise ContractError(
            "target TCP ports must be exactly 22, 80, 445, 2049, and 8787"
        )
    if network.get("allowedUdpPorts") != [67]:
        raise ContractError("target UDP ports must be exactly DHCP port 67")
    for forbidden in (
        "allowDefaultRoute",
        "allowExternalDnsServers",
        "allowIpv6",
    ):
        if network.get(forbidden) is not False:
            raise ContractError(f"manifest {forbidden} must be false")

    services = manifest.get("services")
    if not isinstance(services, dict):
        raise ContractError("manifest services must be an object")
    expected_vulnerable = {
        "apache2.service",
        "nfs-server.service",
        "open-world-root-timer.timer",
        "smbd.service",
        "ssh.service",
    }
    if set(services.get("vulnerable", [])) != expected_vulnerable:
        raise ContractError("vulnerable service contract does not match the world")
    expected_infrastructure = {
        "dnsmasq.service",
        "open-world-file-watch.service",
        "open-world-nfs-watch.service",
        "open-world-telemetry.service",
    }
    if set(services.get("exerciseInfrastructure", [])) != expected_infrastructure:
        raise ContractError(
            "exercise infrastructure contract does not match the world"
        )
    service_lists = (
        services.get("vulnerable"),
        services.get("exerciseInfrastructure"),
        services.get("maintenanceConnectivity"),
    )
    if not all(isinstance(values, list) for values in service_lists):
        raise ContractError("all service groups must be lists")
    all_services = set().union(*service_lists)
    providers = manifest.get("serviceProviders")
    if not isinstance(providers, dict) or set(providers) != all_services:
        raise ContractError("every required service must have exactly one provider")
    for service, provider in providers.items():
        if not isinstance(provider, dict):
            raise ContractError(f"service provider must be an object: {service}")
        if provider.get("kind") == "package":
            if provider.get("name") not in packages:
                raise ContractError(f"service package is not installed: {service}")
        elif provider.get("kind") == "project":
            _require_string(provider.get("owner"), f"service provider owner {service}")
        else:
            raise ContractError(f"unsupported service provider kind: {service}")

    install_files = manifest.get("installFiles")
    if not isinstance(install_files, list) or not install_files:
        raise ContractError("manifest installFiles must be a non-empty list")
    targets: set[str] = set()
    for entry in install_files:
        if not isinstance(entry, dict):
            raise ContractError("each installFiles entry must be an object")
        source = _require_string(entry.get("source"), "install source")
        target = _require_string(entry.get("target"), "install target")
        if Path(source).is_absolute() or ".." in Path(source).parts:
            raise ContractError(f"install source must stay inside platform root: {source}")
        if not target.startswith("/") or ".." in Path(target).parts:
            raise ContractError(f"install target must be an absolute safe path: {target}")
        if target in targets:
            raise ContractError(f"duplicate install target: {target}")
        targets.add(target)
        if entry.get("mode") not in {"0600", "0644", "0755"}:
            raise ContractError(f"unsupported install mode for {target}")


def validate_profile(profile: dict[str, Any]) -> None:
    if profile.get("schemaVersion") != 2:
        raise ContractError("profile schemaVersion must be 2")
    target = profile.get("target")
    network = profile.get("network")
    recovery = profile.get("recovery")
    if not all(isinstance(item, dict) for item in (target, network, recovery)):
        raise ContractError("profile target, network, and recovery must be objects")
    if "windowsPartuuid" in target:
        raise ContractError(
            "profile schemaVersion 2 must not contain windowsPartuuid"
        )
    if "microsoftEfiTreeSha256" in recovery:
        raise ContractError(
            "profile schemaVersion 2 must not contain microsoftEfiTreeSha256"
        )

    disk_by_id = _require_string(target.get("diskById"), "target.diskById")
    if not disk_by_id.startswith("/dev/disk/by-id/"):
        raise ContractError("target.diskById must use a stable /dev/disk/by-id path")
    _require_string(target.get("diskSerial"), "target.diskSerial")
    _require_string(target.get("diskWwn"), "target.diskWwn")
    if not isinstance(target.get("diskSizeBytes"), int) or target["diskSizeBytes"] <= 0:
        raise ContractError("target.diskSizeBytes must be a positive integer")
    for key in ("debianPartuuid", "espPartuuid"):
        value = _require_string(target.get(key), f"target.{key}")
        if not PARTUUID_RE.fullmatch(value):
            raise ContractError(f"target.{key} has an invalid format")

    wired_interface = _require_string(
        network.get("wiredInterface"), "network.wiredInterface"
    )
    if not INTERFACE_RE.fullmatch(wired_interface) or wired_interface == "lo":
        raise ContractError("network.wiredInterface is not a safe interface name")
    mac = _require_string(network.get("wiredMac"), "network.wiredMac")
    if not re.fullmatch(r"(?i)(?:[0-9a-f]{2}:){5}[0-9a-f]{2}", mac):
        raise ContractError("network.wiredMac must be a six-byte MAC address")
    maintenance_service = _require_string(
        network.get("maintenanceConnectivityService"),
        "network.maintenanceConnectivityService",
    )
    if maintenance_service != "NetworkManager.service":
        raise ContractError(
            "network.maintenanceConnectivityService must be "
            "NetworkManager.service"
        )

    _require_string(recovery.get("kitId"), "recovery.kitId")
    _require_string(recovery.get("mediaUuid"), "recovery.mediaUuid")
    for key in ("goldenBtrfsStream", "debianEfiArchive", "bareMetalImage"):
        asset = recovery.get(key)
        if not isinstance(asset, dict):
            raise ContractError(f"recovery.{key} must be an object")
        relative_path = Path(_require_string(asset.get("path"), f"recovery.{key}.path"))
        if relative_path.is_absolute() or ".." in relative_path.parts:
            raise ContractError(f"recovery.{key}.path must stay inside recovery media")
        _require_sha256(asset.get("sha256"), f"recovery.{key}.sha256")
    golden_uuid = _require_string(
        recovery["goldenBtrfsStream"].get("filesystemUuid"),
        "recovery.goldenBtrfsStream.filesystemUuid",
    )
    if not UUID_RE.fullmatch(golden_uuid):
        raise ContractError(
            "recovery.goldenBtrfsStream.filesystemUuid must be a full UUID"
        )


def validate_profile_against_manifest(
    manifest: dict[str, Any], profile: dict[str, Any]
) -> None:
    chosen = profile["network"]["maintenanceConnectivityService"]
    if chosen not in manifest["services"]["maintenanceConnectivity"]:
        raise ContractError(
            "profile maintenanceConnectivityService is not allowlisted by manifest"
        )


def validate_required_packages(
    manifest: dict[str, Any], inventory: dict[str, Any]
) -> None:
    observed = inventory.get("packages")
    if not isinstance(observed, dict):
        raise ContractError("installed package inventory is missing")
    missing = [
        package
        for package in manifest["packages"]
        if observed.get(package) is not True
    ]
    if missing:
        raise ContractError(
            "required Debian packages are not installed: "
            + ", ".join(missing)
        )


def platform_identity_mismatches(
    manifest: dict[str, Any], inventory: dict[str, Any]
) -> list[str]:
    observed = inventory.get("platformIdentity")
    if not isinstance(observed, dict):
        return ["live platform identity is missing"]
    expected = {
        "osId": "debian",
        "osVersionId": manifest["debian"]["release"],
        "dpkgArchitecture": manifest["debian"]["architecture"],
        "kernelMachine": "x86_64",
    }
    return [
        (
            f"platform identity mismatch for {key}: "
            f"expected {expected_value!r}, observed {observed.get(key)!r}"
        )
        for key, expected_value in expected.items()
        if observed.get(key) != expected_value
    ]


def validate_platform_identity(
    manifest: dict[str, Any], inventory: dict[str, Any]
) -> None:
    mismatches = platform_identity_mismatches(manifest, inventory)
    if mismatches:
        raise ContractError("; ".join(mismatches))


def validate_exact_disk_identity(
    profile: dict[str, Any], inventory: dict[str, Any]
) -> list[str]:
    expected = profile["target"]
    observed = inventory.get("targetDisk")
    if not isinstance(observed, dict):
        return ["inventory.targetDisk is missing"]

    mismatches: list[str] = []
    for key in ("diskById", "diskSerial", "diskWwn", "diskSizeBytes"):
        if observed.get(key) != expected.get(key):
            mismatches.append(
                f"target identity mismatch for {key}: "
                f"expected {expected.get(key)!r}, observed {observed.get(key)!r}"
            )
    return mismatches


def validate_exact_identity(
    profile: dict[str, Any], inventory: dict[str, Any]
) -> list[str]:
    expected = profile["target"]
    mismatches = validate_exact_disk_identity(profile, inventory)

    partitions = inventory.get("partitions")
    if not isinstance(partitions, dict):
        return mismatches + ["inventory.partitions is missing"]
    for label, profile_key in (
        ("debian", "debianPartuuid"),
        ("esp", "espPartuuid"),
    ):
        observed_partition = partitions.get(label)
        observed_partuuid = (
            observed_partition.get("partuuid")
            if isinstance(observed_partition, dict)
            else None
        )
        if observed_partuuid != expected.get(profile_key):
            mismatches.append(
                f"partition identity mismatch for {label}: "
                f"expected {expected.get(profile_key)!r}, "
                f"observed {observed_partuuid!r}"
            )
    return mismatches
