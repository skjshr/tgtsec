from __future__ import annotations

import json
import platform
import re
import subprocess
import configparser
import stat
from pathlib import Path
from typing import Any

from .model import (
    ALWAYS_MASKED_UNITS,
    ContractError,
    TRANSIENT_LAB_UNITS,
    validate_manifest,
    validate_profile,
)
from .session import (
    DEFAULT_ENV_PATH,
    DEFAULT_FRESH_MARKER,
    DEFAULT_RUNTIME_ID_PATH,
    DEFAULT_STATE_PATH,
    fresh_marker_bytes,
)


def _run(
    args: list[str], *, acceptable_returncodes: set[int] | None = None
) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        args,
        check=False,
        capture_output=True,
        text=True,
        timeout=15,
    )
    acceptable = acceptable_returncodes or {0}
    if completed.returncode not in acceptable:
        stderr = completed.stderr.strip() or completed.stdout.strip()
        raise ContractError(
            f"read-only inventory command failed ({completed.returncode}): "
            f"{args!r}: {stderr}"
        )
    return completed


def _run_json(args: list[str]) -> Any:
    completed = _run(args)
    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise ContractError(f"inventory command returned invalid JSON: {args!r}") from exc


def _read_bool(path: Path, true_value: str) -> bool | None:
    try:
        return path.read_text(encoding="utf-8").strip() == true_value
    except OSError:
        return None


def _rfkill_state() -> dict[str, bool | None]:
    value = _run_json(["rfkill", "--json"])
    devices = value.get("rfkilldevices", []) if isinstance(value, dict) else []
    state: dict[str, list[bool]] = {"wifi": [], "wwan": [], "bluetooth": []}
    type_map = {
        "wlan": "wifi",
        "wifi": "wifi",
        "wireless lan": "wifi",
        "wwan": "wwan",
        "bluetooth": "bluetooth",
    }
    for device in devices:
        if not isinstance(device, dict):
            continue
        key = type_map.get(str(device.get("type", "")).lower())
        if not key:
            continue
        soft = str(device.get("soft", "")).lower()
        hard = str(device.get("hard", "")).lower()
        state[key].append(
            soft in {"blocked", "true", "1"} or hard in {"blocked", "true", "1"}
        )
    return {
        key: all(values) if values else None
        for key, values in state.items()
    }


def _interface_kind(name: str) -> str:
    if name == "lo":
        return "loopback"
    if (Path("/sys/class/net") / name / "wireless").exists():
        return "wifi"
    return "ethernet"


def _networkmanager_managed(interface: str) -> bool | None:
    completed = _run(
        [
            "nmcli",
            "--terse",
            "--get-values",
            "GENERAL.NM-MANAGED",
            "device",
            "show",
            interface,
        ],
        acceptable_returncodes={0, 8, 10},
    )
    if completed.returncode != 0:
        return None
    value = completed.stdout.strip().lower()
    if value in {"yes", "true"}:
        return True
    if value in {"no", "false"}:
        return False
    return None


def _collect_networkmanager_policy(wired_interface: str) -> dict[str, Any]:
    path = Path(
        "/etc/NetworkManager/conf.d/90-open-world-maintenance.conf"
    )
    expected = sorted(
        [
            "[main]",
            "dns=systemd-resolved",
            "[device]",
            "wifi.scan-rand-mac-address=yes",
            "[keyfile]",
            f"unmanaged-devices=interface-name:{wired_interface}",
        ]
    )
    return {
        "wiredInterface": wired_interface,
        "unmanagedConfigExact": (
            _read_dnsmasq_directives(path) == expected
        ),
        "runtimeManaged": _networkmanager_managed(wired_interface),
    }


def _collect_interfaces(radio: dict[str, bool | None]) -> list[dict[str, Any]]:
    raw = _run_json(["ip", "-json", "address", "show"])
    if not isinstance(raw, list):
        raise ContractError("ip address inventory must be a list")
    interfaces: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict) or not isinstance(item.get("ifname"), str):
            continue
        name = item["ifname"]
        kind = _interface_kind(name)
        addresses = []
        for info in item.get("addr_info", []):
            if not isinstance(info, dict) or info.get("scope") != "global":
                continue
            local = info.get("local")
            prefix = info.get("prefixlen")
            if isinstance(local, str) and isinstance(prefix, int):
                addresses.append(f"{local}/{prefix}")
        carrier = _read_bool(Path("/sys/class/net") / name / "carrier", "1")
        if name == "lo":
            carrier = True
        flags = item.get("flags", [])
        interface = {
            "name": name,
            "kind": kind,
            "mac": str(item.get("address", "")).lower(),
            "up": "UP" in flags if isinstance(flags, list) else False,
            "carrier": carrier,
            "addresses": sorted(addresses),
        }
        if kind == "wifi":
            interface["radioBlocked"] = radio["wifi"]
        interfaces.append(interface)
    return sorted(interfaces, key=lambda item: item["name"])


def _collect_routes(family_flag: str | None) -> list[dict[str, Any]]:
    args = ["ip"]
    if family_flag:
        args.append(family_flag)
    args.extend(["-json", "route", "show", "default"])
    value = _run_json(args)
    return value if isinstance(value, list) else []


def _collect_dns() -> list[str]:
    try:
        text = Path("/etc/resolv.conf").read_text(encoding="utf-8")
    except OSError as exc:
        raise ContractError(f"cannot read /etc/resolv.conf: {exc}") from exc
    values = []
    for line in text.splitlines():
        match = re.match(r"^\s*nameserver\s+(\S+)", line)
        if match:
            values.append(match.group(1))
    return sorted(set(values))


def _parse_endpoint(value: str) -> tuple[str, int] | None:
    if value.startswith("["):
        match = re.fullmatch(r"\[([^\]]+)\]:(\d+)", value)
    else:
        match = re.fullmatch(r"(.+):(\d+)", value)
    if not match:
        return None
    address = match.group(1)
    if address == "*":
        address = "0.0.0.0"
    return address, int(match.group(2))


def _collect_listeners() -> list[dict[str, Any]]:
    lines = _run(["ss", "-H", "-lntu"]).stdout.splitlines()
    listeners: list[dict[str, Any]] = []
    for line in lines:
        columns = line.split()
        if len(columns) < 5:
            continue
        endpoint = _parse_endpoint(columns[4])
        if endpoint is None:
            continue
        address, port = endpoint
        protocol = columns[0].lower()
        if protocol.startswith("tcp"):
            protocol = "tcp"
        elif protocol.startswith("udp"):
            protocol = "udp"
        listeners.append(
            {"protocol": protocol, "address": address, "port": port}
        )
    return sorted(
        listeners,
        key=lambda item: (item["protocol"], item["address"], item["port"]),
    )


def _firewall_state() -> dict[str, Any]:
    for table in ("open_world_lab", "open_world_quarantine"):
        completed = _run(
            ["nft", "list", "table", "inet", table],
            acceptable_returncodes={0, 1},
        )
        if completed.returncode != 0:
            continue
        text = completed.stdout
        policies = re.findall(r"hook\s+(input|forward|output).*?policy\s+(\w+)", text)
        policy_map = dict(policies)
        return {
            "table": table,
            "inputPolicy": policy_map.get("input"),
            "forwardPolicy": policy_map.get("forward"),
            "outputPolicy": policy_map.get("output"),
            "allowedOutputCidrs": (
                ["10.13.37.0/24"]
                if table == "open_world_lab"
                and "ip daddr 10.13.37.0/24 accept" in text
                else []
            ),
            "deniedInputTcpPorts": (
                [20048] if "tcp dport 20048 drop" in text else []
            ),
        }
    return {
        "table": None,
        "inputPolicy": None,
        "forwardPolicy": None,
        "outputPolicy": None,
        "allowedOutputCidrs": [],
        "deniedInputTcpPorts": [],
    }


def _nfs_policy_state() -> dict[str, Any]:
    path = Path("/etc/nfs.conf.d/open-world-target.conf")
    if path.is_symlink() or not path.is_file():
        return {"v4Only": False, "nfsdPort": None, "mountdPort": None}
    parser = configparser.ConfigParser()
    try:
        parser.read(path, encoding="utf-8")
        nfsd = parser["nfsd"]
        mountd = parser["mountd"]
        nfsd_port = nfsd.getint("port")
        mountd_port = mountd.getint("port")
        v4_only = (
            nfsd.get("vers2", "").strip().lower() == "n"
            and nfsd.get("vers3", "").strip().lower() == "n"
            and nfsd.get("vers4", "").strip().lower() == "y"
            and nfsd.get("udp", "").strip().lower() == "n"
            and nfsd.get("tcp", "").strip().lower() == "y"
            and nfsd_port == 2049
            and mountd_port == 20048
        )
    except (configparser.Error, KeyError, ValueError):
        return {"v4Only": False, "nfsdPort": None, "mountdPort": None}
    return {
        "v4Only": v4_only,
        "nfsdPort": nfsd_port,
        "mountdPort": mountd_port,
    }


def _collect_unit_file_states(names: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for name in names:
        completed = _run(
            ["systemctl", "is-enabled", name],
            acceptable_returncodes={0, 1, 2, 3, 4},
        )
        state = completed.stdout.strip()
        result[name] = state if state else "unknown"
    return result


def _collect_path_metadata(path: Path) -> dict[str, Any]:
    try:
        import grp
        import pwd
    except ImportError as exc:
        raise ContractError(
            "POSIX account lookup is required for live Debian inventory"
        ) from exc
    try:
        metadata = path.lstat()
    except OSError:
        return {
            "path": str(path),
            "kind": "missing",
            "owner": None,
            "group": None,
            "mode": None,
        }
    if stat.S_ISLNK(metadata.st_mode):
        kind = "symlink"
    elif stat.S_ISDIR(metadata.st_mode):
        kind = "directory"
    elif stat.S_ISREG(metadata.st_mode):
        kind = "file"
    else:
        kind = "special"
    try:
        owner = pwd.getpwuid(metadata.st_uid).pw_name
    except KeyError:
        owner = str(metadata.st_uid)
    try:
        group = grp.getgrgid(metadata.st_gid).gr_name
    except KeyError:
        group = str(metadata.st_gid)
    return {
        "path": str(path),
        "kind": kind,
        "owner": owner,
        "group": group,
        "mode": f"{metadata.st_mode & 0o7777:04o}",
    }


def _collect_trusted_state() -> dict[str, Any]:
    try:
        marker_metadata = DEFAULT_FRESH_MARKER.lstat()
    except OSError:
        marker = {
            "path": str(DEFAULT_FRESH_MARKER),
            "kind": "missing",
            "uid": None,
            "mode": None,
            "contentValid": False,
        }
    else:
        marker_kind = (
            "file"
            if stat.S_ISREG(marker_metadata.st_mode)
            else "symlink"
            if stat.S_ISLNK(marker_metadata.st_mode)
            else "other"
        )
        content_valid = False
        if marker_kind == "file":
            try:
                content_valid = (
                    DEFAULT_FRESH_MARKER.read_bytes()
                    == fresh_marker_bytes()
                )
            except OSError:
                content_valid = False
        marker = {
            "path": str(DEFAULT_FRESH_MARKER),
            "kind": marker_kind,
            "uid": marker_metadata.st_uid,
            "mode": f"{marker_metadata.st_mode & 0o7777:04o}",
            "contentValid": content_valid,
        }
    present = []
    for path in (
        DEFAULT_STATE_PATH,
        DEFAULT_ENV_PATH,
        DEFAULT_RUNTIME_ID_PATH,
    ):
        try:
            path.lstat()
        except OSError:
            continue
        present.append(str(path))
    return {
        "freshMarker": marker,
        "sessionArtifactsPresent": sorted(present),
    }


def _collect_services(manifest: dict[str, Any]) -> dict[str, str]:
    names = sorted(
        set(
            manifest["services"]["vulnerable"]
            + manifest["services"]["exerciseInfrastructure"]
            + manifest["services"]["maintenanceConnectivity"]
            + [
                "open-world-boot-quarantine.service",
                "open-world-exercise.target",
                "open-world-maintenance.target",
                "open-world-telemetry.socket",
                "open-world-vulnerable.target",
                *ALWAYS_MASKED_UNITS,
                *TRANSIENT_LAB_UNITS,
            ]
        )
    )
    result: dict[str, str] = {}
    for name in names:
        completed = _run(
            ["systemctl", "is-active", name],
            acceptable_returncodes={0, 1, 2, 3, 4},
        )
        state = completed.stdout.strip()
        result[name] = state if state else "unknown"
    return result


def _collect_packages(names: list[str]) -> dict[str, bool]:
    result: dict[str, bool] = {}
    for name in names:
        completed = _run(
            [
                "dpkg-query",
                "--show",
                "--showformat=${Status}",
                name,
            ],
            acceptable_returncodes={0, 1},
        )
        result[name] = (
            completed.returncode == 0
            and completed.stdout.strip() == "install ok installed"
        )
    return result


def _collect_platform_identity() -> dict[str, str | None]:
    try:
        os_release = platform.freedesktop_os_release()
    except OSError:
        os_release = {}
    try:
        architecture = _run(["dpkg", "--print-architecture"]).stdout.strip()
    except (ContractError, OSError):
        architecture = ""
    return {
        "osId": os_release.get("ID"),
        "osVersionId": os_release.get("VERSION_ID"),
        "dpkgArchitecture": architecture or None,
        "kernelMachine": platform.machine() or None,
    }


def _read_kernel_cmdline() -> list[str]:
    try:
        return Path("/proc/cmdline").read_text(encoding="utf-8").split()
    except OSError as exc:
        raise ContractError("could not read the kernel command line") from exc


def _read_dnsmasq_directives(path: Path) -> list[str]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    return sorted(
        line.strip()
        for line in lines
        if line.strip() and not line.lstrip().startswith("#")
    )


def _collect_dnsmasq_policy() -> dict[str, list[str]]:
    return {
        "serviceOverrideDirectives": _read_dnsmasq_directives(
            Path(
                "/etc/systemd/system/dnsmasq.service.d/"
                "90-open-world-target.conf"
            )
        ),
        "labDirectives": _read_dnsmasq_directives(
            Path("/etc/dnsmasq.d/open-world-lab.conf")
        ),
    }


def _find_lsblk_node(nodes: list[dict[str, Any]], path: str) -> dict[str, Any] | None:
    for node in nodes:
        if node.get("path") == path:
            return node
        children = node.get("children")
        if isinstance(children, list):
            found = _find_lsblk_node(children, path)
            if found:
                return found
    return None


def _find_mount(target: Path) -> dict[str, Any]:
    value = _run_json(
        [
            "findmnt",
            "--evaluate",
            "--json",
            "--target",
            str(target),
            "--output",
            "SOURCE,TARGET,FSTYPE,OPTIONS,UUID",
        ]
    )
    filesystems = value.get("filesystems", []) if isinstance(value, dict) else []
    if len(filesystems) != 1 or not isinstance(filesystems[0], dict):
        raise ContractError(f"could not independently identify mount: {target}")
    return filesystems[0]


def _normalize_mount_source(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    return re.sub(r"\[/[^\]]*\]$", "", value)


def _block_source_evidence(source: str) -> dict[str, Any]:
    if not source.startswith("/dev/"):
        return {
            "sourceDevice": source,
            "removable": False,
            "transport": None,
            "filesystemUuid": None,
            "backingDevices": [],
            "physicalDisks": [],
        }
    raw = _run_json(
        [
            "lsblk",
            "--inverse",
            "--json",
            "--bytes",
            "--output",
            "PATH,TYPE,PKNAME,RM,TRAN,UUID",
            source,
        ]
    )
    nodes = raw.get("blockdevices", []) if isinstance(raw, dict) else []
    node = _find_lsblk_node(nodes, source)
    if not isinstance(node, dict):
        raise ContractError(f"could not inspect mount source block device: {source}")
    flattened: list[dict[str, Any]] = []

    def visit(values: list[dict[str, Any]]) -> None:
        for value in values:
            if not isinstance(value, dict):
                continue
            flattened.append(value)
            children = value.get("children")
            if isinstance(children, list):
                visit(children)

    visit(nodes)
    backing_devices = sorted(
        {
            value["path"]
            for value in flattened
            if isinstance(value.get("path"), str)
        }
    )
    removable = any(bool(value.get("rm")) for value in flattened)
    physical_disks = sorted(
        {
            value["path"]
            for value in flattened
            if value.get("type") == "disk"
            and isinstance(value.get("path"), str)
        }
    )
    transport = next(
        (
            value.get("tran")
            for value in reversed(flattened)
            if value.get("tran")
        ),
        None,
    )
    return {
        "sourceDevice": source,
        "parentDevice": (
            physical_disks[0] if len(physical_disks) == 1 else source
        ),
        "backingDevices": backing_devices,
        "physicalDisks": physical_disks,
        "removable": removable,
        "transport": transport,
        "filesystemUuid": node.get("uuid"),
    }


def _collect_disk(profile: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    stable_path = Path(profile["target"]["diskById"])
    if not stable_path.exists():
        raise ContractError(f"stable target disk path does not exist: {stable_path}")
    resolved_disk = str(stable_path.resolve(strict=True))
    raw = _run_json(
        [
            "lsblk",
            "--json",
            "--bytes",
            "--output",
            "PATH,TYPE,SERIAL,WWN,SIZE,PARTUUID,MOUNTPOINTS",
        ]
    )
    nodes = raw.get("blockdevices", []) if isinstance(raw, dict) else []
    disk = _find_lsblk_node(nodes, resolved_disk)
    if not isinstance(disk, dict) or disk.get("type") != "disk":
        raise ContractError(f"target by-id did not resolve to a disk: {stable_path}")
    descendant_mountpoints: set[str] = set()
    pending = [disk]
    while pending:
        current = pending.pop()
        for mountpoint in current.get("mountpoints") or []:
            if isinstance(mountpoint, str) and mountpoint:
                descendant_mountpoints.add(mountpoint)
        pending.extend(
            child
            for child in current.get("children", [])
            if isinstance(child, dict)
        )
    target_disk = {
        "diskById": str(stable_path),
        "resolvedDevice": resolved_disk,
        "diskSerial": disk.get("serial"),
        "diskWwn": disk.get("wwn"),
        "diskSizeBytes": disk.get("size"),
        "descendantMountpoints": sorted(descendant_mountpoints),
    }
    partitions: dict[str, Any] = {}
    expected = {
        "debian": profile["target"]["debianPartuuid"],
        "esp": profile["target"]["espPartuuid"],
    }
    for label, partuuid in expected.items():
        match = None
        for child in disk.get("children", []):
            if isinstance(child, dict) and child.get("partuuid") == partuuid:
                match = child
                break
        partitions[label] = {
            "partuuid": match.get("partuuid") if match else None,
            "device": match.get("path") if match else None,
            "mountpoints": match.get("mountpoints") if match else None,
        }
    return target_disk, partitions


def collect_live_inventory(
    manifest: dict[str, Any],
    profile: dict[str, Any],
    *,
    recovery_mount: Path | None = None,
) -> dict[str, Any]:
    if platform.system() != "Linux":
        raise ContractError("live inventory is supported only on the Debian/recovery Linux")
    validate_manifest(manifest)
    validate_profile(profile)
    target_disk, partitions = _collect_disk(profile)
    root_mount = _find_mount(Path("/"))
    root_source = _normalize_mount_source(root_mount.get("source"))
    root_source_evidence = (
        _block_source_evidence(root_source)
        if isinstance(root_source, str)
        else {
            "sourceDevice": None,
            "removable": False,
            "transport": None,
            "filesystemUuid": None,
            "backingDevices": [],
            "physicalDisks": [],
        }
    )
    cmdline = _read_kernel_cmdline()
    root_filesystem = {
        "sourceDevice": root_source,
        "target": root_mount.get("target"),
        "filesystemType": root_mount.get("fstype"),
        "filesystemUuid": root_mount.get("uuid"),
        "backingDevices": root_source_evidence["backingDevices"],
        "removable": root_source_evidence["removable"],
        "transport": root_source_evidence["transport"],
    }
    if recovery_mount is not None:
        resolved_recovery = recovery_mount.resolve(strict=True)
        mount_info = _find_mount(resolved_recovery)
        source = _normalize_mount_source(mount_info.get("source"))
        if not isinstance(source, str):
            raise ContractError("could not identify recovery source device")
        evidence = _block_source_evidence(source)
        observed_uuid = mount_info.get("uuid") or evidence["filesystemUuid"]
        recovery_token = "examserver-open-world-recovery=1" in cmdline
        root_backing_devices = root_source_evidence.get("backingDevices", [])
        recovery_backing_devices = evidence.get("backingDevices", [])
        root_physical_disks = root_source_evidence.get("physicalDisks", [])
        recovery_physical_disks = evidence.get("physicalDisks", [])
        shared_physical_disks = sorted(
            set(root_physical_disks) & set(recovery_physical_disks)
        )
        root_source_removable = root_source_evidence["removable"] is True
        root_has_block_topology = bool(root_backing_devices) and bool(
            root_physical_disks
        )
        root_is_not_target = (
            isinstance(root_source, str)
            and root_source != target_disk["resolvedDevice"]
            and target_disk["resolvedDevice"] not in root_backing_devices
        )
        recovery_is_not_target = (
            source != target_disk["resolvedDevice"]
            and target_disk["resolvedDevice"] not in recovery_backing_devices
        )
        root_shares_recovery_media = (
            bool(shared_physical_disks)
            and root_source_evidence.get("transport") == "usb"
            and evidence.get("transport") == "usb"
        )
        trusted_recovery = (
            recovery_token
            and evidence["removable"] is True
            and root_source_removable
            and root_has_block_topology
            and root_is_not_target
            and recovery_is_not_target
            and root_shares_recovery_media
            and observed_uuid == profile["recovery"]["mediaUuid"]
        )
        return {
            "schemaVersion": 1,
            "platformIdentity": _collect_platform_identity(),
            "bootEnvironment": (
                "trusted-recovery-media"
                if trusted_recovery
                else "untrusted-recovery-context"
            ),
            "rootFilesystem": root_filesystem,
            "targetDisk": target_disk,
            "partitions": partitions,
            "recoveryMedia": {
                "mountPoint": str(resolved_recovery),
                "mediaUuid": observed_uuid,
                **evidence,
            },
            "bootEvidence": {
                "kernelRecoveryToken": recovery_token,
                "recoverySourceRemovable": evidence["removable"],
                "rootSource": root_source,
                "rootBackingDevices": root_backing_devices,
                "rootPhysicalDisks": root_physical_disks,
                "rootTransport": root_source_evidence.get("transport"),
                "rootSourceRemovable": root_source_removable,
                "rootSourceHasBlockTopology": root_has_block_topology,
                "rootSourceNotTarget": root_is_not_target,
                "rootSharesRecoveryMedia": root_shares_recovery_media,
                "sharedRecoveryPhysicalDisks": shared_physical_disks,
            },
        }

    radio = _rfkill_state()
    network = {
        "interfaces": _collect_interfaces(radio),
        "networkManager": _collect_networkmanager_policy(
            profile["network"]["wiredInterface"]
        ),
        "defaultRoutesV4": _collect_routes(None),
        "defaultRoutesV6": _collect_routes("-6"),
        "dnsServers": _collect_dns(),
        "listeners": _collect_listeners(),
        "ipv4Forwarding": _read_bool(Path("/proc/sys/net/ipv4/ip_forward"), "1"),
        "ipv6Disabled": _read_bool(
            Path("/proc/sys/net/ipv6/conf/all/disable_ipv6"), "1"
        ),
        "firewall": _firewall_state(),
        "radio": radio,
    }
    services = _collect_services(manifest)
    root_is_target = (
        isinstance(root_source, str)
        and root_source == partitions["debian"]["device"]
        and "/" in (partitions["debian"].get("mountpoints") or [])
    )
    firewall = network["firewall"]
    maintenance_is_live = (
        root_is_target
        and services.get("open-world-maintenance.target") == "active"
        and firewall.get("table") == "open_world_quarantine"
    )
    inventory: dict[str, Any] = {
        "schemaVersion": 1,
        "platformIdentity": _collect_platform_identity(),
        "bootEnvironment": (
            "installed-debian-maintenance"
            if maintenance_is_live
            else "installed-debian"
            if root_is_target
            else "other-linux"
        ),
        "rootFilesystem": root_filesystem,
        "targetDisk": target_disk,
        "partitions": partitions,
        "network": network,
        "services": services,
        "packages": _collect_packages(manifest["packages"]),
        "unitFiles": _collect_unit_file_states(list(ALWAYS_MASKED_UNITS)),
        "nfs": _nfs_policy_state(),
        "trustedState": _collect_trusted_state(),
        "dnsmasqLease": {
            "directory": _collect_path_metadata(
                Path("/run/open-world-dnsmasq")
            ),
            "file": _collect_path_metadata(
                Path("/run/open-world-dnsmasq/dnsmasq.leases")
            ),
        },
        "dnsmasqPolicy": _collect_dnsmasq_policy(),
        "markers": {
            "exerciseReady": Path(
                "/run/open-world-lab/exercise-ready"
            ).is_file()
        },
    }
    return inventory
