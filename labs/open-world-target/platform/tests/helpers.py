from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any

from open_world_platform.model import ALWAYS_MASKED_UNITS


PLATFORM_ROOT = Path(__file__).resolve().parents[1]


def platform_identity() -> dict[str, str]:
    return {
        "osId": "debian",
        "osVersionId": "13",
        "dpkgArchitecture": "amd64",
        "kernelMachine": "x86_64",
    }


def manifest() -> dict[str, Any]:
    return json.loads((PLATFORM_ROOT / "manifest.json").read_text(encoding="utf-8"))


def profile() -> dict[str, Any]:
    empty_hash = hashlib.sha256(b"").hexdigest()
    return {
        "schemaVersion": 1,
        "target": {
            "diskById": "/dev/disk/by-id/test-target-disk",
            "diskSerial": "TEST-SERIAL-001",
            "diskWwn": "0x5000000000000001",
            "diskSizeBytes": 512_110_190_592,
            "debianPartuuid": "11111111-1111-1111-1111-111111111111",
            "espPartuuid": "22222222-2222-2222-2222-222222222222",
            "windowsPartuuid": "33333333-3333-3333-3333-333333333333",
        },
        "network": {
            "wiredInterface": "enp1s0",
            "wiredMac": "02:13:37:00:00:10",
            "maintenanceConnectivityService": "NetworkManager.service",
        },
        "recovery": {
            "kitId": "test-kit-001",
            "mediaUuid": "44444444-4444-4444-4444-444444444444",
            "goldenBtrfsStream": {
                "path": "assets/debian-root.btrfs",
                "sha256": empty_hash,
                "filesystemUuid": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
            },
            "debianEfiArchive": {
                "path": "assets/debian-efi.tar",
                "sha256": empty_hash,
            },
            "microsoftEfiTreeSha256": empty_hash,
            "bareMetalImage": {
                "path": "assets/full-disk.img",
                "sha256": empty_hash,
            },
        },
    }


def exercise_inventory(
    manifest_value: dict[str, Any] | None = None,
) -> dict[str, Any]:
    contract = manifest_value or manifest()
    services = {
        name: "active"
        for name in (
            contract["services"]["vulnerable"]
            + contract["services"]["exerciseInfrastructure"]
            + ["open-world-telemetry.socket"]
        )
    }
    services.update(
        {
            name: "inactive"
            for name in contract["services"]["maintenanceConnectivity"]
        }
    )
    for unit in ALWAYS_MASKED_UNITS:
        services[unit] = "inactive"
    services["open-world-root-timer.service"] = "inactive"
    services["mnt-windows.mount"] = "active"
    return {
        "schemaVersion": 1,
        "platformIdentity": platform_identity(),
        "bootEnvironment": "installed-debian",
        "targetDisk": {
            "diskById": profile()["target"]["diskById"],
            "diskSerial": profile()["target"]["diskSerial"],
            "diskWwn": profile()["target"]["diskWwn"],
            "diskSizeBytes": profile()["target"]["diskSizeBytes"],
        },
        "partitions": {
            "debian": {
                "partuuid": profile()["target"]["debianPartuuid"],
                "device": "/dev/nvme0n1p3",
                "mountpoints": ["/"],
            },
            "esp": {
                "partuuid": profile()["target"]["espPartuuid"],
                "device": "/dev/nvme0n1p1",
                "mountpoints": ["/boot/efi"],
            },
            "windows": {
                "partuuid": profile()["target"]["windowsPartuuid"],
                "device": "/dev/nvme0n1p2",
                "mountpoints": ["/mnt/windows"],
            },
        },
        "windowsMount": {
            "sourceDevice": "/dev/nvme0n1p2",
            "target": "/mnt/windows",
            "filesystemType": "ntfs3",
            "options": [
                "gid=0",
                "nodev",
                "noexec",
                "nosuid",
                "ro",
                "uid=0",
                "umask=077",
            ],
            "partuuid": profile()["target"]["windowsPartuuid"],
        },
        "rootFilesystem": {
            "sourceDevice": "/dev/nvme0n1p3",
            "target": "/",
            "filesystemType": "btrfs",
        },
        "network": {
            "interfaces": [
                {
                    "name": "lo",
                    "kind": "loopback",
                    "mac": "00:00:00:00:00:00",
                    "up": True,
                    "carrier": True,
                    "addresses": [],
                },
                {
                    "name": "enp1s0",
                    "kind": "ethernet",
                    "mac": "02:13:37:00:00:10",
                    "up": True,
                    "carrier": True,
                    "addresses": ["10.13.37.10/24"],
                },
                {
                    "name": "wlp2s0",
                    "kind": "wifi",
                    "mac": "02:13:37:00:00:20",
                    "up": False,
                    "carrier": False,
                    "addresses": [],
                    "radioBlocked": True,
                },
            ],
            "defaultRoutesV4": [],
            "defaultRoutesV6": [],
            "dnsServers": ["127.0.0.53"],
            "ipv4Forwarding": False,
            "ipv6Disabled": True,
            "listeners": [
                {"protocol": "tcp", "address": "10.13.37.10", "port": 22},
                {"protocol": "tcp", "address": "0.0.0.0", "port": 80},
                {"protocol": "tcp", "address": "0.0.0.0", "port": 20048},
                {"protocol": "tcp", "address": "10.13.37.10", "port": 8787},
                {"protocol": "tcp", "address": "127.0.0.1", "port": 9000},
                {"protocol": "udp", "address": "0.0.0.0", "port": 67},
            ],
            "radio": {
                "wifi": True,
                "wwan": True,
                "bluetooth": True,
            },
            "firewall": {
                "table": "open_world_lab",
                "inputPolicy": "drop",
                "forwardPolicy": "drop",
                "outputPolicy": "drop",
                "allowedOutputCidrs": ["10.13.37.0/24"],
                "deniedInputTcpPorts": [20048],
            },
            "networkManager": {
                "wiredInterface": "enp1s0",
                "unmanagedConfigExact": True,
                "runtimeManaged": None,
            },
        },
        "services": services,
        "packages": {name: True for name in contract["packages"]},
        "unitFiles": {
            unit: "masked" for unit in ALWAYS_MASKED_UNITS
        },
        "nfs": {
            "v4Only": True,
            "nfsdPort": 2049,
            "mountdPort": 20048,
        },
        "dnsmasqLease": {
            "directory": {
                "path": "/run/open-world-dnsmasq",
                "kind": "directory",
                "owner": "dnsmasq",
                "group": "root",
                "mode": "0750",
            },
            "file": {
                "path": "/run/open-world-dnsmasq/dnsmasq.leases",
                "kind": "file",
                "owner": "dnsmasq",
                "group": "root",
                "mode": "0640",
            },
        },
        "dnsmasqPolicy": {
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
            "labDirectives": sorted(
                [
                    "interface=enp1s0",
                    "except-interface=lo",
                    "bind-interfaces",
                    "port=0",
                    "dhcp-authoritative",
                    (
                        "dhcp-range=10.13.37.100,10.13.37.199,"
                        "255.255.255.0,1h"
                    ),
                    "dhcp-option=3",
                    "dhcp-option=6",
                    (
                        "dhcp-leasefile=/run/open-world-dnsmasq/"
                        "dnsmasq.leases"
                    ),
                    "log-dhcp",
                ]
            ),
        },
        "trustedState": {
            "freshMarker": {
                "path": "/var/lib/examserver-open-world/fresh-state.json",
                "kind": "missing",
                "uid": None,
                "mode": None,
                "contentValid": False,
            },
            "sessionArtifactsPresent": [
                "/etc/examserver-open-world/session.env",
                "/run/examserver-open-world/session-id",
            ],
        },
        "markers": {"exerciseReady": True},
    }


def maintenance_inventory(
    manifest_value: dict[str, Any] | None = None,
) -> dict[str, Any]:
    contract = manifest_value or manifest()
    value = exercise_inventory(contract)
    value["bootEnvironment"] = "installed-debian-maintenance"
    for name in value["services"]:
        value["services"][name] = "inactive"
    value["markers"]["exerciseReady"] = False
    value["partitions"]["windows"]["mountpoints"] = [None]
    value["windowsMount"] = {
        "sourceDevice": None,
        "target": "/mnt/windows",
        "filesystemType": None,
        "options": [],
        "partuuid": profile()["target"]["windowsPartuuid"],
    }
    value["network"]["interfaces"][1].update(
        {"up": False, "carrier": False, "addresses": []}
    )
    value["network"]["listeners"] = []
    value["network"]["firewall"] = {
        "table": "open_world_quarantine",
        "inputPolicy": "drop",
        "forwardPolicy": "drop",
        "outputPolicy": "drop",
        "allowedOutputCidrs": [],
        "deniedInputTcpPorts": [],
    }
    value["trustedState"] = {
        "freshMarker": {
            "path": "/var/lib/examserver-open-world/fresh-state.json",
            "kind": "file",
            "uid": 0,
            "mode": "0400",
            "contentValid": True,
        },
        "sessionArtifactsPresent": [],
    }
    return value


def recovery_inventory(profile_value: dict[str, Any]) -> dict[str, Any]:
    target = profile_value["target"]
    return {
        "schemaVersion": 1,
        "platformIdentity": platform_identity(),
        "bootEnvironment": "trusted-recovery-media",
        "targetDisk": {
            "diskById": target["diskById"],
            "resolvedDevice": "/dev/nvme0n1",
            "diskSerial": target["diskSerial"],
            "diskWwn": target["diskWwn"],
            "diskSizeBytes": target["diskSizeBytes"],
        },
        "partitions": {
            "debian": {
                "partuuid": target["debianPartuuid"],
                "device": "/dev/nvme0n1p3",
                "mountpoints": [None],
            },
            "esp": {
                "partuuid": target["espPartuuid"],
                "device": "/dev/nvme0n1p1",
                "mountpoints": [None],
            },
            "windows": {
                "partuuid": target["windowsPartuuid"],
                "device": "/dev/nvme0n1p2",
                "mountpoints": [None],
            },
        },
        "recoveryMedia": {
            "mountPoint": "",
            "mediaUuid": profile_value["recovery"]["mediaUuid"],
            "sourceDevice": "/dev/sdz1",
            "parentDevice": "/dev/sdz",
            "backingDevices": ["/dev/sdz", "/dev/sdz1"],
            "physicalDisks": ["/dev/sdz"],
            "removable": True,
            "transport": "usb",
        },
        "bootEvidence": {
            "kernelRecoveryToken": True,
            "recoverySourceRemovable": True,
            "rootSource": "/dev/sdz2",
            "rootBackingDevices": ["/dev/sdz", "/dev/sdz2"],
            "rootPhysicalDisks": ["/dev/sdz"],
            "rootTransport": "usb",
            "rootSourceRemovable": True,
            "rootSourceHasBlockTopology": True,
            "rootSourceNotTarget": True,
            "rootSharesRecoveryMedia": True,
            "sharedRecoveryPhysicalDisks": ["/dev/sdz"],
        },
    }


def clone(value: dict[str, Any]) -> dict[str, Any]:
    return copy.deepcopy(value)
