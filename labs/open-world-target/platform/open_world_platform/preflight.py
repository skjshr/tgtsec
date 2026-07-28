from __future__ import annotations

import ipaddress
from dataclasses import asdict, dataclass
from typing import Any

from .model import (
    ALWAYS_MASKED_UNITS,
    FORBIDDEN_NETWORK_UNITS,
    NFS_AUXILIARY_UNITS,
    RAW_AUDIT_UNITS,
    SECONDARY_NETWORK_OWNER_UNITS,
    TRANSIENT_LAB_UNITS,
    WINDOWS_MOUNT_UNIT,
    platform_identity_mismatches,
    validate_exact_identity,
)


@dataclass(frozen=True)
class Issue:
    code: str
    detail: str

    def to_dict(self) -> dict[str, str]:
        return asdict(self)


def _required_exercise_services(manifest: dict[str, Any]) -> list[str]:
    services = manifest["services"]
    return (
        services["vulnerable"]
        + services["exerciseInfrastructure"]
        + ["open-world-telemetry.socket", WINDOWS_MOUNT_UNIT]
    )


def _all_exercise_services(manifest: dict[str, Any]) -> list[str]:
    return _required_exercise_services(manifest) + list(TRANSIENT_LAB_UNITS)


def _is_loopback_dns(value: str) -> bool:
    try:
        return ipaddress.ip_address(value).is_loopback
    except ValueError:
        return False


def _network(inventory: dict[str, Any]) -> dict[str, Any]:
    value = inventory.get("network")
    return value if isinstance(value, dict) else {}


def _services(inventory: dict[str, Any]) -> dict[str, str]:
    value = inventory.get("services")
    return value if isinstance(value, dict) else {}


def _nfs_boundary_ready(inventory: dict[str, Any]) -> bool:
    nfs = inventory.get("nfs")
    unit_files = inventory.get("unitFiles")
    firewall = _network(inventory).get("firewall")
    services = _services(inventory)
    return (
        isinstance(nfs, dict)
        and nfs.get("v4Only") is True
        and nfs.get("nfsdPort") == 2049
        and nfs.get("mountdPort") == 20048
        and isinstance(unit_files, dict)
        and all(
            unit_files.get(unit) == "masked"
            for unit in NFS_AUXILIARY_UNITS
        )
        and all(
            services.get(unit) == "inactive"
            for unit in NFS_AUXILIARY_UNITS
        )
        and isinstance(firewall, dict)
        and 20048 in firewall.get("deniedInputTcpPorts", [])
    )


def _dnsmasq_lease_ready(inventory: dict[str, Any]) -> bool:
    lease = inventory.get("dnsmasqLease")
    if not isinstance(lease, dict):
        return False
    return lease.get("directory") == {
        "path": "/run/open-world-dnsmasq",
        "kind": "directory",
        "owner": "dnsmasq",
        "group": "root",
        "mode": "0750",
    } and lease.get("file") == {
        "path": "/run/open-world-dnsmasq/dnsmasq.leases",
        "kind": "file",
        "owner": "dnsmasq",
        "group": "root",
        "mode": "0640",
    }


def _expected_dnsmasq_directives(
    manifest: dict[str, Any], profile: dict[str, Any]
) -> list[str]:
    wired = profile["network"]["wiredInterface"]
    return sorted(
        [
            f"interface={wired}",
            "except-interface=lo",
            "bind-interfaces",
            "port=0",
            "dhcp-authoritative",
            "dhcp-range=10.13.37.100,10.13.37.199,255.255.255.0,1h",
            "dhcp-option=3",
            "dhcp-option=6",
            "dhcp-leasefile=/run/open-world-dnsmasq/dnsmasq.leases",
            "log-dhcp",
        ]
    )


def _dnsmasq_policy_ready(
    manifest: dict[str, Any],
    profile: dict[str, Any],
    inventory: dict[str, Any],
) -> bool:
    policy = inventory.get("dnsmasqPolicy")
    return isinstance(policy, dict) and policy == {
        "serviceOverrideDirectives": sorted(
            [
                "[Unit]",
                "PartOf=open-world-vulnerable.target",
                "[Service]",
                "ExecStartPre=",
                (
                    "ExecStartPre=/usr/sbin/dnsmasq --test "
                    "--conf-file=/etc/dnsmasq.d/open-world-lab.conf"
                ),
                "ExecStart=",
                (
                    "ExecStart=/usr/sbin/dnsmasq "
                    "--user=dnsmasq "
                    "--conf-file=/etc/dnsmasq.d/open-world-lab.conf "
                    "--pid-file=/run/dnsmasq/dnsmasq.pid"
                ),
                "ExecStartPost=",
                "ExecStop=",
                "RuntimeDirectory=dnsmasq",
                "RuntimeDirectoryMode=0755",
            ]
        ),
        "labDirectives": _expected_dnsmasq_directives(
            manifest, profile
        ),
    }


def _dns_listeners_disabled(inventory: dict[str, Any]) -> bool:
    listeners = _network(inventory).get("listeners", [])
    if not isinstance(listeners, list):
        return False
    return not any(
        isinstance(item, dict) and item.get("port") == 53
        for item in listeners
    )


def _masked_and_inactive(
    inventory: dict[str, Any], units: tuple[str, ...]
) -> bool:
    unit_files = inventory.get("unitFiles")
    services = _services(inventory)
    return (
        isinstance(unit_files, dict)
        and all(unit_files.get(unit) == "masked" for unit in units)
        and all(services.get(unit) == "inactive" for unit in units)
    )


def _windows_mount_ready(
    profile: dict[str, Any], inventory: dict[str, Any]
) -> bool:
    mount = inventory.get("windowsMount")
    partitions = inventory.get("partitions")
    windows = (
        partitions.get("windows")
        if isinstance(partitions, dict)
        else None
    )
    if not isinstance(mount, dict) or not isinstance(windows, dict):
        return False
    options = mount.get("options")
    required_options = {"ro", "nosuid", "nodev", "noexec"}
    return (
        mount.get("sourceDevice") == windows.get("device")
        and mount.get("target") == "/mnt/windows"
        and mount.get("filesystemType") == "ntfs3"
        and mount.get("partuuid") == profile["target"]["windowsPartuuid"]
        and isinstance(options, list)
        and required_options.issubset(options)
        and "rw" not in options
    )


def evaluate_host_binding(
    manifest: dict[str, Any],
    profile: dict[str, Any],
    inventory: dict[str, Any],
) -> list[Issue]:
    issues: list[Issue] = []
    for detail in platform_identity_mismatches(manifest, inventory):
        issues.append(Issue("host.platform-identity", detail))
    boot_environment = inventory.get("bootEnvironment")
    if boot_environment not in {
        "installed-debian",
        "installed-debian-maintenance",
    }:
        issues.append(
            Issue(
                "host.boot-environment",
                "mode operation requires the installed target Debian",
            )
        )
    for detail in validate_exact_identity(profile, inventory):
        issues.append(Issue("host.target-identity", detail))
    partitions = inventory.get("partitions")
    root = inventory.get("rootFilesystem")
    debian = (
        partitions.get("debian")
        if isinstance(partitions, dict)
        else None
    )
    if (
        not isinstance(root, dict)
        or not isinstance(debian, dict)
        or root.get("sourceDevice") != debian.get("device")
        or root.get("target") != "/"
        or "/" not in (debian.get("mountpoints") or [])
    ):
        issues.append(
            Issue(
                "host.root-partition",
                "live / is not the profile Debian PARTUUID partition",
            )
        )
    return issues


def evaluate_connectivity_clean_state(
    profile: dict[str, Any],
    inventory: dict[str, Any],
) -> list[Issue]:
    trusted_state = inventory.get("trustedState")
    if not isinstance(trusted_state, dict):
        return [
            Issue(
                "state.trust-unknown",
                "trusted fresh-state evidence is missing; recovery is required",
            )
        ]
    marker = trusted_state.get("freshMarker")
    issues: list[Issue] = []
    wired_name = profile["network"]["wiredInterface"]
    network = _network(inventory)
    interfaces = network.get("interfaces")
    wired = next(
        (
            item
            for item in interfaces
            if isinstance(item, dict) and item.get("name") == wired_name
        ),
        None,
    ) if isinstance(interfaces, list) else None
    if not isinstance(wired, dict):
        issues.append(
            Issue(
                "connectivity.wired-missing",
                f"direct-link interface {wired_name} was not observed",
            )
        )
    else:
        if wired.get("up") is not False:
            issues.append(
                Issue(
                    "connectivity.wired-up",
                    f"{wired_name} must be administratively down",
                )
            )
        if wired.get("carrier") is not False:
            issues.append(
                Issue(
                    "connectivity.wired-carrier",
                    f"{wired_name} must be physically unplugged with no carrier",
                )
            )
        if wired.get("addresses") != []:
            issues.append(
                Issue(
                    "connectivity.wired-address",
                    f"{wired_name} must have no addresses",
                )
            )
    nm_policy = network.get("networkManager")
    if (
        not isinstance(nm_policy, dict)
        or nm_policy.get("wiredInterface") != wired_name
        or nm_policy.get("unmanagedConfigExact") is not True
    ):
        issues.append(
            Issue(
                "connectivity.wired-managed-policy",
                f"NetworkManager must explicitly leave {wired_name} unmanaged",
            )
        )
    if (
        _services(inventory).get("NetworkManager.service") == "active"
        and (
            not isinstance(nm_policy, dict)
            or nm_policy.get("runtimeManaged") is not False
        )
    ):
        issues.append(
            Issue(
                "connectivity.wired-managed-runtime",
                f"active NetworkManager has not proven {wired_name} unmanaged",
            )
        )
    if marker != {
        "path": "/var/lib/examserver-open-world/fresh-state.json",
        "kind": "file",
        "uid": 0,
        "mode": "0400",
        "contentValid": True,
    }:
        issues.append(
            Issue(
                "state.fresh-marker",
                "trusted fresh-state marker is absent or invalid; recovery is required",
            )
        )
    artifacts = trusted_state.get("sessionArtifactsPresent")
    if artifacts != []:
        issues.append(
            Issue(
                "state.session-residue",
                f"past/current exercise state exists; recovery is required: {artifacts!r}",
            )
        )
    return issues


def evaluate_exercise(
    manifest: dict[str, Any],
    profile: dict[str, Any],
    inventory: dict[str, Any],
    *,
    require_services: bool,
) -> list[Issue]:
    network = _network(inventory)
    issues = evaluate_host_binding(manifest, profile, inventory)
    collection_errors = inventory.get("collectionErrors", [])
    if collection_errors:
        issues.append(
            Issue(
                "inventory.incomplete",
                f"inventory collection was incomplete: {collection_errors!r}",
            )
        )
    wired_name = profile["network"]["wiredInterface"]
    expected_address = manifest["network"]["targetAddress"]
    interfaces = network.get("interfaces", [])
    if not isinstance(interfaces, list):
        interfaces = []
    by_name = {
        item.get("name"): item
        for item in interfaces
        if isinstance(item, dict) and isinstance(item.get("name"), str)
    }
    wired = by_name.get(wired_name)
    if not wired:
        issues.append(Issue("wired.missing", f"{wired_name} was not observed"))
    else:
        if wired.get("kind") != "ethernet":
            issues.append(Issue("wired.kind", f"{wired_name} is not Ethernet"))
        if str(wired.get("mac", "")).lower() != profile["network"][
            "wiredMac"
        ].lower():
            issues.append(Issue("wired.mac", f"{wired_name} MAC address does not match"))
        if wired.get("up") is not True or wired.get("carrier") is not True:
            issues.append(Issue("wired.link", f"{wired_name} is not up with carrier"))
        addresses = wired.get("addresses", [])
        if addresses != [expected_address]:
            issues.append(
                Issue(
                    "wired.address",
                    f"{wired_name} must have only {expected_address}; observed {addresses!r}",
                )
            )

    for interface in interfaces:
        if not isinstance(interface, dict):
            continue
        name = interface.get("name")
        if name not in {"lo", wired_name} and (
            interface.get("up") is True or interface.get("carrier") is True
        ):
            issues.append(
                Issue("interface.extra-active", f"unexpected active interface {name}")
            )
        if interface.get("kind") in {"wifi", "wwan", "bluetooth"} and (
            interface.get("radioBlocked") is not True
        ):
            issues.append(Issue("radio.unblocked", f"{name} radio is not blocked"))

    radio = network.get("radio")
    if not isinstance(radio, dict):
        issues.append(Issue("radio.unknown", "rfkill inventory is missing"))
    else:
        for radio_name in ("wifi", "wwan", "bluetooth"):
            if radio.get(radio_name) is False:
                issues.append(
                    Issue("radio.unblocked", f"{radio_name} radio is not blocked")
                )

    if network.get("defaultRoutesV4", []) != []:
        issues.append(Issue("route.ipv4-default", "an IPv4 default route exists"))
    if network.get("defaultRoutesV6", []) != []:
        issues.append(Issue("route.ipv6-default", "an IPv6 default route exists"))
    external_dns = [
        value
        for value in network.get("dnsServers", [])
        if isinstance(value, str)
        and not _is_loopback_dns(value)
    ]
    if external_dns:
        issues.append(
            Issue("dns.external", f"external DNS servers remain: {external_dns!r}")
        )
    if network.get("ipv4Forwarding") is not False:
        issues.append(Issue("forwarding.ipv4", "IPv4 forwarding is not disabled"))
    if network.get("ipv6Disabled") is not True:
        issues.append(Issue("ipv6.enabled", "IPv6 is not disabled"))
    firewall = network.get("firewall", {})
    if not isinstance(firewall, dict):
        firewall = {}
    if firewall.get("table") != "open_world_lab":
        issues.append(Issue("firewall.table", "exercise firewall table is not active"))
    if firewall.get("inputPolicy") != "drop":
        issues.append(Issue("firewall.input", "input policy is not drop"))
    if firewall.get("forwardPolicy") != "drop":
        issues.append(Issue("firewall.forward", "forward policy is not drop"))
    if firewall.get("outputPolicy") != "drop":
        issues.append(Issue("firewall.output", "output policy is not drop"))
    if firewall.get("allowedOutputCidrs") != [manifest["network"]["subnet"]]:
        issues.append(
            Issue("firewall.egress", "output is not limited to the direct-link subnet")
        )

    allowed = {
        ("tcp", port) for port in manifest["network"]["allowedTcpPorts"]
    } | {("udp", port) for port in manifest["network"]["allowedUdpPorts"]}
    for listener in network.get("listeners", []):
        if not isinstance(listener, dict):
            continue
        address = listener.get("address")
        if isinstance(address, str):
            try:
                if ipaddress.ip_address(address).is_loopback:
                    continue
            except ValueError:
                pass
        key = (listener.get("protocol"), listener.get("port"))
        protected_mountd = key == ("tcp", 20048) and _nfs_boundary_ready(
            inventory
        )
        if key not in allowed and not protected_mountd:
            issues.append(
                Issue(
                    "listener.unexpected",
                    f"unapproved listener {listener.get('protocol')}/"
                    f"{listener.get('port')} on {address}",
                )
            )
        if address not in {"0.0.0.0", "10.13.37.10"}:
            issues.append(
                Issue(
                    "listener.binding",
                    f"listener is bound outside loopback/target address: {address}",
                )
            )

    services = _services(inventory)
    if not _masked_and_inactive(inventory, FORBIDDEN_NETWORK_UNITS):
        issues.append(
            Issue(
                "service.forbidden-network-unit",
                "nmbd.service must remain masked and inactive; the lab exposes "
                "SMB only through smbd on TCP/445",
            )
        )
    if not _masked_and_inactive(inventory, RAW_AUDIT_UNITS):
        issues.append(
            Issue(
                "privacy.raw-audit-active",
                "auditd and systemd-journald-audit.socket must remain "
                "masked and inactive; fixed-path inotify is the only "
                "flag-read detector",
            )
        )
    if not _masked_and_inactive(
        inventory, SECONDARY_NETWORK_OWNER_UNITS
    ):
        issues.append(
            Issue(
                "network.secondary-owner",
                "systemd-networkd must remain masked and inactive; "
                "the mode controller is the sole Ethernet owner",
            )
        )
    for service in manifest["services"]["maintenanceConnectivity"]:
        if services.get(service) != "inactive":
            issues.append(
                Issue(
                    "service.connectivity-active",
                    f"maintenance connectivity service is not proven inactive: {service}",
                )
            )
    if not _nfs_boundary_ready(inventory):
        issues.append(
            Issue(
                "nfs.boundary",
                "NFS requires v4-only fixed ports, masked rpcbind, and "
                "an explicit mountd/20048 firewall deny",
            )
        )
    if not _dnsmasq_lease_ready(inventory):
        issues.append(
            Issue(
                "dnsmasq.lease-permissions",
                "dnsmasq requires its dedicated lease directory/file owned by "
                "dnsmasq:root with modes 0750/0640",
            )
        )
    if not _dnsmasq_policy_ready(manifest, profile, inventory):
        issues.append(
            Issue(
                "dnsmasq.dhcp-only-policy",
                "dnsmasq must provide direct-link DHCP only, disable its DNS "
                "listener, omit router and DNS resolver advertisements, and "
                "have no upstream resolver",
            )
        )
    if require_services:
        if not _dns_listeners_disabled(inventory):
            issues.append(
                Issue(
                    "dnsmasq.listener",
                    "dnsmasq DNS must remain disabled with no TCP/UDP 53 "
                    "listener",
                )
            )
        if not _windows_mount_ready(profile, inventory):
            issues.append(
                Issue(
                    "windows.mount",
                    "the exact Windows PARTUUID must be mounted at /mnt/windows "
                    "as ntfs3 with ro,nosuid,nodev,noexec",
                )
            )
        for service in _required_exercise_services(manifest):
            if services.get(service) != "active":
                issues.append(
                    Issue(
                        "service.exercise-inactive",
                        f"required exercise service is not active: {service}",
                    )
                )
        if inventory.get("markers", {}).get("exerciseReady") is not True:
            issues.append(
                Issue("marker.exercise", "exercise-ready marker is not present")
            )
    return issues


def evaluate_maintenance(
    manifest: dict[str, Any],
    profile: dict[str, Any],
    inventory: dict[str, Any],
    *,
    connectivity_may_be_enabled: bool,
) -> list[Issue]:
    issues = evaluate_host_binding(manifest, profile, inventory)
    collection_errors = inventory.get("collectionErrors", [])
    if collection_errors:
        issues.append(
            Issue(
                "inventory.incomplete",
                f"inventory collection was incomplete: {collection_errors!r}",
            )
        )
    services = _services(inventory)
    for service in _all_exercise_services(manifest):
        if services.get(service) != "inactive":
            issues.append(
                Issue(
                    "service.exercise-active",
                    f"exercise service is not proven inactive: {service}",
                )
            )
    for forbidden_unit in ALWAYS_MASKED_UNITS:
        if services.get(forbidden_unit) != "inactive":
            issues.append(
                Issue(
                    "service.forbidden-unit-active",
                    f"{forbidden_unit} must be observably inactive",
                )
            )
    unit_files = inventory.get("unitFiles")
    for forbidden_unit in ALWAYS_MASKED_UNITS:
        if (
            not isinstance(unit_files, dict)
            or unit_files.get(forbidden_unit) != "masked"
        ):
            issues.append(
                Issue(
                    "service.forbidden-unit-unmasked",
                    f"{forbidden_unit} must remain masked",
                )
            )
    if inventory.get("markers", {}).get("exerciseReady") is True:
        issues.append(Issue("marker.exercise", "exercise-ready marker still exists"))

    network = _network(inventory)
    wired_name = profile["network"]["wiredInterface"]
    for interface in network.get("interfaces", []):
        if (
            isinstance(interface, dict)
            and interface.get("name") == wired_name
            and manifest["network"]["targetAddress"] in interface.get("addresses", [])
        ):
            issues.append(
                Issue("wired.exercise-address", "exercise address remains configured")
            )
    if not connectivity_may_be_enabled:
        for service in manifest["services"]["maintenanceConnectivity"]:
            if services.get(service) != "inactive":
                issues.append(
                    Issue(
                        "service.connectivity-active",
                        f"maintenance connectivity is not proven inactive: {service}",
                    )
                )
        firewall = network.get("firewall", {})
        if not isinstance(firewall, dict) or firewall.get("table") != (
            "open_world_quarantine"
        ):
            issues.append(
                Issue("firewall.quarantine", "maintenance quarantine is not active")
            )
        if network.get("defaultRoutesV4", []) != []:
            issues.append(
                Issue("route.ipv4-default", "maintenance quarantine has a default route")
            )
        if network.get("defaultRoutesV6", []) != []:
            issues.append(
                Issue("route.ipv6-default", "maintenance quarantine has a default route")
            )
    else:
        chosen = profile["network"]["maintenanceConnectivityService"]
        if services.get(chosen) != "active":
            issues.append(
                Issue(
                    "service.connectivity-inactive",
                    f"selected maintenance connectivity service is not active: {chosen}",
                )
            )
    return issues


def result(mode: str, issues: list[Issue]) -> dict[str, Any]:
    return {
        "mode": mode,
        "passed": not issues,
        "issues": [issue.to_dict() for issue in issues],
    }
