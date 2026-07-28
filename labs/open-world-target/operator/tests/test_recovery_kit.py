from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

OPERATOR_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(OPERATOR_ROOT))
sys.path.insert(0, str(OPERATOR_ROOT.parent / "platform"))

from build_recovery_kit import build_kit, verify_kit  # noqa: E402
from open_world_platform.model import ContractError  # noqa: E402
from tests.helpers import profile  # noqa: E402


class RecoveryKitTests(unittest.TestCase):
    def test_build_and_verify_are_content_addressed(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            assets = root / "source"
            (assets / "assets").mkdir(parents=True)
            values = {
                "goldenBtrfsStream": ("debian-root.btrfs", b"btrfs"),
                "debianEfiArchive": ("debian-efi.tar", b"efi"),
                "bareMetalImage": ("full-disk.img", b"disk"),
            }
            profile_value = profile()
            for key, (name, content) in values.items():
                path = assets / "assets" / name
                path.write_bytes(content)
                profile_value["recovery"][key]["sha256"] = hashlib.sha256(
                    content
                ).hexdigest()
                if key == "bareMetalImage":
                    profile_value["target"]["diskSizeBytes"] = len(content)
            profile_path = root / "profile.json"
            profile_path.write_text(json.dumps(profile_value), encoding="utf-8")
            output = root / "kit"
            built = build_kit(profile_path, assets, output)
            verified = verify_kit(output)
            self.assertTrue(built["ok"])
            self.assertEqual(
                built["kitManifestSha256"], verified["kitManifestSha256"]
            )
            self.assertTrue((output / "RECOVERY-MEDIA.json").is_file())
            recovery_marker = json.loads(
                (output / "RECOVERY-MEDIA.json").read_text(encoding="utf-8")
            )
            self.assertEqual(
                recovery_marker["goldenDebianFilesystemUuid"],
                profile_value["recovery"]["goldenBtrfsStream"][
                    "filesystemUuid"
                ],
            )
            self.assertTrue((output / "tool/open-world-platform").is_file())
            kit_manifest = json.loads(
                (output / "KIT-MANIFEST.json").read_text(encoding="utf-8")
            )
            self.assertEqual(
                kit_manifest["goldenDebianFilesystemUuid"],
                profile_value["recovery"]["goldenBtrfsStream"][
                    "filesystemUuid"
                ],
            )

    def test_verify_rejects_any_changed_asset(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            assets = root / "source"
            (assets / "assets").mkdir(parents=True)
            profile_value = profile()
            for key, name in (
                ("goldenBtrfsStream", "debian-root.btrfs"),
                ("debianEfiArchive", "debian-efi.tar"),
                ("bareMetalImage", "full-disk.img"),
            ):
                content = key.encode("ascii")
                (assets / "assets" / name).write_bytes(content)
                profile_value["recovery"][key]["sha256"] = hashlib.sha256(
                    content
                ).hexdigest()
                if key == "bareMetalImage":
                    profile_value["target"]["diskSizeBytes"] = len(content)
            profile_path = root / "profile.json"
            profile_path.write_text(json.dumps(profile_value), encoding="utf-8")
            output = root / "kit"
            build_kit(profile_path, assets, output)
            (output / "assets/debian-root.btrfs").write_bytes(b"tampered")
            with self.assertRaisesRegex(ContractError, "hash mismatch"):
                verify_kit(output)

    def test_build_rejects_wrong_full_image_logical_size(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            assets = root / "source"
            (assets / "assets").mkdir(parents=True)
            profile_value = profile()
            for key, name in (
                ("goldenBtrfsStream", "debian-root.btrfs"),
                ("debianEfiArchive", "debian-efi.tar"),
                ("bareMetalImage", "full-disk.img"),
            ):
                content = key.encode("ascii")
                path = assets / "assets" / name
                path.write_bytes(content)
                profile_value["recovery"][key]["sha256"] = hashlib.sha256(
                    content
                ).hexdigest()
            profile_value["target"]["diskSizeBytes"] = 1
            profile_path = root / "profile.json"
            profile_path.write_text(
                json.dumps(profile_value), encoding="utf-8"
            )
            with self.assertRaisesRegex(
                ContractError, "logical size does not exactly match"
            ):
                build_kit(profile_path, assets, root / "kit")


if __name__ == "__main__":
    unittest.main()
