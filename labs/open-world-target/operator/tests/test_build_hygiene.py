from __future__ import annotations

import importlib.util
from importlib.machinery import SourceFileLoader
import tempfile
import unittest
from pathlib import Path


SCRIPT = (
    Path(__file__).resolve().parents[2]
    / "platform"
    / "templates"
    / "usr"
    / "local"
    / "sbin"
    / "open-world-build-hygiene"
)
SPEC = importlib.util.spec_from_loader(
    "verify_build_hygiene",
    SourceFileLoader("verify_build_hygiene", str(SCRIPT)),
)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class BuildHygieneTests(unittest.TestCase):
    def test_clean_home_and_removed_transient_paths_pass(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            home = Path(root) / "operator"
            home.mkdir()
            result = MODULE.inspect(
                home,
                [Path(root) / "removed-codex", Path(root) / "removed-repo"],
                {},
            )
            self.assertEqual(
                result,
                {"passed": True, "findingCount": 0, "findings": []},
            )

    def test_auth_checkout_and_secret_environment_fail_without_values(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            home = Path(root) / "operator"
            auth = home / ".codex" / "auth.json"
            auth.parent.mkdir(parents=True)
            auth.write_text("secret", encoding="utf-8")
            checkout = Path(root) / "checkout"
            checkout.mkdir()

            result = MODULE.inspect(
                home,
                [checkout],
                {"GITHUB_TOKEN": "must-not-be-rendered"},
            )

            self.assertFalse(result["passed"])
            rendered = str(result)
            self.assertIn("persistent_auth_state", rendered)
            self.assertIn("transient_build_state", rendered)
            self.assertIn("secret_environment_variable", rendered)
            self.assertIn("GITHUB_TOKEN", rendered)
            self.assertNotIn("must-not-be-rendered", rendered)

    def test_root_and_relative_paths_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            MODULE.absolute_path(".", "operator home")
        with self.assertRaises(ValueError):
            MODULE.absolute_path(Path("/").anchor, "operator home")

    def test_transient_contract_requires_exact_codex_and_build_paths(self) -> None:
        valid = [
            Path("/var/tmp/open-world-codex.removed"),
            Path("/var/tmp/open-world-build.removed"),
        ]
        self.assertEqual(MODULE.validate_transient_contract(valid), valid)
        with self.assertRaises(ValueError):
            MODULE.validate_transient_contract(valid[:1])
        with self.assertRaises(ValueError):
            MODULE.validate_transient_contract(
                [valid[0], Path("/var/tmp/other.removed")]
            )


if __name__ == "__main__":
    unittest.main()
