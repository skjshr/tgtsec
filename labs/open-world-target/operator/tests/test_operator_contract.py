from __future__ import annotations

import json
import unittest
from pathlib import Path


OPERATOR_ROOT = Path(__file__).resolve().parents[1]
PLATFORM_ROOT = OPERATOR_ROOT.parent / "platform"


class OperatorContractTests(unittest.TestCase):
    def test_physical_evidence_starts_not_run_for_release_gates(self) -> None:
        evidence = json.loads(
            (OPERATOR_ROOT / "evidence.example.json").read_text(
                encoding="utf-8"
            )
        )
        required = {
            "dnsmasqDhcpOnlyNoDns",
            "targetTelemetryBridgeBearer",
            "dedicatedDebianFullDiskInstall",
            "publicPinnedCodexRebuild",
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

    def test_beginner_runbook_has_dedicated_disk_and_public_pairing_steps(self) -> None:
        prepare = (OPERATOR_ROOT / "PREPARE-TARGET.md").read_text(
            encoding="utf-8"
        )
        day_of = (OPERATOR_ROOT / "DAY-OF.md").read_text(
            encoding="utf-8"
        )
        for token in (
            "全disk消去",
            "DebianとESPのPARTUUID",
            "13 optional flags",
            "--debian-partuuid",
            "--esp-partuuid",
        ):
            self.assertIn(token, prepare)
        self.assertNotIn("--windows-partuuid", prepare)
        self.assertNotIn("mnt-windows.mount", prepare + day_of)
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
        self.assertIn("clean install", bootstrap)
        self.assertIn("maintenance update", bootstrap)
        marker = json.loads(
            (
                PLATFORM_ROOT / "recovery-marker.example.json"
            ).read_text(encoding="utf-8")
        )
        self.assertIn("goldenDebianFilesystemUuid", marker)

    def test_codex_bootstrap_is_ephemeral_and_fail_closed(self) -> None:
        bootstrap = (OPERATOR_ROOT / "CODEX-BOOTSTRAP.md").read_text(
            encoding="utf-8"
        )
        prompt = (OPERATOR_ROOT / "CODEX-SETUP-PROMPT.md").read_text(
            encoding="utf-8"
        )
        for token in (
            'CODEX_HOME="$(mktemp -d /var/tmp/open-world-codex.',
            'OPEN_WORLD_BUILD_ROOT="$(mktemp -d /var/tmp/open-world-build.',
            'cli_auth_credentials_store = "file"',
            "https://github.com/skjshr/tgtsec.git",
            "RELEASE_COMMIT",
            "checkout --detach",
            "rev-parse HEAD",
            '"$OPEN_WORLD_CODEX" login --device-auth',
            '"$OPEN_WORLD_CODEX" --ask-for-approval on-request exec',
            "--ephemeral",
            "--sandbox workspace-write",
            "--ask-for-approval on-request",
            '"$OPEN_WORLD_CODEX" logout',
            "open-world-build-hygiene",
        ):
            self.assertIn(token, bootstrap)
        self.assertNotIn("gh auth", bootstrap)
        self.assertNotIn("GH_CONFIG_DIR", bootstrap)
        self.assertIn(
            "Do not use `--dangerously-bypass-approvals-and-sandbox`",
            prompt,
        )
        command_blocks = "\n".join(
            section.split("```", 1)[0]
            for section in bootstrap.split("```text")[1:]
            if "```" in section
        )
        self.assertNotIn(
            "--dangerously-bypass-approvals-and-sandbox",
            command_blocks,
        )
        for token in (
            'case "$CODEX_HOME" in /var/tmp/open-world-codex.',
            'case "$OPEN_WORLD_BUILD_ROOT" in /var/tmp/open-world-build.',
            "open-world-build-hygiene",
        ):
            self.assertIn(token, bootstrap)

    def test_kali_firefox_is_the_release_learner_surface(self) -> None:
        day_of = (OPERATOR_ROOT / "DAY-OF.md").read_text(encoding="utf-8")
        evidence = json.loads(
            (OPERATOR_ROOT / "evidence.example.json").read_text(
                encoding="utf-8"
            )
        )
        for token in (
            "Kali上のFirefox",
            "現在の目標",
            "次の選択肢",
            "説明",
            "2秒以内",
            "BRIDGE_TARGET_TOKEN",
        ):
            self.assertIn(token, day_of)
        for gate in (
            "publicPinnedCodexRebuild",
            "kaliFirefoxLiveGuide",
            "secondOperatorReproduction",
        ):
            self.assertEqual(
                evidence["physicalGates"][gate],
                {"status": "not-run", "evidence": []},
            )


if __name__ == "__main__":
    unittest.main()
