from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
PLATFORM_ROOT = REPO_ROOT / "labs/open-world-target/platform"
sys.path.insert(0, str(PLATFORM_ROOT))

from open_world_platform.model import ContractError  # noqa: E402
from open_world_platform.target_bundle import (  # noqa: E402
    build_target_bundle,
    validate_target_bundle,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Build or verify the open-world target bundle with fresh "
            "build-time exercise secrets"
        )
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    build = subparsers.add_parser("build")
    build.add_argument("--output", type=Path, required=True)
    build.add_argument("--node", default="node")
    verify = subparsers.add_parser("verify")
    verify.add_argument("--bundle", type=Path, required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "build":
            result = build_target_bundle(
                REPO_ROOT,
                args.output,
                node_binary=args.node,
            )
        else:
            result = validate_target_bundle(args.bundle)
        public = {
            key: value for key, value in result.items() if key != "manifest"
        }
        print(json.dumps(public, indent=2, sort_keys=True))
        return 0
    except ContractError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
