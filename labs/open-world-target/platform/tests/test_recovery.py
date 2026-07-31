from __future__ import annotations

import hashlib
import io
import json
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from open_world_platform.model import ContractError  # noqa: E402
from open_world_platform.recovery import (  # noqa: E402
    RecoveryRequest,
    _validated_efi_members,
    btrfs_format_command,
    make_received_root_writable,
    recovery_plan,
    validate_restored_boot_contract,
    validate_received_subvolume,
    validate_recovery_request,
    verify_filesystem_uuid,
)
from tests.helpers import profile, recovery_inventory  # noqa: E402


def _make_tar(path: Path) -> None:
    content = b"synthetic Debian EFI fixture"
    with tarfile.open(path, "w") as archive:
        directory = tarfile.TarInfo("EFI/debian")
        directory.type = tarfile.DIRTYPE
        directory.mode = 0o755
        archive.addfile(directory)
        file_info = tarfile.TarInfo("EFI/debian/grubx64.efi")
        file_info.size = len(content)
        file_info.mode = 0o644
        archive.addfile(file_info, io.BytesIO(content))


class RecoveryGuardTests(unittest.TestCase):
    def _fixture(self, base: Path):
        recovery_mount = base / "recovery-media"
        assets = recovery_mount / "assets"
        assets.mkdir(parents=True)
        stream = assets / "debian-root.btrfs"
        stream.write_bytes(b"synthetic btrfs stream")
        efi = assets / "debian-efi.tar"
        _make_tar(efi)
        full = assets / "full-disk.img"
        full.write_bytes(b"synthetic full disk image")

        profile_value = profile()
        profile_value["target"]["diskSizeBytes"] = full.stat().st_size
        profile_value["recovery"]["goldenBtrfsStream"]["sha256"] = hashlib.sha256(
            stream.read_bytes()
        ).hexdigest()
        profile_value["recovery"]["debianEfiArchive"]["sha256"] = hashlib.sha256(
            efi.read_bytes()
        ).hexdigest()
        profile_value["recovery"]["bareMetalImage"]["sha256"] = hashlib.sha256(
            full.read_bytes()
        ).hexdigest()

        marker = recovery_mount / "RECOVERY-MEDIA.json"
        marker.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "trustedPurpose": "examserver-open-world-recovery",
                    "kitId": profile_value["recovery"]["kitId"],
                    "mediaUuid": profile_value["recovery"]["mediaUuid"],
                    "goldenDebianFilesystemUuid": profile_value[
                        "recovery"
                    ]["goldenBtrfsStream"]["filesystemUuid"],
                }
            ),
            encoding="utf-8",
        )
        inventory = recovery_inventory(profile_value)
        inventory["recoveryMedia"]["mountPoint"] = str(recovery_mount.resolve())
        request = RecoveryRequest(
            operation="normal",
            disk_by_id=profile_value["target"]["diskById"],
            debian_partuuid=profile_value["target"]["debianPartuuid"],
            esp_partuuid=profile_value["target"]["espPartuuid"],
            image_sha256=profile_value["recovery"]["goldenBtrfsStream"]["sha256"],
            efi_sha256=profile_value["recovery"]["debianEfiArchive"]["sha256"],
            confirmation=(
                "RESTORE DEBIAN " + profile_value["target"]["diskById"]
            ),
        )
        return profile_value, inventory, request, recovery_mount, marker

    def test_normal_recovery_is_a_guarded_plan_by_default(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            values = self._fixture(Path(temp))
            profile_value, inventory, request, mount, marker = values
            context = validate_recovery_request(
                profile_value,
                inventory,
                request,
                recovery_mount=mount,
                marker_path=marker,
            )
            plan = recovery_plan(profile_value, request, context)
            self.assertFalse(plan["applied"])
            self.assertEqual(plan["operation"], "normal")
            self.assertEqual(
                [action["action"] for action in plan["actions"]],
                [
                    "format-btrfs-with-golden-uuid",
                    "receive-golden-subvolume",
                    "make-received-root-writable",
                    "verify-stable-root-boot-contract",
                    "replace-debian-efi-only",
                ],
            )
            self.assertEqual(
                plan["actions"][0]["filesystemUuid"],
                profile_value["recovery"]["goldenBtrfsStream"][
                    "filesystemUuid"
                ],
            )
            self.assertTrue(plan["actions"][0]["verifyReadback"])

    def test_trusted_recovery_linux_is_not_the_installed_target_os(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            profile_value, inventory, request, mount, marker = self._fixture(
                Path(temp)
            )
            inventory["platformIdentity"] = {
                "osId": "recovery-linux",
                "osVersionId": "1",
                "dpkgArchitecture": None,
                "kernelMachine": "x86_64",
            }
            context = validate_recovery_request(
                profile_value,
                inventory,
                request,
                recovery_mount=mount,
                marker_path=marker,
            )
            self.assertEqual(context.target_disk_device, "/dev/nvme0n1")

    def test_every_identity_and_trust_gate_fails_closed(self) -> None:
        cases = {
            "wrong boot": lambda p, i, r: i.update(
                {"bootEnvironment": "installed-debian"}
            ),
            "wrong serial": lambda p, i, r: i["targetDisk"].update(
                {"diskSerial": "OTHER"}
            ),
            "wrong partition": lambda p, i, r: i["partitions"]["debian"].update(
                {"partuuid": "ffffffff-ffff-ffff-ffff-ffffffffffff"}
            ),
            "mounted target": lambda p, i, r: i["partitions"]["debian"].update(
                {"mountpoints": ["/mnt/target"]}
            ),
            "same recovery disk": lambda p, i, r: i["recoveryMedia"].update(
                {"sourceDevice": "/dev/nvme0n1p4"}
            ),
            "mapper backed by target": lambda p, i, r: i["recoveryMedia"].update(
                {
                    "sourceDevice": "/dev/mapper/recovery",
                    "backingDevices": ["/dev/mapper/recovery", "/dev/nvme0n1"],
                }
            ),
            "wrong media UUID": lambda p, i, r: i["recoveryMedia"].update(
                {"mediaUuid": "55555555-5555-5555-5555-555555555555"}
            ),
            "wrong golden filesystem UUID": lambda p, i, r: p[
                "recovery"
            ]["goldenBtrfsStream"].update(
                {
                    "filesystemUuid": (
                        "ffffffff-ffff-4fff-8fff-ffffffffffff"
                    )
                }
            ),
            "non-removable source": lambda p, i, r: i["bootEvidence"].update(
                {"recoverySourceRemovable": False}
            ),
            "overlay recovery root": lambda p, i, r: i[
                "bootEvidence"
            ].update(
                {
                    "rootSource": "overlay",
                    "rootBackingDevices": [],
                    "rootPhysicalDisks": [],
                    "rootTransport": None,
                    "rootSourceRemovable": False,
                    "rootSourceHasBlockTopology": False,
                    "rootSharesRecoveryMedia": False,
                    "sharedRecoveryPhysicalDisks": [],
                }
            ),
            "unrelated internal recovery root": lambda p, i, r: i[
                "bootEvidence"
            ].update(
                {
                    "rootSource": "/dev/sda2",
                    "rootBackingDevices": ["/dev/sda", "/dev/sda2"],
                    "rootPhysicalDisks": ["/dev/sda"],
                    "rootTransport": "sata",
                    "rootSourceRemovable": False,
                    "rootSourceHasBlockTopology": True,
                    "rootSharesRecoveryMedia": False,
                    "sharedRecoveryPhysicalDisks": [],
                }
            ),
            "unrelated removable USB root": lambda p, i, r: i[
                "bootEvidence"
            ].update(
                {
                    "rootSource": "/dev/sdy2",
                    "rootBackingDevices": ["/dev/sdy", "/dev/sdy2"],
                    "rootPhysicalDisks": ["/dev/sdy"],
                    "rootTransport": "usb",
                    "rootSourceRemovable": True,
                    "rootSourceHasBlockTopology": True,
                    "rootSourceNotTarget": True,
                    "rootSharesRecoveryMedia": True,
                    "sharedRecoveryPhysicalDisks": ["/dev/sdy"],
                }
            ),
            "target-backed recovery root": lambda p, i, r: i[
                "bootEvidence"
            ].update(
                {
                    "rootSource": "/dev/nvme0n1p3",
                    "rootBackingDevices": [
                        "/dev/nvme0n1",
                        "/dev/nvme0n1p3",
                    ],
                    "rootPhysicalDisks": ["/dev/nvme0n1"],
                    "rootSourceNotTarget": False,
                }
            ),
            "wrong phrase": lambda p, i, r: object.__setattr__(
                r, "confirmation", "RESTORE"
            ),
            "wrong supplied hash": lambda p, i, r: object.__setattr__(
                r, "image_sha256", "f" * 64
            ),
        }
        for label, mutate in cases.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temp:
                profile_value, inventory, request, mount, marker = self._fixture(
                    Path(temp)
                )
                mutate(profile_value, inventory, request)
                with self.assertRaises(ContractError):
                    validate_recovery_request(
                        profile_value,
                        inventory,
                        request,
                        recovery_mount=mount,
                        marker_path=marker,
                    )

    def test_full_image_uses_stricter_confirmation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            profile_value, inventory, _, mount, marker = self._fixture(Path(temp))
            inventory["partitions"] = {}
            request = RecoveryRequest(
                operation="full",
                disk_by_id=profile_value["target"]["diskById"],
                debian_partuuid=profile_value["target"]["debianPartuuid"],
                esp_partuuid=profile_value["target"]["espPartuuid"],
                image_sha256=profile_value["recovery"]["bareMetalImage"]["sha256"],
                efi_sha256=None,
                confirmation=(
                    "RESTORE FULL DISK "
                    + profile_value["target"]["diskById"]
                ),
            )
            context = validate_recovery_request(
                profile_value,
                inventory,
                request,
                recovery_mount=mount,
                marker_path=marker,
            )
            self.assertIsNone(context.debian_device)
            self.assertIsNone(context.esp_device)
            plan = recovery_plan(profile_value, request, context)
            self.assertEqual(plan["actions"][0]["action"], "write-full-disk-image")
            self.assertEqual(
                plan["actions"][0]["overwrites"],
                ["Debian", "ESP", "partition-table"],
            )
            self.assertEqual(
                plan["actions"][0]["expectedBytes"],
                profile_value["target"]["diskSizeBytes"],
            )
            self.assertEqual(
                plan["actions"][0]["validatedImageBytes"],
                profile_value["target"]["diskSizeBytes"],
            )

    def test_full_image_size_must_exactly_match_target_disk(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            profile_value, inventory, _, mount, marker = self._fixture(
                Path(temp)
            )
            full = mount / profile_value["recovery"]["bareMetalImage"]["path"]
            full.write_bytes(full.read_bytes() + b"wrong-size")
            digest = hashlib.sha256(full.read_bytes()).hexdigest()
            profile_value["recovery"]["bareMetalImage"]["sha256"] = digest
            request = RecoveryRequest(
                operation="full",
                disk_by_id=profile_value["target"]["diskById"],
                debian_partuuid=profile_value["target"]["debianPartuuid"],
                esp_partuuid=profile_value["target"]["espPartuuid"],
                image_sha256=digest,
                efi_sha256=None,
                confirmation=(
                    "RESTORE FULL DISK "
                    + profile_value["target"]["diskById"]
                ),
            )
            with self.assertRaisesRegex(
                ContractError, "logical size must exactly match"
            ):
                validate_recovery_request(
                    profile_value,
                    inventory,
                    request,
                    recovery_mount=mount,
                    marker_path=marker,
                )

    def test_full_image_rejects_any_mounted_target_descendant(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            profile_value, inventory, _, mount, marker = self._fixture(
                Path(temp)
            )
            inventory["targetDisk"]["descendantMountpoints"] = ["/mnt/target"]
            request = RecoveryRequest(
                operation="full",
                disk_by_id=profile_value["target"]["diskById"],
                debian_partuuid=profile_value["target"]["debianPartuuid"],
                esp_partuuid=profile_value["target"]["espPartuuid"],
                image_sha256=profile_value["recovery"]["bareMetalImage"]["sha256"],
                efi_sha256=None,
                confirmation=(
                    "RESTORE FULL DISK "
                    + profile_value["target"]["diskById"]
                ),
            )
            with self.assertRaisesRegex(
                ContractError, "every target-disk descendant"
            ):
                validate_recovery_request(
                    profile_value,
                    inventory,
                    request,
                    recovery_mount=mount,
                    marker_path=marker,
                )

    def test_efi_archive_rejects_path_traversal_and_links(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            archive_path = Path(temp) / "unsafe.tar"
            with tarfile.open(archive_path, "w") as archive:
                member = tarfile.TarInfo("../EFI/debian/escape")
                member.size = 1
                archive.addfile(member, io.BytesIO(b"x"))
            with tarfile.open(archive_path, "r") as archive:
                with self.assertRaisesRegex(ContractError, "unsafe EFI"):
                    _validated_efi_members(archive)

    def test_restored_root_requires_stable_partuuid_or_label(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "etc").mkdir()
            (root / "boot/grub").mkdir(parents=True)
            partuuid = "11111111-1111-1111-1111-111111111111"
            (root / "etc/fstab").write_text(
                f"PARTUUID={partuuid} / btrfs defaults,subvol=@ 0 0\n",
                encoding="utf-8",
            )
            (root / "boot/grub/grub.cfg").write_text(
                f"linux /vmlinuz root=PARTUUID={partuuid} ro\n",
                encoding="utf-8",
            )
            validate_restored_boot_contract(root, partuuid)
            (root / "boot/grub/grub.cfg").write_text(
                "linux /vmlinuz root=UUID=old-filesystem-uuid ro\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ContractError, "filesystem UUID"):
                validate_restored_boot_contract(root, partuuid)

    def test_receive_requires_exactly_one_top_level_at(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            mount = Path(temp)
            (mount / "@").mkdir()
            self.assertEqual(validate_received_subvolume(mount), mount / "@")
            (mount / "unexpected").mkdir()
            with self.assertRaisesRegex(ContractError, "exactly one"):
                validate_received_subvolume(mount)

    def test_received_subvolume_is_made_writable_and_verified_in_order(
        self,
    ) -> None:
        calls: list[list[str]] = []
        restored = Path("/restored/@")
        restored_text = str(restored)

        class Completed:
            returncode = 0
            stderr = b""

            def __init__(self, stdout: bytes):
                self.stdout = stdout

        def runner(args, **kwargs):
            calls.append(args)
            return Completed(
                b"ro=false\n" if args[2] == "get" else b""
            )

        make_received_root_writable(restored, runner=runner)
        self.assertEqual(
            calls,
            [
                [
                    "btrfs",
                    "property",
                    "set",
                    restored_text,
                    "ro",
                    "false",
                ],
                [
                    "btrfs",
                    "property",
                    "get",
                    restored_text,
                    "ro",
                ],
            ],
        )

        def readonly_runner(args, **kwargs):
            return Completed(
                b"ro=true\n" if args[2] == "get" else b""
            )

        with self.assertRaisesRegex(ContractError, "remained read-only"):
            make_received_root_writable(
                restored, runner=readonly_runner
            )

    def test_format_preserves_and_verifies_golden_filesystem_uuid(
        self,
    ) -> None:
        device = "/dev/nvme0n1p3"
        expected = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
        self.assertEqual(
            btrfs_format_command(device, expected),
            [
                "mkfs.btrfs",
                "--force",
                "--label",
                "open-world-lab",
                "--uuid",
                expected,
                device,
            ],
        )

        class Completed:
            returncode = 0
            stderr = b""

            def __init__(self, stdout):
                self.stdout = stdout

        calls = []

        def matching_runner(args, **kwargs):
            calls.append(args)
            return Completed((expected.upper() + "\n").encode("ascii"))

        verify_filesystem_uuid(
            device, expected, runner=matching_runner
        )
        self.assertEqual(
            calls[0],
            [
                "blkid",
                "--probe",
                "--output",
                "value",
                "--match-tag",
                "UUID",
                device,
            ],
        )

        def wrong_runner(args, **kwargs):
            return Completed(
                b"ffffffff-ffff-ffff-ffff-ffffffffffff\n"
            )

        with self.assertRaisesRegex(ContractError, "golden boot identity"):
            verify_filesystem_uuid(
                device, expected, runner=wrong_runner
            )


if __name__ == "__main__":
    unittest.main()
