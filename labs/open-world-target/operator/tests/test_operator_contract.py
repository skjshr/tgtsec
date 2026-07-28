from __future__ import annotations

import json
import unittest
from pathlib import Path


OPERATOR_ROOT = Path(__file__).resolve().parents[1]
PLATFORM_ROOT = OPERATOR_ROOT.parent / "platform"


class OperatorContractTests(unittest.TestCase):
    def test_physical_evidence_starts_not_run_for_network_and_windows(self) -> None:
        evidence = json.loads(
            (OPERATOR_ROOT / "evidence.example.json").read_text(
                encoding="utf-8"
            )
        )
        required = {
            "dnsmasqDhcpOnlyNoDns",
            "targetTelemetryBridgeBearer",
            "windowsVolumeFullyDecrypted",
            "windowsHibernationFastStartupDisabled",
            "windowsReadOnlyPartuuidMount",
            "maintenanceDirectLinkDisconnectedUnmanaged",
            "systemdNetworkdMaskedDirectIpOwner",
            "debian13Amd64LiveIdentity",
            "fileWatchEventDelivery",
        }
        self.assertTrue(required.issubset(evidence["physicalGates"]))
        for gate in required:
            self.assertEqual(
                evidence["physicalGates"][gate],
                {"status": "not-run", "evidence": []},
            )

    def test_beginner_runbook_has_public_pairing_and_windows_safety_steps(self) -> None:
        prepare = (OPERATOR_ROOT / "PREPARE-TARGET.md").read_text(
            encoding="utf-8"
        )
        day_of = (OPERATOR_ROOT / "DAY-OF.md").read_text(
            encoding="utf-8"
        )
        for token in (
            "manage-bde.exe -status C:",
            "Fully Decrypted",
            "powercfg.exe /hibernate off",
            "HiberbootEnabled",
            "/dev/disk/by-partuuid/$WINDOWS_PARTUUID",
            "sudo systemctl start mnt-windows.mount",
            "ro,nosuid,nodev,noexec",
            "sudo systemctl stop mnt-windows.mount",
        ):
            self.assertIn(token, prepare)
        for token in (
            "LAB_PUBLIC_ORIGIN",
            "https://exam-server-one.vercel.app/lab",
            "http://10.13.37.10:8787",
            "BRIDGE_TARGET_TOKEN",
            "pairing code",
            "http://127.0.0.1:8080/?local=1",
            "53と8080はTCP/UDPとも閉じている",
            "専用Ethernet cableを物理的に両端から抜き",
            "unmanaged-devices",
        ):
            self.assertIn(token, day_of)
        offline_section = day_of.split("完全オフライン演習では", 1)[1]
        offline_command = offline_section.split("```text", 1)[1].split("```", 1)[0]
        for token in (
            "read -rsp 'Target telemetry token: ' BRIDGE_TARGET_TOKEN",
            "export BRIDGE_TARGET_TOKEN",
            "node apps/lab-guide/server/index.mjs",
        ):
            self.assertIn(token, offline_command)
        self.assertLess(
            offline_command.index("export BRIDGE_TARGET_TOKEN"),
            offline_command.index("node apps/lab-guide/server/index.mjs"),
        )
        self.assertNotIn("lab.examserver.test", prepare + day_of)
        self.assertNotIn("--guide-dist", prepare)

    def test_runbooks_bind_identity_privacy_and_ethernet_owner(self) -> None:
        prepare = (OPERATOR_ROOT / "PREPARE-TARGET.md").read_text(
            encoding="utf-8"
        )
        day_of = (OPERATOR_ROOT / "DAY-OF.md").read_text(encoding="utf-8")
        recovery = (OPERATOR_ROOT / "RECOVERY.md").read_text(encoding="utf-8")
        fixtures = (
            OPERATOR_ROOT.parent / "world" / "fixtures" / "README.md"
        ).read_text(encoding="utf-8")
        platform_readme = (PLATFORM_ROOT / "README.md").read_text(encoding="utf-8")

        for token in (
            "ID=debian VERSION_ID=13",
            "dpkg --print-architecture",
            "uname -m",
            "open-world-file-watch.service",
            "raw syscall record",
            "systemd-networkd.service",
            "直接`ip`操作",
        ):
            self.assertIn(token, prepare + day_of + platform_readme)
        self.assertIn("信頼済みの互換Linux", recovery)
        self.assertIn("USBへblock-backed full install", recovery)
        self.assertIn("rootSharesRecoveryMedia=true", recovery)
        self.assertIn("`BindsTo`", fixtures)
        self.assertIn("telemetry socket", fixtures)

    def test_bootstrap_and_recovery_examples_match_cli_contracts(self) -> None:
        bootstrap = (OPERATOR_ROOT / "PACKAGE-BOOTSTRAP.md").read_text(
            encoding="utf-8"
        )
        self.assertIn("--boot-environment installed-debian", bootstrap)
        marker = json.loads(
            (
                PLATFORM_ROOT / "recovery-marker.example.json"
            ).read_text(encoding="utf-8")
        )
        self.assertIn("goldenDebianFilesystemUuid", marker)


if __name__ == "__main__":
    unittest.main()
