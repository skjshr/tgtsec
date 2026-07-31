from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from open_world_platform.install import (  # noqa: E402
    BUNDLE_ONLY_UNITS,
    InstallRequest,
    disable_raw_audit_units,
    install_plan,
    validate_install_request,
    verify_units_absent,
    verify_units_masked_inactive,
)
from open_world_platform.cli import _cmd_mode, build_parser  # noqa: E402
from open_world_platform.inventory import (  # noqa: E402
    _normalize_mount_source,
    collect_live_inventory,
)
from open_world_platform.mode import (  # noqa: E402
    enter_exercise,
    exercise_plan,
    maintenance_connectivity_plan,
    set_maintenance_connectivity,
)
from open_world_platform.model import (  # noqa: E402
    ContractError,
    validate_manifest,
    validate_profile,
)
from open_world_platform.preflight import (  # noqa: E402
    evaluate_connectivity_clean_state,
    evaluate_exercise,
    evaluate_maintenance,
)
from open_world_platform.render import (  # noqa: E402
    render_overlay,
    tree_digest,
)
from open_world_platform.session import (  # noqa: E402
    ENVIRONMENT_PARENT_MODE,
    RUNTIME_PARENT_MODE,
    fresh_marker_bytes,
    prepare_fresh_session,
    validate_fresh_marker_metadata,
)
from tests.helpers import (  # noqa: E402
    PLATFORM_ROOT,
    clone,
    exercise_inventory,
    maintenance_inventory,
    manifest,
    platform_identity,
    profile,
)


class ContractTests(unittest.TestCase):
    def test_manifest_and_complete_profile_validate(self) -> None:
        validate_manifest(manifest())
        validate_profile(profile())

    def test_manifest_requires_anonymous_public_rebuild_tools(self) -> None:
        missing_git = manifest()
        missing_git["packages"].remove("git")
        with self.assertRaisesRegex(
            ContractError, "public reconstruction packages"
        ):
            validate_manifest(missing_git)

        github_cli = manifest()
        github_cli["packages"].append("gh")
        github_cli["packages"].sort()
        with self.assertRaisesRegex(ContractError, "GitHub CLI is forbidden"):
            validate_manifest(github_cli)

    def test_profile_placeholders_fail_closed(self) -> None:
        incomplete = profile()
        incomplete["target"]["diskSerial"] = "REPLACE_WITH_SERIAL"
        with self.assertRaisesRegex(ContractError, "placeholder"):
            validate_profile(incomplete)

    def test_profile_v2_rejects_legacy_windows_fields(self) -> None:
        bad_target = profile()
        bad_target["target"]["windowsPartuuid"] = (
            "33333333-3333-3333-3333-333333333333"
        )
        with self.assertRaisesRegex(ContractError, "windowsPartuuid"):
            validate_profile(bad_target)

        bad_recovery = profile()
        bad_recovery["recovery"]["microsoftEfiTreeSha256"] = "0" * 64
        with self.assertRaisesRegex(ContractError, "microsoftEfiTreeSha256"):
            validate_profile(bad_recovery)

    def test_profile_requires_networkmanager_as_connectivity_owner(self) -> None:
        for unsafe in (
            "systemd-resolved.service",
            "wpa_supplicant.service",
        ):
            with self.subTest(service=unsafe):
                value = profile()
                value["network"]["maintenanceConnectivityService"] = unsafe
                with self.assertRaisesRegex(
                    ContractError, "must be NetworkManager"
                ):
                    validate_profile(value)

    def test_profile_requires_full_golden_btrfs_uuid(self) -> None:
        value = profile()
        value["recovery"]["goldenBtrfsStream"][
            "filesystemUuid"
        ] = "short-uuid"
        with self.assertRaisesRegex(ContractError, "full UUID"):
            validate_profile(value)

    def test_btrfs_subvolume_mount_source_normalizes_to_partition(self) -> None:
        self.assertEqual(
            _normalize_mount_source("/dev/nvme0n1p3[/@]"),
            "/dev/nvme0n1p3",
        )
        self.assertEqual(
            _normalize_mount_source("/dev/mapper/root[/@nested]"),
            "/dev/mapper/root",
        )

    def test_recovery_inventory_does_not_require_installed_debian_tools(
        self,
    ) -> None:
        contract = manifest()
        configured = profile()
        target = configured["target"]
        target_disk = {
            "diskById": target["diskById"],
            "resolvedDevice": "/dev/nvme0n1",
            "diskSerial": target["diskSerial"],
            "diskWwn": target["diskWwn"],
            "diskSizeBytes": target["diskSizeBytes"],
        }
        partitions = {
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
        }
        recovery_identity = {
            "osId": "ubuntu",
            "osVersionId": "26.04",
            "dpkgArchitecture": None,
            "kernelMachine": "x86_64",
        }
        with tempfile.TemporaryDirectory() as temp:
            recovery_mount = Path(temp).resolve()
            root_mount = {
                "source": "/dev/sdz2",
                "target": "/",
                "fstype": "ext4",
                "uuid": "55555555-5555-5555-5555-555555555555",
            }
            media_mount = {
                "source": "/dev/sdz1",
                "target": str(recovery_mount),
                "fstype": "vfat",
                "uuid": configured["recovery"]["mediaUuid"],
            }
            root_evidence = {
                "sourceDevice": "/dev/sdz2",
                "parentDevice": "/dev/sdz",
                "removable": True,
                "transport": "usb",
                "filesystemUuid": root_mount["uuid"],
                "backingDevices": ["/dev/sdz2", "/dev/sdz"],
                "physicalDisks": ["/dev/sdz"],
            }
            media_evidence = {
                "sourceDevice": "/dev/sdz1",
                "parentDevice": "/dev/sdz",
                "removable": True,
                "transport": "usb",
                "filesystemUuid": configured["recovery"]["mediaUuid"],
                "backingDevices": ["/dev/sdz1", "/dev/sdz"],
                "physicalDisks": ["/dev/sdz"],
            }
            with (
                mock.patch(
                    "open_world_platform.inventory.platform.system",
                    return_value="Linux",
                ),
                mock.patch(
                    "open_world_platform.inventory._collect_disk",
                    return_value=(target_disk, partitions),
                ),
                mock.patch(
                    "open_world_platform.inventory._find_mount",
                    side_effect=[root_mount, media_mount],
                ),
                mock.patch(
                    "open_world_platform.inventory._block_source_evidence",
                    side_effect=[root_evidence, media_evidence],
                ),
                mock.patch(
                    "open_world_platform.inventory._read_kernel_cmdline",
                    return_value=["examserver-open-world-recovery=1"],
                ),
                mock.patch(
                    "open_world_platform.inventory.platform."
                    "freedesktop_os_release",
                    return_value={
                        "ID": recovery_identity["osId"],
                        "VERSION_ID": recovery_identity["osVersionId"],
                    },
                ),
                mock.patch(
                    "open_world_platform.inventory.platform.machine",
                    return_value=recovery_identity["kernelMachine"],
                ),
                mock.patch(
                    "open_world_platform.inventory._run",
                    side_effect=FileNotFoundError("dpkg is absent"),
                ),
                mock.patch(
                    "open_world_platform.inventory._rfkill_state"
                ) as rfkill,
                mock.patch(
                    "open_world_platform.inventory._collect_services"
                ) as services,
                mock.patch(
                    "open_world_platform.inventory._collect_packages"
                ) as packages,
            ):
                observed = collect_live_inventory(
                    contract,
                    configured,
                    recovery_mount=recovery_mount,
                )
        self.assertEqual(observed["bootEnvironment"], "trusted-recovery-media")
        self.assertEqual(observed["platformIdentity"], recovery_identity)
        self.assertTrue(observed["bootEvidence"]["rootSourceRemovable"])
        self.assertTrue(observed["bootEvidence"]["rootSharesRecoveryMedia"])
        rfkill.assert_not_called()
        services.assert_not_called()
        packages.assert_not_called()

    def test_recovery_inventory_rejects_unsafe_boot_roots(self) -> None:
        contract = manifest()
        configured = profile()
        target = configured["target"]
        target_disk = {
            "diskById": target["diskById"],
            "resolvedDevice": "/dev/nvme0n1",
            "diskSerial": target["diskSerial"],
            "diskWwn": target["diskWwn"],
            "diskSizeBytes": target["diskSizeBytes"],
        }
        partitions = {
            label: {
                "partuuid": target[key],
                "device": device,
                "mountpoints": [None],
            }
            for label, key, device in (
                ("debian", "debianPartuuid", "/dev/nvme0n1p3"),
                ("esp", "espPartuuid", "/dev/nvme0n1p1"),
            )
        }
        media_evidence = {
            "sourceDevice": "/dev/sdz1",
            "parentDevice": "/dev/sdz",
            "removable": True,
            "transport": "usb",
            "filesystemUuid": configured["recovery"]["mediaUuid"],
            "backingDevices": ["/dev/sdz1", "/dev/sdz"],
            "physicalDisks": ["/dev/sdz"],
        }
        cases = {
            "overlay": (
                {
                    "source": "overlay",
                    "target": "/",
                    "fstype": "overlay",
                    "uuid": None,
                },
                {
                    "sourceDevice": "overlay",
                    "removable": False,
                    "transport": None,
                    "filesystemUuid": None,
                    "backingDevices": [],
                    "physicalDisks": [],
                },
            ),
            "unrelated internal disk": (
                {
                    "source": "/dev/sda2",
                    "target": "/",
                    "fstype": "ext4",
                    "uuid": "66666666-6666-6666-6666-666666666666",
                },
                {
                    "sourceDevice": "/dev/sda2",
                    "parentDevice": "/dev/sda",
                    "removable": False,
                    "transport": "sata",
                    "filesystemUuid": (
                        "66666666-6666-6666-6666-666666666666"
                    ),
                    "backingDevices": ["/dev/sda2", "/dev/sda"],
                    "physicalDisks": ["/dev/sda"],
                },
            ),
            "unrelated removable USB": (
                {
                    "source": "/dev/sdy2",
                    "target": "/",
                    "fstype": "ext4",
                    "uuid": "88888888-8888-8888-8888-888888888888",
                },
                {
                    "sourceDevice": "/dev/sdy2",
                    "parentDevice": "/dev/sdy",
                    "removable": True,
                    "transport": "usb",
                    "filesystemUuid": (
                        "88888888-8888-8888-8888-888888888888"
                    ),
                    "backingDevices": ["/dev/sdy2", "/dev/sdy"],
                    "physicalDisks": ["/dev/sdy"],
                },
            ),
            "target backed": (
                {
                    "source": "/dev/nvme0n1p3",
                    "target": "/",
                    "fstype": "btrfs",
                    "uuid": "77777777-7777-7777-7777-777777777777",
                },
                {
                    "sourceDevice": "/dev/nvme0n1p3",
                    "parentDevice": "/dev/nvme0n1",
                    "removable": True,
                    "transport": "usb",
                    "filesystemUuid": (
                        "77777777-7777-7777-7777-777777777777"
                    ),
                    "backingDevices": [
                        "/dev/nvme0n1p3",
                        "/dev/nvme0n1",
                    ],
                    "physicalDisks": ["/dev/nvme0n1"],
                },
            ),
        }
        for label, (root_mount, root_evidence) in cases.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temp:
                recovery_mount = Path(temp).resolve()
                media_mount = {
                    "source": "/dev/sdz1",
                    "target": str(recovery_mount),
                    "fstype": "vfat",
                    "uuid": configured["recovery"]["mediaUuid"],
                }
                with (
                    mock.patch(
                        "open_world_platform.inventory.platform.system",
                        return_value="Linux",
                    ),
                    mock.patch(
                        "open_world_platform.inventory._collect_disk",
                        return_value=(target_disk, partitions),
                    ),
                    mock.patch(
                        "open_world_platform.inventory._find_mount",
                        side_effect=[root_mount, media_mount],
                    ),
                    mock.patch(
                        "open_world_platform.inventory."
                        "_block_source_evidence",
                        side_effect=[root_evidence, media_evidence],
                    ),
                    mock.patch(
                        "open_world_platform.inventory._read_kernel_cmdline",
                        return_value=["examserver-open-world-recovery=1"],
                    ),
                    mock.patch(
                        "open_world_platform.inventory."
                        "_collect_platform_identity",
                        return_value={
                            "osId": "linux",
                            "osVersionId": "1",
                            "dpkgArchitecture": None,
                            "kernelMachine": "x86_64",
                        },
                    ),
                ):
                    observed = collect_live_inventory(
                        contract,
                        configured,
                        recovery_mount=recovery_mount,
                    )
            self.assertEqual(
                observed["bootEnvironment"],
                "untrusted-recovery-context",
            )
            self.assertFalse(
                observed["bootEvidence"]["rootSharesRecoveryMedia"]
            )

    def test_service_names_are_cross_subsystem_contract(self) -> None:
        contract = manifest()
        self.assertEqual(
            set(contract["services"]["vulnerable"]),
            {
                "apache2.service",
                "ssh.service",
                "smbd.service",
                "nfs-server.service",
                "open-world-root-timer.timer",
            },
        )
        all_services = set().union(*contract["services"].values())
        self.assertEqual(all_services, set(contract["serviceProviders"]))
        self.assertNotIn("open-world-guide.service", all_services)
        for service, provider in contract["serviceProviders"].items():
            if provider["kind"] == "package":
                self.assertIn(
                    provider["name"],
                    contract["packages"],
                    f"{service} package provider must be installed",
                )
        dns_provider = contract["serviceProviders"]["dnsmasq.service"]
        self.assertEqual(
            dns_provider["config"], "/etc/dnsmasq.d/open-world-lab.conf"
        )
        self.assertTrue(
            any(
                entry["target"] == dns_provider["config"]
                for entry in contract["installFiles"]
            )
        )


class RenderTests(unittest.TestCase):
    def test_overlay_render_is_deterministic_and_resolves_templates(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            profile_path = base / "profile.json"
            profile_path.write_text(json.dumps(profile()), encoding="utf-8")
            first = base / "first"
            second = base / "second"
            render_overlay(PLATFORM_ROOT / "manifest.json", profile_path, first)
            render_overlay(PLATFORM_ROOT / "manifest.json", profile_path, second)
            self.assertEqual(tree_digest(first), tree_digest(second))
            self.assertFalse(
                (
                    first
                    / "etc/systemd/network/80-open-world-wired.network"
                ).exists()
            )
            self.assertFalse(
                any(
                    entry["target"].startswith("/etc/systemd/network/")
                    for entry in manifest()["installFiles"]
                )
            )
            networkmanager = (
                first
                / "etc/NetworkManager/conf.d/"
                "90-open-world-maintenance.conf"
            ).read_text(encoding="utf-8")
            self.assertIn(
                "unmanaged-devices=interface-name:enp1s0",
                networkmanager,
            )
            self.assertNotIn("{{", networkmanager)
            firewall = (
                first / "etc/nftables.d/open-world-exercise.nft"
            ).read_text(encoding="utf-8")
            self.assertIn(
                "ip saddr 10.13.37.0/24 icmp type echo-request accept",
                firewall,
            )
            self.assertIn(
                "type filter hook output priority filter; policy drop;",
                firewall,
            )
            packages = (
                first / "usr/local/share/open-world-lab/packages.txt"
            ).read_text(encoding="utf-8").splitlines()
            self.assertEqual(packages, sorted(set(packages)))
            dnsmasq = (
                first / "etc/dnsmasq.d/open-world-lab.conf"
            ).read_text(encoding="utf-8")
            self.assertIn(
                "dhcp-leasefile=/run/open-world-dnsmasq/dnsmasq.leases",
                dnsmasq,
            )
            self.assertNotIn("dhcp-leasefile=/run/open-world-lab/", dnsmasq)
            for directive in (
                "interface=enp1s0",
                "except-interface=lo",
                "bind-interfaces",
                "port=0",
                "dhcp-option=3",
                "dhcp-option=6",
            ):
                self.assertIn(directive, dnsmasq.splitlines())
            self.assertFalse(
                any(
                    line.startswith(
                        (
                            "auth-server=",
                            "auth-zone=",
                            "host-record=",
                            "local=",
                            "listen-address=",
                        )
                    )
                    for line in dnsmasq.splitlines()
                )
            )
            self.assertFalse(
                any(
                    line.startswith("server=")
                    or line.startswith("resolv-file=")
                    for line in dnsmasq.splitlines()
                )
            )
            dnsmasq_override = (
                first
                / "etc/systemd/system/dnsmasq.service.d/"
                "90-open-world-target.conf"
            ).read_text(encoding="utf-8")
            self.assertIn("ExecStartPre=\n", dnsmasq_override)
            self.assertIn("ExecStart=\n", dnsmasq_override)
            self.assertIn("ExecStartPost=\n", dnsmasq_override)
            self.assertIn("ExecStop=\n", dnsmasq_override)
            self.assertIn(
                "ExecStart=/usr/sbin/dnsmasq "
                "--user=dnsmasq "
                "--conf-file=/etc/dnsmasq.d/open-world-lab.conf "
                "--pid-file=/run/dnsmasq/dnsmasq.pid",
                dnsmasq_override,
            )
            self.assertNotIn("systemd-helper", dnsmasq_override)
            self.assertIn("--user=dnsmasq", dnsmasq_override)
            self.assertNotIn(53, manifest()["network"]["allowedTcpPorts"])
            self.assertNotIn(53, manifest()["network"]["allowedUdpPorts"])
            self.assertNotIn(8080, manifest()["network"]["allowedTcpPorts"])
            self.assertIn(8787, manifest()["network"]["allowedTcpPorts"])
            self.assertIn("tcp dport { 22, 80, 445, 2049, 8787 }", firewall)
            self.assertNotIn("udp dport 53", firewall)
            tmpfiles = (
                first / "etc/tmpfiles.d/open-world-dnsmasq.conf"
            ).read_text(encoding="utf-8")
            self.assertIn(
                "d /run/open-world-dnsmasq 0750 dnsmasq root -",
                tmpfiles,
            )
            self.assertIn(
                "f /run/open-world-dnsmasq/dnsmasq.leases 0640 dnsmasq root -",
                tmpfiles,
            )
            self.assertNotIn(139, manifest()["network"]["allowedTcpPorts"])
            self.assertFalse(
                (first / "etc/systemd/system/mnt-windows.mount").exists()
            )

    def test_render_refuses_nonempty_output(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            profile_path = base / "profile.json"
            profile_path.write_text(json.dumps(profile()), encoding="utf-8")
            output = base / "output"
            output.mkdir()
            (output / "owned-by-operator.txt").write_text("keep", encoding="utf-8")
            with self.assertRaisesRegex(ContractError, "must be empty"):
                render_overlay(PLATFORM_ROOT / "manifest.json", profile_path, output)


class PreflightTests(unittest.TestCase):
    def setUp(self) -> None:
        self.manifest = manifest()
        self.profile = profile()

    def test_exercise_ready_inventory_passes(self) -> None:
        issues = evaluate_exercise(
            self.manifest,
            self.profile,
            exercise_inventory(self.manifest),
            require_services=True,
        )
        self.assertEqual(issues, [])

    def test_each_external_path_fails_closed(self) -> None:
        mutations = {
            "default route": lambda value: value["network"][
                "defaultRoutesV4"
            ].append({"dst": "default", "gateway": "10.13.37.1"}),
            "external DNS": lambda value: value["network"]["dnsServers"].append(
                "1.1.1.1"
            ),
            "extra interface": lambda value: value["network"]["interfaces"][
                2
            ].update({"up": True, "carrier": True, "radioBlocked": False}),
            "unexpected listener": lambda value: value["network"][
                "listeners"
            ].append({"protocol": "tcp", "address": "0.0.0.0", "port": 3306}),
            "forwarding": lambda value: value["network"].update(
                {"ipv4Forwarding": True}
            ),
            "connectivity service": lambda value: value["services"].update(
                {"NetworkManager.service": "active"}
            ),
            "Bluetooth radio": lambda value: value["network"]["radio"].update(
                {"bluetooth": False}
            ),
            "NFSv3 enabled": lambda value: value["nfs"].update(
                {"v4Only": False}
            ),
            "rpcbind unmasked": lambda value: value["unitFiles"].update(
                {"rpcbind.service": "disabled"}
            ),
            "rpcbind socket active": lambda value: (
                value["services"].update({"rpcbind.socket": "active"}),
                value["network"]["listeners"].append(
                    {
                        "protocol": "tcp",
                        "address": "0.0.0.0",
                        "port": 111,
                    }
                ),
            ),
            "rpc statd active": lambda value: (
                value["services"].update({"rpc-statd.service": "active"}),
                value["network"]["listeners"].append(
                    {
                        "protocol": "udp",
                        "address": "0.0.0.0",
                        "port": 48731,
                    }
                ),
            ),
            "mountd not explicitly denied": lambda value: value["network"][
                "firewall"
            ].update({"deniedInputTcpPorts": []}),
            "nmbd active": lambda value: value["services"].update(
                {"nmbd.service": "active"}
            ),
            "nmbd unmasked": lambda value: value["unitFiles"].update(
                {"nmbd.service": "disabled"}
            ),
            "auditd active": lambda value: value["services"].update(
                {"auditd.service": "active"}
            ),
            "journald audit socket unmasked": lambda value: value[
                "unitFiles"
            ].update({"systemd-journald-audit.socket": "enabled"}),
            "systemd-networkd active": lambda value: value[
                "services"
            ].update({"systemd-networkd.service": "active"}),
            "SMB NetBIOS listener": lambda value: value["network"][
                "listeners"
            ].append(
                {"protocol": "tcp", "address": "0.0.0.0", "port": 139}
            ),
            "dnsmasq lease not writable": lambda value: value[
                "dnsmasqLease"
            ]["file"].update({"owner": "root"}),
            "dnsmasq upstream configured": lambda value: value[
                "dnsmasqPolicy"
            ]["labDirectives"].append("server=1.1.1.1"),
            "dnsmasq Debian helper restored": lambda value: value[
                "dnsmasqPolicy"
            ]["serviceOverrideDirectives"].append(
                "ExecStart=/usr/share/dnsmasq/systemd-helper exec"
            ),
            "dnsmasq DHCP advertises target DNS": lambda value: value[
                "dnsmasqPolicy"
            ]["labDirectives"].append("dhcp-option=6,10.13.37.10"),
            "DNS TCP listener enabled": lambda value: value["network"][
                "listeners"
            ].append(
                {
                    "protocol": "tcp",
                    "address": "10.13.37.10",
                    "port": 53,
                }
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                value = exercise_inventory(self.manifest)
                mutate(value)
                self.assertTrue(
                    evaluate_exercise(
                        self.manifest,
                        self.profile,
                        value,
                        require_services=True,
                    )
                )

    def test_maintenance_requires_every_lab_service_stopped(self) -> None:
        good = maintenance_inventory(self.manifest)
        self.assertEqual(
            evaluate_maintenance(
                self.manifest,
                self.profile,
                good,
                connectivity_may_be_enabled=False,
            ),
            [],
        )
        bad = clone(good)
        bad["services"]["smbd.service"] = "active"
        issues = evaluate_maintenance(
            self.manifest,
            self.profile,
            bad,
            connectivity_may_be_enabled=False,
        )
        self.assertIn("service.exercise-active", {item.code for item in issues})
        connectivity = clone(good)
        connectivity["services"]["NetworkManager.service"] = "active"
        issues = evaluate_maintenance(
            self.manifest,
            self.profile,
            connectivity,
            connectivity_may_be_enabled=False,
        )
        self.assertIn(
            "service.connectivity-active", {item.code for item in issues}
        )

    def test_preflight_rejects_other_host_and_wrong_root_partition(self) -> None:
        for label, mutate in {
            "other Linux": lambda value: value.update(
                {"bootEnvironment": "other-linux"}
            ),
            "trusted recovery": lambda value: value.update(
                {"bootEnvironment": "trusted-recovery-media"}
            ),
            "wrong root": lambda value: value["rootFilesystem"].update(
                {"sourceDevice": "/dev/sdz2"}
            ),
        }.items():
            with self.subTest(label=label):
                unsafe = maintenance_inventory(self.manifest)
                mutate(unsafe)
                issues = evaluate_maintenance(
                    self.manifest,
                    self.profile,
                    unsafe,
                    connectivity_may_be_enabled=False,
                )
                self.assertTrue(
                    any(issue.code.startswith("host.") for issue in issues)
                )

    def test_preflight_requires_exact_debian_13_amd64_identity(self) -> None:
        wrong_values = {
            "osId": "ubuntu",
            "osVersionId": "12",
            "dpkgArchitecture": "arm64",
            "kernelMachine": "aarch64",
        }
        for field, wrong in wrong_values.items():
            with self.subTest(field=field):
                unsafe = maintenance_inventory(self.manifest)
                unsafe["platformIdentity"][field] = wrong
                issues = evaluate_maintenance(
                    self.manifest,
                    self.profile,
                    unsafe,
                    connectivity_may_be_enabled=False,
                )
                self.assertIn(
                    "host.platform-identity",
                    {issue.code for issue in issues},
                )

    def test_connectivity_postflight_requires_networkmanager_active(self) -> None:
        inactive = maintenance_inventory(self.manifest)
        issues = evaluate_maintenance(
            self.manifest,
            self.profile,
            inactive,
            connectivity_may_be_enabled=True,
        )
        self.assertIn(
            "service.connectivity-inactive",
            {issue.code for issue in issues},
        )
        active = clone(inactive)
        active["services"]["NetworkManager.service"] = "active"
        active["network"]["networkManager"]["runtimeManaged"] = False
        self.assertEqual(
            evaluate_maintenance(
                self.manifest,
                self.profile,
                active,
                connectivity_may_be_enabled=True,
            ),
            [],
        )


class ModeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.manifest = manifest()
        self.profile = profile()

    def test_dry_run_never_invokes_runner(self) -> None:
        called = False

        def forbidden_runner(*args, **kwargs):
            nonlocal called
            called = True
            raise AssertionError("runner must not execute in dry-run")

        result = enter_exercise(
            self.manifest,
            self.profile,
            maintenance_inventory(self.manifest),
            apply=False,
            confirmation=None,
            runner=forbidden_runner,
        )
        self.assertFalse(result["applied"])
        self.assertFalse(called)
        self.assertEqual(
            result["sessionPlan"]["before"], "open-world-exercise.target"
        )

    def test_live_plan_parsers_do_not_assume_wrong_boot_environment(self) -> None:
        parser = build_parser()
        mode_args = parser.parse_args(
            ["mode", "--profile", "profile.json", "--to", "exercise"]
        )
        self.assertIsNone(mode_args.boot_environment)
        install_args = parser.parse_args(
            [
                "install",
                "--profile",
                "profile.json",
                "--overlay",
                "overlay",
                "--overlay-sha256",
                "0" * 64,
                "--disk-by-id",
                "/dev/disk/by-id/example",
                "--debian-partuuid",
                "debian-partuuid",
                "--esp-partuuid",
                "esp-partuuid",
                "--confirm",
                "INSTALL PLATFORM /dev/disk/by-id/example",
            ]
        )
        self.assertIsNone(install_args.boot_environment)

    def test_exercise_plan_stops_services_before_firewall_and_start(self) -> None:
        plan = exercise_plan(
            self.manifest,
            self.profile,
            maintenance_inventory(self.manifest),
        )
        purposes = [item.purpose for item in plan]
        stop_index = purposes.index(
            "stop every lab-facing service during the transition"
        )
        firewall_index = purposes.index(
            "install the subnet-only exercise firewall"
        )
        self.assertLess(stop_index, firewall_index)
        stop_command = next(
            item.args
            for item in plan
            if item.purpose
            == "stop every lab-facing service during the transition"
        )
        self.assertIn("open-world-root-timer.service", stop_command)
        self.assertNotIn(
            ("systemctl", "start", "open-world-exercise.target"),
            [item.args for item in plan],
        )

    def test_connectivity_cannot_enable_while_service_is_active(self) -> None:
        unsafe = maintenance_inventory(self.manifest)
        unsafe["services"]["apache2.service"] = "active"
        with self.assertRaisesRegex(ContractError, "remains blocked"):
            set_maintenance_connectivity(
                self.manifest,
                self.profile,
                unsafe,
                enabled=True,
                apply=False,
                confirmation=None,
            )

    def test_connectivity_requires_fresh_recovered_state(self) -> None:
        for label, mutate in {
            "fresh marker consumed": lambda value: value[
                "trustedState"
            ]["freshMarker"].update(
                {
                    "kind": "missing",
                    "uid": None,
                    "mode": None,
                    "contentValid": False,
                }
            ),
            "session residue": lambda value: value[
                "trustedState"
            ].update(
                {
                    "sessionArtifactsPresent": [
                        "/etc/examserver-open-world/session.env"
                    ]
                }
            ),
        }.items():
            with self.subTest(label=label):
                unsafe = maintenance_inventory(self.manifest)
                mutate(unsafe)
                with self.assertRaisesRegex(
                    ContractError, "recovery is required"
                ):
                    set_maintenance_connectivity(
                        self.manifest,
                        self.profile,
                        unsafe,
                        enabled=True,
                        apply=False,
                        confirmation=None,
                    )

    def test_connectivity_plan_starts_firewall_before_wifi(self) -> None:
        plan = maintenance_connectivity_plan(
            self.manifest, self.profile, enabled=True
        )
        self.assertEqual(
            plan[0].args,
            ("ip", "link", "set", "dev", "enp1s0", "down"),
        )
        self.assertEqual(
            plan[1].args,
            ("ip", "address", "flush", "dev", "enp1s0"),
        )
        self.assertEqual(
            plan[2].args,
            ("systemctl", "restart", "nftables.service"),
        )
        self.assertEqual(plan[4].args, ("rfkill", "unblock", "wifi"))

    def test_connectivity_requires_direct_link_physical_separation(
        self,
    ) -> None:
        mutations = {
            "wired up": lambda value: value["network"]["interfaces"][
                1
            ].update({"up": True}),
            "wired carrier": lambda value: value["network"]["interfaces"][
                1
            ].update({"carrier": True}),
            "wired address": lambda value: value["network"]["interfaces"][
                1
            ].update({"addresses": ["10.13.37.10/24"]}),
            "not explicitly unmanaged": lambda value: value["network"][
                "networkManager"
            ].update({"unmanagedConfigExact": False}),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                unsafe = maintenance_inventory(self.manifest)
                mutate(unsafe)
                with self.assertRaisesRegex(
                    ContractError, "remains blocked"
                ):
                    set_maintenance_connectivity(
                        self.manifest,
                        self.profile,
                        unsafe,
                        enabled=True,
                        apply=False,
                        confirmation=None,
                    )

        active_but_managed = maintenance_inventory(self.manifest)
        active_but_managed["services"]["NetworkManager.service"] = "active"
        active_but_managed["network"]["networkManager"][
            "runtimeManaged"
        ] = True
        issues = evaluate_connectivity_clean_state(
            self.profile,
            active_but_managed,
        )
        self.assertIn(
            "connectivity.wired-managed-runtime",
            {issue.code for issue in issues},
        )

    def test_connectivity_apply_ignores_fake_inventory_and_uses_live(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            profile_path = root / "profile.json"
            profile_path.write_text(
                json.dumps(self.profile), encoding="utf-8"
            )
            fake_inventory = root / "fake-safe.json"
            fake_inventory.write_text(
                json.dumps(maintenance_inventory(self.manifest)),
                encoding="utf-8",
            )
            unsafe_live = maintenance_inventory(self.manifest)
            unsafe_live["services"]["apache2.service"] = "active"
            args = SimpleNamespace(
                manifest=PLATFORM_ROOT / "manifest.json",
                profile=profile_path,
                inventory=fake_inventory,
                apply=True,
                to="connectivity-on",
                confirm="ENABLE MAINTENANCE CONNECTIVITY",
                boot_environment="installed-debian-maintenance",
            )
            with mock.patch(
                "open_world_platform.cli.collect_live_inventory",
                return_value=unsafe_live,
            ) as collect:
                with self.assertRaisesRegex(ContractError, "remains blocked"):
                    _cmd_mode(args)
            collect.assert_called_once()


class SessionTests(unittest.TestCase):
    def test_session_parent_policy_preserves_event_key_traversal(self) -> None:
        self.assertEqual(ENVIRONMENT_PARENT_MODE, 0o711)
        self.assertEqual(RUNTIME_PARENT_MODE, 0o750)

    def test_fresh_marker_metadata_is_a_final_trust_gate(self) -> None:
        validate_fresh_marker_metadata(uid=0, mode=0o400)
        for uid, mode in ((1000, 0o400), (0, 0o440), (0, 0o600)):
            with self.subTest(uid=uid, mode=oct(mode)):
                with self.assertRaisesRegex(ContractError, "root-owned"):
                    validate_fresh_marker_metadata(uid=uid, mode=mode)

    def test_fresh_session_is_atomic_consistent_and_consumes_marker(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            marker = root / "state/fresh-state.json"
            marker.parent.mkdir(parents=True)
            marker.write_bytes(fresh_marker_bytes())
            # Some development hosts cannot unlink a read-only file; exact
            # 0400 enforcement is covered by the metadata contract test above.
            marker.chmod(0o600 if os.name == "nt" else 0o400)
            state = root / "state/telemetry-state.json"
            environment = root / "etc/session.env"
            runtime = root / "run/session-id"
            ownership = []
            # A non-root Linux CI user cannot create a uid-0 fixture. The
            # exact uid/mode rejection is covered independently above.
            with mock.patch(
                "open_world_platform.session.validate_fresh_marker_metadata"
            ):
                session_id = prepare_fresh_session(
                    fresh_marker=marker,
                    state_path=state,
                    environment_path=environment,
                    runtime_id_path=runtime,
                    session_factory=lambda: "exercise-test-001",
                    bridge_token_factory=lambda: "a" * 64,
                    group_lookup=lambda name: {
                        "lab-telemetry": 1103,
                        "lab-events": 1202,
                    }[name],
                    chown=lambda path, uid, gid: ownership.append(
                        (path.name, uid, gid)
                    ),
                )
            self.assertEqual(session_id, "exercise-test-001")
            self.assertEqual(
                environment.read_text(encoding="ascii"),
                "LAB_SESSION_ID=exercise-test-001\n"
                f"TELEMETRY_BRIDGE_TOKEN={'a' * 64}\n",
            )
            self.assertEqual(
                runtime.read_text(encoding="ascii"), "exercise-test-001\n"
            )
            self.assertFalse(marker.exists())
            self.assertEqual(
                ownership,
                [
                    (environment.parent.name, 0, 0),
                    (runtime.parent.name, 0, 1202),
                    (environment.name, 0, 1103),
                    (runtime.name, 0, 1202),
                ],
            )
            if os.name == "posix":
                self.assertEqual(
                    environment.parent.stat().st_mode & 0o777, 0o711
                )
                self.assertEqual(runtime.parent.stat().st_mode & 0o777, 0o750)

    def test_stale_state_blocks_session_creation_without_writes(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            marker = root / "fresh-state.json"
            marker.write_bytes(fresh_marker_bytes())
            marker.chmod(0o400)
            state = root / "telemetry-state.json"
            state.write_text("stale", encoding="utf-8")
            environment = root / "session.env"
            runtime = root / "session-id"
            with mock.patch(
                "open_world_platform.session.validate_fresh_marker_metadata"
            ), self.assertRaisesRegex(ContractError, "trusted restore"):
                prepare_fresh_session(
                    fresh_marker=marker,
                    state_path=state,
                    environment_path=environment,
                    runtime_id_path=runtime,
                    session_factory=lambda: "exercise-test-002",
                    group_lookup=lambda name: 1,
                    chown=lambda path, uid, gid: None,
                )
            self.assertFalse(environment.exists())
            self.assertFalse(runtime.exists())

    def test_fresh_session_rejects_an_unsafe_bridge_token_without_writes(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            marker = root / "fresh-state.json"
            marker.write_bytes(fresh_marker_bytes())
            marker.chmod(0o600 if os.name == "nt" else 0o400)
            environment = root / "session.env"
            runtime = root / "session-id"
            with mock.patch(
                "open_world_platform.session.validate_fresh_marker_metadata"
            ), self.assertRaisesRegex(ContractError, "unsafe token"):
                prepare_fresh_session(
                    fresh_marker=marker,
                    state_path=root / "telemetry-state.json",
                    environment_path=environment,
                    runtime_id_path=runtime,
                    session_factory=lambda: "exercise-test-003",
                    bridge_token_factory=lambda: "unsafe\nvalue",
                    group_lookup=lambda name: 1,
                    chown=lambda path, uid, gid: None,
                )
            self.assertTrue(marker.exists())
            self.assertFalse(environment.exists())
            self.assertFalse(runtime.exists())


class InstallGuardTests(unittest.TestCase):
    def test_raw_audit_consumers_are_stopped_and_masked(self) -> None:
        calls = []

        class Completed:
            returncode = 0
            stderr = ""

            def __init__(self, stdout=""):
                self.stdout = stdout

        def runner(args, **kwargs):
            calls.append(args)
            if args[:4] == [
                "systemctl",
                "show",
                "--property=LoadState",
                "--value",
            ]:
                return Completed("loaded\n")
            if args[:2] == ["systemctl", "is-active"]:
                return Completed("active\n")
            return Completed()

        disable_raw_audit_units(runner=runner)
        self.assertIn(["service", "auditd", "stop"], calls)
        self.assertIn(
            ["systemctl", "mask", "auditd.service"], calls
        )
        self.assertIn(
            [
                "systemctl",
                "mask",
                "--now",
                "systemd-journald-audit.socket",
            ],
            calls,
        )

    def test_platform_first_install_requires_bundle_units_to_be_absent(
        self,
    ) -> None:
        calls = []

        class Completed:
            returncode = 0
            stderr = ""

            def __init__(self, stdout):
                self.stdout = stdout

        def absent_runner(args, **kwargs):
            calls.append(args)
            return Completed("not-found\n")

        verify_units_absent(BUNDLE_ONLY_UNITS, runner=absent_runner)
        self.assertEqual(len(calls), len(BUNDLE_ONLY_UNITS))

        def loaded_runner(args, **kwargs):
            return Completed("loaded\n")

        with self.assertRaisesRegex(ContractError, "unexpectedly present"):
            verify_units_absent(
                ["open-world-telemetry.service"],
                runner=loaded_runner,
            )

    def test_forbidden_units_require_exact_masked_inactive_state(self) -> None:
        states = {
            ("is-active", "nmbd.service"): "inactive\n",
            ("is-enabled", "nmbd.service"): "masked\n",
        }

        class Completed:
            returncode = 0
            stderr = ""

            def __init__(self, stdout):
                self.stdout = stdout

        def runner(args, **kwargs):
            return Completed(states[(args[1], args[2])])

        verify_units_masked_inactive(["nmbd.service"], runner=runner)
        states[("is-enabled", "nmbd.service")] = "disabled\n"
        with self.assertRaisesRegex(ContractError, "did not become masked"):
            verify_units_masked_inactive(["nmbd.service"], runner=runner)

    def test_install_is_a_verified_plan_by_default(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            profile_value = profile()
            profile_path = base / "profile.json"
            profile_path.write_text(json.dumps(profile_value), encoding="utf-8")
            overlay = base / "overlay"
            render_overlay(PLATFORM_ROOT / "manifest.json", profile_path, overlay)
            overlay_hash = tree_digest(overlay)
            inventory = {
                "platformIdentity": platform_identity(),
                "bootEnvironment": "installed-debian-maintenance",
                "targetDisk": {
                    "diskById": profile_value["target"]["diskById"],
                    "diskSerial": profile_value["target"]["diskSerial"],
                    "diskWwn": profile_value["target"]["diskWwn"],
                    "diskSizeBytes": profile_value["target"]["diskSizeBytes"],
                },
                "partitions": {
                    "debian": {
                        "partuuid": profile_value["target"]["debianPartuuid"],
                        "device": "/dev/nvme0n1p3",
                        "mountpoints": ["/"],
                    },
                    "esp": {"partuuid": profile_value["target"]["espPartuuid"]},
                },
                "rootFilesystem": {
                    "sourceDevice": "/dev/nvme0n1p3",
                    "target": "/",
                },
                "packages": {
                    name: True for name in manifest()["packages"]
                },
            }
            request = InstallRequest(
                disk_by_id=profile_value["target"]["diskById"],
                debian_partuuid=profile_value["target"]["debianPartuuid"],
                esp_partuuid=profile_value["target"]["espPartuuid"],
                overlay_sha256=overlay_hash,
                confirmation=(
                    "INSTALL PLATFORM " + profile_value["target"]["diskById"]
                ),
            )
            generated = validate_install_request(
                manifest(),
                profile_value,
                inventory,
                overlay,
                request,
            )
            result = install_plan(profile_value, request, generated)
            self.assertFalse(result["applied"])
            self.assertGreater(len(result["files"]), 5)

            bootstrap = maintenance_inventory(manifest())
            bootstrap["bootEnvironment"] = "installed-debian"
            bootstrap["network"]["firewall"] = {
                "table": None,
                "inputPolicy": None,
                "forwardPolicy": None,
                "outputPolicy": None,
                "allowedOutputCidrs": [],
                "deniedInputTcpPorts": [],
            }
            bootstrap_generated = validate_install_request(
                manifest(),
                profile_value,
                bootstrap,
                overlay,
                request,
            )
            self.assertEqual(bootstrap_generated, generated)
            unsafe_bootstrap = clone(bootstrap)
            unsafe_bootstrap["network"]["defaultRoutesV4"] = [
                {"dst": "default", "gateway": "192.0.2.1"}
            ]
            with self.assertRaisesRegex(
                ContractError, "strictly offline"
            ):
                validate_install_request(
                    manifest(),
                    profile_value,
                    unsafe_bootstrap,
                    overlay,
                    request,
                )

            missing_package = clone(inventory)
            missing_package["packages"]["samba"] = False
            with self.assertRaisesRegex(
                ContractError, "required Debian packages"
            ):
                validate_install_request(
                    manifest(),
                    profile_value,
                    missing_package,
                    overlay,
                    request,
                )

            wrong_platform = clone(inventory)
            wrong_platform["platformIdentity"]["osVersionId"] = "12"
            with self.assertRaisesRegex(
                ContractError, "platform identity mismatch"
            ):
                validate_install_request(
                    manifest(),
                    profile_value,
                    wrong_platform,
                    overlay,
                    request,
                )

            wrong = InstallRequest(
                **{
                    **request.__dict__,
                    "debian_partuuid": "ffffffff-ffff-ffff-ffff-ffffffffffff",
                }
            )
            with self.assertRaisesRegex(ContractError, "debianPartuuid"):
                validate_install_request(
                    manifest(),
                    profile_value,
                    inventory,
                    overlay,
                    wrong,
                )
            wrong_root = clone(inventory)
            wrong_root["rootFilesystem"]["sourceDevice"] = "/dev/sdz2"
            with self.assertRaisesRegex(ContractError, "live /"):
                validate_install_request(
                    manifest(),
                    profile_value,
                    wrong_root,
                    overlay,
                    request,
                )


class UnitContractTests(unittest.TestCase):
    def test_units_cannot_start_vulnerable_target_without_ready_marker(self) -> None:
        exercise = (
            PLATFORM_ROOT
            / "templates/etc/systemd/system/open-world-exercise.target"
        ).read_text(encoding="utf-8")
        vulnerable = (
            PLATFORM_ROOT
            / "templates/etc/systemd/system/open-world-vulnerable.target"
        ).read_text(encoding="utf-8")
        maintenance = (
            PLATFORM_ROOT
            / "templates/etc/systemd/system/open-world-maintenance.target"
        ).read_text(encoding="utf-8")
        self.assertIn(
            "ConditionPathExists=/run/open-world-lab/exercise-ready", exercise
        )
        self.assertIn(
            "ConditionPathExists=/run/open-world-lab/exercise-ready", vulnerable
        )
        self.assertIn("open-world-nfs-watch.service", vulnerable)
        requires = next(
            line
            for line in vulnerable.splitlines()
            if line.startswith("Requires=")
        )
        required_runtime = {
            "apache2.service",
            "dnsmasq.service",
            "nfs-server.service",
            "open-world-file-watch.service",
            "open-world-nfs-watch.service",
            "open-world-root-timer.timer",
            "open-world-telemetry.service",
            "smbd.service",
            "ssh.service",
        }
        self.assertTrue(
            required_runtime.issubset(
                set(requires.removeprefix("Requires=").split())
            )
        )
        binds_to = next(
            line
            for line in vulnerable.splitlines()
            if line.startswith("BindsTo=")
        )
        bound_runtime = set(
            binds_to.removeprefix("BindsTo=").split()
        )
        self.assertEqual(
            bound_runtime,
            required_runtime | {"open-world-telemetry.socket"},
        )
        after = next(
            line
            for line in vulnerable.splitlines()
            if line.startswith("After=")
        )
        self.assertTrue(
            required_runtime.issubset(
                set(after.removeprefix("After=").split())
            )
        )
        self.assertNotIn("Wants=", vulnerable)
        self.assertIn(
            "BindsTo=open-world-vulnerable.target", exercise
        )
        for relative in ("dnsmasq.service.d/90-open-world-target.conf",):
            drop_in = (
                PLATFORM_ROOT
                / "templates/etc/systemd/system"
                / relative
            ).read_text(encoding="utf-8")
            self.assertIn(
                "PartOf=open-world-vulnerable.target", drop_in
            )
        failure_unit = (
            PLATFORM_ROOT
            / "templates/etc/systemd/system/"
            "open-world-vulnerable-failure.service"
        ).read_text(encoding="utf-8")
        self.assertIn(
            "systemctl --no-block stop open-world-vulnerable.target",
            failure_unit,
        )
        self.assertIn("Conflicts=open-world-exercise.target", maintenance)
        preset = (
            PLATFORM_ROOT
            / "templates/etc/systemd/system-preset/00-open-world-lab.preset"
        ).read_text(encoding="utf-8")
        self.assertIn("enable open-world-boot-quarantine.service", preset)
        self.assertNotIn("open-world-guide.service", preset)
        for service in (
            "apache2.service",
            "auditd.service",
            "dnsmasq.service",
            "nfs-server.service",
            "nmbd.service",
            "open-world-nfs-watch.service",
            "open-world-file-watch.service",
            "open-world-root-timer.timer",
            "open-world-telemetry.socket",
            "open-world-vulnerable-failure.service",
            "rpcbind.service",
            "rpcbind.socket",
            "rpc-statd.service",
            "rpc-statd-notify.service",
            "smbd.service",
            "ssh.service",
            "NetworkManager.service",
            "wpa_supplicant.service",
            "systemd-networkd.service",
            "systemd-journald-audit.socket",
        ):
            self.assertIn(f"disable {service}", preset)
        file_watch_unit = (
            PLATFORM_ROOT
            / "templates/etc/systemd/system/open-world-file-watch.service"
        ).read_text(encoding="utf-8")
        self.assertIn(
            "PartOf=open-world-vulnerable.target", file_watch_unit
        )
        self.assertIn(
            "OnFailure=open-world-vulnerable-failure.service",
            file_watch_unit,
        )
        self.assertIn(
            "Before=apache2.service nfs-server.service "
            "open-world-root-timer.timer smbd.service ssh.service",
            file_watch_unit,
        )
        self.assertIn("Restart=no", file_watch_unit)


if __name__ == "__main__":
    unittest.main()
