from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from open_world_platform.install import BUNDLE_ONLY_UNITS  # noqa: E402
from open_world_platform.model import ContractError  # noqa: E402
from open_world_platform.target_bundle import (  # noqa: E402
    BUNDLE_MANIFEST,
    build_target_bundle,
    validate_target_bundle,
)
from open_world_platform.target_install import (  # noqa: E402
    TargetInstallRequest,
    _disable_lab_units,
    _ensure_real_directory,
    _event_key_bytes,
    _split_fresh_marker_entry,
    target_install_plan,
    validate_target_install_request,
)
from tests.helpers import (  # noqa: E402
    clone,
    manifest,
    platform_identity,
    profile,
)


REPO_ROOT = Path(__file__).resolve().parents[4]


def installed_inventory(profile_value):
    target = profile_value["target"]
    contract = manifest()
    return {
        "platformIdentity": platform_identity(),
        "bootEnvironment": "installed-debian-maintenance",
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
                "mountpoints": ["/"],
            },
            "esp": {
                "partuuid": target["espPartuuid"],
                "device": "/dev/nvme0n1p1",
                "mountpoints": ["/boot/efi"],
            },
            "windows": {
                "partuuid": target["windowsPartuuid"],
                "device": "/dev/nvme0n1p2",
                "mountpoints": [None],
            },
        },
        "rootFilesystem": {
            "sourceDevice": "/dev/nvme0n1p3",
            "target": "/",
            "filesystemType": "btrfs",
        },
        "packages": {name: True for name in contract["packages"]},
    }


class TargetBundleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temporary = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temporary.name)
        cls.bundle = cls.root / "bundle"
        cls.validation = build_target_bundle(REPO_ROOT, cls.bundle)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.temporary.cleanup()

    def test_real_bundle_has_exact_split_runtime_and_permissions(self) -> None:
        manifest = self.validation["manifest"]
        self.assertEqual(
            self.validation["flagCounts"],
            {"debian": 13, "windowsOffline": 1, "total": 14},
        )
        self.assertEqual(
            self.validation["eventKeyAccess"],
            {
                "low-emitter": {"low": True, "root": False},
                "telemetry": {"low": True, "root": True},
                "unprivileged": {"low": False, "root": False},
            },
        )
        self.assertFalse(
            (
                self.bundle
                / "debian-rootfs/opt/examserver/open-world/guide"
            ).exists()
        )
        self.assertFalse(
            any(
                "open-world-guide" in path.as_posix()
                for path in (self.bundle / "debian-rootfs").rglob("*")
            )
        )
        self.assertTrue(
            (
                self.bundle
                / "debian-rootfs/usr/local/sbin/open-world-telemetry-status"
            ).is_file()
        )
        self.assertTrue(
            (
                self.bundle
                / "debian-rootfs/usr/local/libexec/open-world-file-watch"
            ).is_file()
        )
        self.assertTrue(
            (
                self.bundle
                / "debian-rootfs/etc/systemd/system/open-world-file-watch.service"
            ).is_file()
        )
        telemetry_unit = (
            self.bundle
            / "debian-rootfs/etc/systemd/system/open-world-telemetry.service"
        ).read_text(encoding="utf-8")
        self.assertIn(
            "EnvironmentFile=/etc/examserver-open-world/session.env",
            telemetry_unit,
        )
        self.assertIn("Environment=LAB_HTTP_HOST=10.13.37.10", telemetry_unit)
        self.assertNotIn("guide", telemetry_unit.lower())
        for obsolete in (
            "etc/audit/plugins.d/open-world-target.conf",
            "etc/audit/rules.d/open-world-target.rules",
            "usr/local/libexec/open-world-audit-dispatch",
        ):
            self.assertFalse(
                (self.bundle / "debian-rootfs" / obsolete).exists()
            )
        self.assertTrue(
            (
                self.bundle
                / "debian-rootfs/etc/systemd/system/open-world-nfs-watch.service"
            ).is_file()
        )
        for relative in (
            "apache2.service.d/open-world-target.conf",
            "nfs-server.service.d/open-world-watch.conf",
            "open-world-file-watch.service",
            "open-world-nfs-watch.service",
            "open-world-root-timer.service",
            "open-world-root-timer.timer",
            "open-world-telemetry.service",
            "open-world-telemetry.socket",
            "smbd.service.d/open-world-target.conf",
            "ssh.service.d/open-world-target.conf",
        ):
            content = (
                self.bundle
                / "debian-rootfs/etc/systemd/system"
                / relative
            ).read_text(encoding="utf-8")
            self.assertIn(
                "PartOf=open-world-vulnerable.target",
                content,
                relative,
            )
        timer_failure = (
            self.bundle
            / "debian-rootfs/etc/systemd/system/"
            "open-world-root-timer.service.d/"
            "90-open-world-fail-closed.conf"
        ).read_text(encoding="utf-8")
        self.assertIn(
            "OnFailure=open-world-vulnerable-failure.service",
            timer_failure,
        )
        self.assertTrue(
            {
                "auditd.service",
                "dnsmasq.service",
                "nmbd.service",
                "open-world-file-watch.service",
                "open-world-nfs-watch.service",
                "open-world-telemetry.socket",
                "rpcbind.service",
                "rpcbind.socket",
                "rpc-statd.service",
                "rpc-statd-notify.service",
            }.issubset(
                manifest["activation"]["servicesDisabledAfterInstall"]
            )
        )
        status = next(
            entry
            for entry in manifest["files"]
            if entry["target"]
            == "/usr/local/sbin/open-world-telemetry-status"
        )
        self.assertEqual(
            (status["owner"], status["group"], status["mode"]),
            ("root", "root", "0750"),
        )
        self.assertFalse(
            any(entry["path"].endswith(".key") for entry in manifest["files"])
        )
        self.assertFalse(
            (
                self.bundle
                / "debian-rootfs/etc/examserver-open-world/"
                "telemetry-bridge.env"
            ).exists()
        )
        self.assertFalse(
            (
                self.bundle
                / "debian-rootfs/windows-fixture"
            ).exists()
        )
        self.assertTrue(
            (
                self.bundle
                / "windows-offline/windows-fixture/Users/Public/Documents/"
                "KazekiriArchive/WINDOWS.flag"
            ).is_file()
        )
        runtime_world = (
            self.bundle
            / "debian-rootfs/opt/examserver/open-world/world"
        )
        self.assertFalse((runtime_world / "private-answers.mjs").exists())
        self.assertFalse(
            (runtime_world / "validate-private-answers.mjs").exists()
        )
        self.assertTrue((runtime_world / "flag-verifiers.mjs").is_file())
        windows_secret = (
            self.bundle
            / "windows-offline/windows-fixture/Users/Public/Documents/"
            "KazekiriArchive/WINDOWS.flag"
        ).read_bytes().strip()
        for role in ("debian-rootfs", "installer-private"):
            for path in (self.bundle / role).rglob("*"):
                if path.is_file():
                    self.assertNotIn(
                        windows_secret,
                        path.read_bytes(),
                        f"Windows flag leaked into {path}",
                    )
        site = (
            self.bundle
            / "debian-rootfs/etc/apache2/sites-available/open-world-target.conf"
        ).read_text(encoding="utf-8")
        self.assertNotIn("\nListen ", "\n" + site)
        samba = (
            self.bundle
            / "debian-rootfs/etc/samba/smb.conf.d/open-world-target.conf"
        ).read_text(encoding="utf-8")
        self.assertIn("smb ports = 445", samba)
        self.assertNotRegex(samba, r"(?m)^\s*smb ports\s*=.*\b139\b")
        directories = {entry["path"] for entry in manifest["directories"]}
        files = {entry["path"] for entry in manifest["fileOwnership"]}
        self.assertFalse(directories & files)
        self.assertIn("/opt/kazekiri/maintenance/nightly.sh", files)
        self.assertIn("/usr/local/bin/kazekiri-report", files)
        self.assertNotIn("/usr/local/bin/kazekiri-report", directories)
        fresh = next(
            entry
            for entry in manifest["files"]
            if entry["target"]
            == "/var/lib/examserver-open-world/fresh-state.json"
        )
        self.assertEqual(
            (fresh["owner"], fresh["group"], fresh["mode"]),
            ("root", "lab-telemetry", "0400"),
        )
        self.assertEqual(len(manifest["flagFiles"]), 14)
        expected_debian_ownership = {
            "flag-entry-web": ("root", "www-data"),
            "flag-entry-smb": ("root", "root"),
            "flag-entry-nfs": ("mechanic", "mechanic"),
            "flag-foothold-www-data": ("root", "www-data"),
            "flag-foothold-sales": ("sales", "sales"),
            "flag-foothold-mechanic": ("mechanic", "mechanic"),
            "flag-clue-sudo": ("root", "lab-foothold"),
            "flag-clue-timer": ("root", "lab-foothold"),
            "flag-clue-suid": ("root", "lab-foothold"),
            "flag-route-sudo": ("root", "root"),
            "flag-route-timer": ("root", "root"),
            "flag-route-suid": ("root", "root"),
            "flag-root-common": ("root", "root"),
        }
        for flag in manifest["flagFiles"]:
            if flag["role"] == "debian":
                self.assertTrue(flag["target"].startswith("/"))
                self.assertNotEqual(flag["owner"], "offline-operator")
                self.assertEqual(
                    (flag["owner"], flag["group"]),
                    expected_debian_ownership[flag["id"]],
                )
            else:
                self.assertFalse(flag["target"].startswith("/"))
                self.assertEqual(flag["mode"], "0444")
        credential = next(
            entry
            for entry in manifest["files"]
            if entry["role"] == "installer-private"
        )
        self.assertEqual(credential["mode"], "0600")

    def test_debian_runtime_module_closure_loads_without_private_answers(
        self,
    ) -> None:
        runtime = (
            self.bundle
            / "debian-rootfs/opt/examserver/open-world/world"
        )
        engine = (
            self.bundle
            / "debian-rootfs/opt/examserver/open-world/telemetry/src/"
            "session-engine.mjs"
        )
        script = (
            f"import {{validateWorld}} from "
            f"{json.dumps((runtime / 'validate-world.mjs').as_uri())};"
            f"import {{WORLD}} from "
            f"{json.dumps((runtime / 'world-definition.mjs').as_uri())};"
            f"await import({json.dumps(engine.as_uri())});"
            "console.log(JSON.stringify({flags:validateWorld(WORLD).flags}));"
        )
        completed = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(json.loads(completed.stdout), {"flags": 14})

    def test_fresh_marker_is_separated_for_final_install_commit(self) -> None:
        entries = [
            entry
            for entry in self.validation["manifest"]["files"]
            if entry["role"] == "debian"
        ]
        target = self.validation["manifest"]["activation"][
            "freshStateMarker"
        ]
        payload, marker = _split_fresh_marker_entry(entries, target)
        self.assertEqual(marker["target"], target)
        self.assertNotIn(target, {entry["target"] for entry in payload})

    def test_build_is_deterministic_and_tampering_fails_validation(self) -> None:
        second = self.root / "second"
        second_validation = build_target_bundle(REPO_ROOT, second)
        self.assertEqual(
            self.validation["bundleManifestSha256"],
            second_validation["bundleManifestSha256"],
        )
        self.assertEqual(
            (self.bundle / BUNDLE_MANIFEST).read_bytes(),
            (second / BUNDLE_MANIFEST).read_bytes(),
        )
        tampered = self.root / "tampered"
        shutil.copytree(self.bundle, tampered)
        (
            tampered
            / "debian-rootfs/usr/local/sbin/open-world-telemetry-status"
        ).write_text("tampered\n", encoding="utf-8")
        with self.assertRaisesRegex(ContractError, "hash mismatch"):
            validate_target_bundle(tampered)

    def test_target_install_is_a_guarded_dry_run_only(self) -> None:
        profile_value = profile()
        inventory = installed_inventory(profile_value)
        target = profile_value["target"]
        request = TargetInstallRequest(
            disk_by_id=target["diskById"],
            debian_partuuid=target["debianPartuuid"],
            esp_partuuid=target["espPartuuid"],
            windows_partuuid=target["windowsPartuuid"],
            bundle_manifest_sha256=self.validation[
                "bundleManifestSha256"
            ],
            confirmation=f"INSTALL TARGET BUNDLE {target['diskById']}",
        )
        validation = validate_target_install_request(
            manifest(),
            profile_value,
            inventory,
            self.bundle,
            request,
        )
        plan = target_install_plan(profile_value, request, validation)
        self.assertFalse(plan["applied"])
        self.assertEqual(plan["copyPolicy"]["includedRole"], "debian")
        self.assertIn(
            "open-world-telemetry.socket",
            plan["actions"][0]["units"],
        )
        self.assertFalse(
            plan["actions"][4]["storedInBundle"]
        )
        self.assertEqual(
            plan["actions"][-1]["freshStateMarker"],
            "/var/lib/examserver-open-world/fresh-state.json",
        )

        bad_cases = {
            "root": (
                clone(inventory),
                request,
                lambda value: value["rootFilesystem"].update(
                    {"sourceDevice": "/dev/sdz2"}
                ),
            ),
            "disk": (
                clone(inventory),
                TargetInstallRequest(
                    **{**request.__dict__, "disk_by_id": "/dev/wrong"}
                ),
                lambda value: None,
            ),
            "hash": (
                clone(inventory),
                TargetInstallRequest(
                    **{
                        **request.__dict__,
                        "bundle_manifest_sha256": "f" * 64,
                    }
                ),
                lambda value: None,
            ),
            "phrase": (
                clone(inventory),
                TargetInstallRequest(
                    **{**request.__dict__, "confirmation": "INSTALL"}
                ),
                lambda value: None,
            ),
            "missing package": (
                clone(inventory),
                request,
                lambda value: value["packages"].update({"samba": False}),
            ),
            "wrong target OS": (
                clone(inventory),
                request,
                lambda value: value["platformIdentity"].update(
                    {"dpkgArchitecture": "arm64"}
                ),
            ),
        }
        for label, (bad_inventory, bad_request, mutate) in bad_cases.items():
            with self.subTest(label=label):
                mutate(bad_inventory)
                with self.assertRaises(ContractError):
                    validate_target_install_request(
                        manifest(),
                        profile_value,
                        bad_inventory,
                        self.bundle,
                        bad_request,
                    )

    def test_generated_ascii_key_round_trips_through_real_node_auth(
        self,
    ) -> None:
        key_root = self.root / "node-key-roundtrip"
        key_root.mkdir()
        low = key_root / "low.key"
        root = key_root / "root.key"
        low.write_bytes(_event_key_bytes(32))
        root.write_bytes(_event_key_bytes(32))
        self.assertEqual(len(low.read_text(encoding="ascii").strip()), 64)
        auth_module = (
            REPO_ROOT
            / "labs/open-world-target/telemetry/src/event-auth.mjs"
        ).as_uri()
        script = (
            f"import {{loadEventKeys,signEvent,authenticateWireEvent}} from "
            f"{json.dumps(auth_module)};"
            f"const keys=await loadEventKeys({{lowPath:{json.dumps(str(low))},"
            f"rootPath:{json.dumps(str(root))}}});"
            "const event={sessionId:'exercise-key-test',"
            "kind:'entry.discovered',nodeId:'entrance-web-diagnostics',"
            "sourceId:'apache2.service',"
            "evidenceCode:'web.diagnostics.opened',"
            "occurredAt:'2026-07-27T00:00:00.000Z'};"
            "const wire={...event,authTag:signEvent(event,keys.low)};"
            "const accepted=authenticateWireEvent(wire,keys);"
            "console.log(JSON.stringify({sourceId:accepted.sourceId,"
            "lowBytes:keys.low.length,rootBytes:keys.root.length}));"
        )
        completed = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(
            json.loads(completed.stdout),
            {
                "sourceId": "apache2.service",
                "lowBytes": 64,
                "rootBytes": 64,
            },
        )

    def test_directory_creation_rejects_intermediate_symlink(self) -> None:
        safe = self.root / "symlink-guard"
        outside = self.root / "outside"
        safe.mkdir()
        outside.mkdir()
        link = safe / "redirect"
        try:
            os.symlink(outside, link, target_is_directory=True)
        except OSError as exc:
            self.skipTest(f"directory symlinks unavailable: {exc}")
        with self.assertRaisesRegex(ContractError, "unsafe component"):
            _ensure_real_directory(link / "escaped", 0o755)
        self.assertFalse((outside / "escaped").exists())

    def test_prebundle_disable_never_names_missing_bundle_units(self) -> None:
        calls = []

        class Completed:
            returncode = 0
            stdout = ""
            stderr = ""

        def runner(args, **kwargs):
            calls.append(args)
            return Completed()

        _disable_lab_units(include_bundle_units=False, runner=runner)
        disabled = next(
            args
            for args in calls
            if args[:3] == ["systemctl", "disable", "--now"]
        )
        self.assertTrue(
            all(unit not in disabled for unit in BUNDLE_ONLY_UNITS)
        )
        calls.clear()
        _disable_lab_units(include_bundle_units=True, runner=runner)
        disabled = next(
            args
            for args in calls
            if args[:3] == ["systemctl", "disable", "--now"]
        )
        self.assertNotIn("open-world-root-timer.service", disabled)
        self.assertTrue(
            all(
                unit in disabled
                for unit in BUNDLE_ONLY_UNITS
                if unit != "open-world-root-timer.service"
            )
        )
        self.assertIn(
            ["systemctl", "stop", "open-world-root-timer.service"],
            calls,
        )


if __name__ == "__main__":
    unittest.main()
