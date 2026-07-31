from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import tempfile
from pathlib import Path, PurePosixPath
from typing import Any, Callable

from .model import ContractError, canonical_json, load_json, sha256_file
from .session import fresh_marker_bytes


BUNDLE_MANIFEST = "TARGET-BUNDLE.json"
SALES_PASSWORD_PLACEHOLDER = "@@BUILD_TIME_SALES_PASSWORD@@"


def _mode_permits(
    mode_text: str,
    *,
    owner_matches: bool,
    group_matches: bool,
    permission: int,
) -> bool:
    mode = int(mode_text, 8)
    shift = 6 if owner_matches else 3 if group_matches else 0
    return bool((mode >> shift) & permission)


def event_key_access_matrix(manifest: dict[str, Any]) -> dict[str, dict[str, bool]]:
    activation = manifest["activation"]
    directory = activation["eventKeyDirectory"]
    principals = {
        "low-emitter": {"lab-events"},
        "telemetry": {"lab-events", "lab-telemetry"},
        "unprivileged": set(),
    }
    matrix: dict[str, dict[str, bool]] = {}
    for principal, groups in principals.items():
        can_traverse = all(
            _mode_permits(
                item["mode"],
                owner_matches=False,
                group_matches=item["group"] in groups,
                permission=0o1,
            )
            for item in (
                activation["eventKeyParentDirectory"],
                directory,
            )
        )
        matrix[principal] = {}
        for key_name, key in activation["eventKeys"].items():
            can_read = _mode_permits(
                key["mode"],
                owner_matches=False,
                group_matches=key["group"] in groups,
                permission=0o4,
            )
            matrix[principal][key_name] = can_traverse and can_read
    return matrix


def _safe_source(path: Path, root: Path, label: str) -> Path:
    if path.is_symlink():
        raise ContractError(f"{label} must not be a symlink")
    try:
        resolved = path.resolve(strict=True)
        resolved.relative_to(root.resolve(strict=True))
    except (OSError, ValueError) as exc:
        raise ContractError(f"{label} must exist inside the repository") from exc
    return resolved


def _safe_empty_output(output: Path) -> None:
    if str(output).startswith("/dev/"):
        raise ContractError("bundle output must never be a block device")
    if output.exists() and (
        not output.is_dir() or output.is_symlink() or any(output.iterdir())
    ):
        raise ContractError("bundle output must not exist or must be empty")
    output.parent.mkdir(parents=True, exist_ok=True)


def _copy_tree(source: Path, destination: Path) -> None:
    for path in sorted(source.rglob("*")):
        if path.is_symlink():
            raise ContractError(f"source tree contains a symlink: {path}")
        relative = path.relative_to(source)
        target = destination / relative
        if path.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        elif path.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
        else:
            raise ContractError(f"source tree contains a special file: {path}")


def _copy_file(source: Path, destination: Path) -> None:
    if source.is_symlink() or not source.is_file():
        raise ContractError(f"source file is missing or unsafe: {source}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)


def _run_node_json(
    node: str,
    script: str,
    *,
    cwd: Path,
    runner: Callable[..., subprocess.CompletedProcess[str]],
) -> Any:
    completed = runner(
        [node, "--input-type=module", "-e", script],
        cwd=cwd,
        check=False,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if completed.returncode != 0:
        raise ContractError(
            "world metadata command failed: "
            + (completed.stderr.strip() or completed.stdout.strip())
        )
    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise ContractError("world metadata command returned invalid JSON") from exc


def _materialize_flags(
    node: str,
    world: Path,
    destination: Path,
    *,
    runner: Callable[..., subprocess.CompletedProcess[str]],
) -> list[dict[str, Any]]:
    completed = runner(
        [node, str(world / "materialize-flags.mjs"), str(destination.resolve())],
        cwd=world.parent,
        check=False,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if completed.returncode != 0:
        raise ContractError(
            "flag materialization failed"
            + (
                f": {completed.stderr.strip()}"
                if completed.stderr.strip()
                else f" with exit code {completed.returncode}"
            )
        )
    flags = _run_node_json(
        node,
        (
            f"import {{WORLD}} from {json.dumps((world / 'world-definition.mjs').as_uri())};"
            "console.log(JSON.stringify(WORLD.flags));"
        ),
        cwd=world.parent,
        runner=runner,
    )
    if not isinstance(flags, list) or len(flags) != 13:
        raise ContractError("world must materialize exactly 13 Debian flags")
    for flag in flags:
        if not isinstance(flag, dict) or not isinstance(flag.get("location"), str):
            raise ContractError("world flag metadata is invalid")
        location = PurePosixPath(flag["location"])
        if location.is_absolute() or ".." in location.parts:
            raise ContractError(f"unsafe flag location: {location}")
        if not destination.joinpath(*location.parts).is_file():
            raise ContractError(f"materialized flag is missing: {location}")
    return flags


def _generate_synthetic_credentials(spec: dict[str, Any]) -> dict[str, Any]:
    accounts = spec.get("accounts")
    if (
        spec.get("version") != 1
        or spec.get("trainingOnly") is not True
        or not isinstance(accounts, list)
        or len(accounts) != 1
    ):
        raise ContractError("synthetic credential specification is invalid")
    account = accounts[0]
    random_bytes = account.get("randomBytes")
    prefix = account.get("passwordPrefix")
    if (
        account.get("username") != "sales"
        or not isinstance(prefix, str)
        or not prefix
        or not isinstance(random_bytes, int)
        or not 16 <= random_bytes <= 64
    ):
        raise ContractError("sales credential generation contract is invalid")
    password = prefix + secrets.token_hex(random_bytes)
    if (
        len(password) > 128
        or any(not 33 <= ord(character) <= 126 for character in password)
    ):
        raise ContractError("generated sales credential is unsafe")
    return {
        "version": 1,
        "trainingOnly": True,
        "accounts": [
            {
                "username": "sales",
                "password": password,
                "purpose": account.get("purpose"),
            }
        ],
    }


def _inject_sales_credential(
    debian: Path,
    credentials: dict[str, Any],
) -> None:
    handover = debian / "srv/kazekiri/handover/SHIFT-HANDOVER.txt"
    text = handover.read_text(encoding="utf-8")
    if text.count(SALES_PASSWORD_PLACEHOLDER) != 1:
        raise ContractError(
            "SMB handover must contain exactly one credential placeholder"
        )
    password = credentials["accounts"][0]["password"]
    handover.write_text(
        text.replace(SALES_PASSWORD_PLACEHOLDER, password),
        encoding="utf-8",
    )


def _normalize_apache_site(rootfs: Path) -> None:
    site = rootfs / "etc/apache2/sites-available/open-world-target.conf"
    text = site.read_text(encoding="utf-8")
    lines = [
        line
        for line in text.splitlines()
        if not line.strip().startswith("Listen ")
    ]
    if len(lines) == len(text.splitlines()):
        raise ContractError("world Apache site did not contain its expected Listen line")
    site.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _longest_ownership(
    target: str, ownership: list[dict[str, Any]]
) -> tuple[str, str]:
    candidates = [
        item
        for item in ownership
        if target == item["path"] or target.startswith(item["path"].rstrip("/") + "/")
    ]
    if not candidates:
        return "root", "root"
    selected = max(candidates, key=lambda item: len(item["path"]))
    return selected["owner"], selected["group"]


def _file_mode(target: str, flag_modes: dict[str, int]) -> int:
    if target in flag_modes:
        return flag_modes[target]
    if target == "/var/lib/examserver-open-world/fresh-state.json":
        return 0o400
    if target == "/usr/local/sbin/open-world-telemetry-status":
        return 0o750
    if target.startswith("/usr/local/libexec/") or target.startswith(
        "/usr/local/sbin/"
    ):
        return 0o755
    if target == "/usr/local/bin/open-world-event":
        return 0o755
    if target.endswith("/nightly.sh") or target.endswith(".golden"):
        return 0o775 if target == "/opt/kazekiri/maintenance/nightly.sh" else 0o755
    if target == "/etc/sudoers.d/open-world-target":
        return 0o440
    if target.startswith("/opt/examserver/open-world/world/"):
        return 0o640
    return 0o644


def _file_entries(
    root: Path,
    *,
    ownership: list[dict[str, Any]],
    flag_modes: dict[str, int],
    role: str,
) -> list[dict[str, Any]]:
    entries = []
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        relative = path.relative_to(root).as_posix()
        target = "/" + relative if role == "debian" else relative
        owner, group = (
            _longest_ownership(target, ownership)
            if role == "debian"
            else ("offline-operator", "offline-operator")
        )
        if target == "/var/lib/examserver-open-world/fresh-state.json":
            owner, group = "root", "lab-telemetry"
        mode = (
            0o600
            if role == "installer-private"
            else _file_mode(target, flag_modes)
        )
        entries.append(
            {
                "path": relative,
                "target": target,
                "role": role,
                "sha256": sha256_file(path),
                "mode": f"{mode:04o}",
                "owner": owner,
                "group": group,
            }
        )
    return entries


def build_target_bundle(
    repo_root: Path,
    output: Path,
    *,
    node_binary: str = "node",
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> dict[str, Any]:
    repo = repo_root.resolve(strict=True)
    world = _safe_source(
        repo / "labs/open-world-target/world", repo, "world source"
    )
    telemetry = _safe_source(
        repo / "labs/open-world-target/telemetry", repo, "telemetry source"
    )
    platform_root = _safe_source(
        repo / "labs/open-world-target/platform", repo, "platform source"
    )
    root_timer_failure_drop_in = _safe_source(
        platform_root
        / "templates/etc/systemd/system/open-world-root-timer.service.d/"
        "90-open-world-fail-closed.conf",
        platform_root,
        "root timer fail-closed drop-in",
    )
    file_watch = _safe_source(
        platform_root
        / "templates/usr/local/libexec/open-world-file-watch",
        platform_root,
        "fixed-path watcher",
    )
    file_watch_unit = _safe_source(
        platform_root
        / "templates/etc/systemd/system/open-world-file-watch.service",
        platform_root,
        "fixed-path watcher unit",
    )
    _safe_empty_output(output)

    fixture_manifest = load_json(world / "fixtures/fixture-manifest.json")
    credential_spec = load_json(
        world / "fixtures/synthetic-credential-spec.json"
    )
    with tempfile.TemporaryDirectory(
        prefix=".open-world-target-", dir=output.parent
    ) as temporary_name:
        temporary = Path(temporary_name)
        debian = temporary / "debian-rootfs"
        installer = temporary / "installer-private"
        _copy_tree(world / "fixtures/rootfs", debian)
        for obsolete_audit_path in (
            "etc/audit/plugins.d/open-world-target.conf",
            "etc/audit/rules.d/open-world-target.rules",
            "usr/local/libexec/open-world-audit-dispatch",
        ):
            obsolete = debian / obsolete_audit_path
            if obsolete.exists() or obsolete.is_symlink():
                raise ContractError(
                    "world fixture still contains legacy raw audit plumbing: "
                    + obsolete_audit_path
                )
        flags = _materialize_flags(
            node_binary, world, debian, runner=runner
        )
        credentials = _generate_synthetic_credentials(credential_spec)
        _inject_sales_credential(debian, credentials)
        _normalize_apache_site(debian)

        world_runtime = debian / "opt/examserver/open-world/world"
        world_runtime.mkdir(parents=True)
        for name in (
            "validate-world.mjs",
            "world-definition.mjs",
        ):
            _copy_file(world / name, world_runtime / name)

        telemetry_runtime = debian / "opt/examserver/open-world/telemetry"
        for relative in ("bin", "src"):
            _copy_tree(telemetry / relative, telemetry_runtime / relative)
        for name in ("api-contract.json", "package.json"):
            _copy_file(telemetry / name, telemetry_runtime / name)
        _copy_file(
            telemetry / "bin/open-world-event",
            debian / "usr/local/bin/open-world-event",
        )
        _copy_file(
            telemetry / "bin/open-world-telemetry-status",
            debian / "usr/local/sbin/open-world-telemetry-status",
        )
        for name in ("open-world-telemetry.service", "open-world-telemetry.socket"):
            _copy_file(
                telemetry / "systemd" / name,
                debian / "etc/systemd/system" / name,
            )

        _copy_file(
            root_timer_failure_drop_in,
            debian
            / "etc/systemd/system/open-world-root-timer.service.d/"
            "90-open-world-fail-closed.conf",
        )
        _copy_file(
            file_watch,
            debian / "usr/local/libexec/open-world-file-watch",
        )
        _copy_file(
            file_watch_unit,
            debian
            / "etc/systemd/system/open-world-file-watch.service",
        )

        fresh_marker = (
            debian / "var/lib/examserver-open-world/fresh-state.json"
        )
        fresh_marker.parent.mkdir(parents=True, exist_ok=True)
        fresh_marker.write_bytes(fresh_marker_bytes())
        installer.mkdir(parents=True)
        credentials_path = installer / "synthetic-credentials.json"
        credentials_path.write_bytes(
            canonical_json(credentials)
        )
        os.chmod(credentials_path, 0o600)

        required_ownership = fixture_manifest["requiredOwnership"]
        flag_modes = {
            "/" + flag["location"]: int(flag["mode"])
            for flag in flags
        }
        groups = [
            {
                "name": "lab-foothold",
                "gid": 1201,
                "members": fixture_manifest["groups"]["lab-foothold"],
            },
            {
                "name": "lab-events",
                "gid": 1202,
                "members": fixture_manifest["groups"]["lab-events"],
            },
        ]
        accounts = [
            {
                **account,
                "primaryGroup": account["name"],
                "gid": account["uid"],
            }
            for account in fixture_manifest["accounts"]
        ]
        ownership_rules = required_ownership + [
            {
                "path": "/etc/examserver-open-world",
                "owner": "root",
                "group": "root",
                "mode": "0711",
            },
            {
                "path": "/etc/examserver-open-world/event-keys",
                **fixture_manifest["eventKeyProvisioning"]["directory"],
            },
            {
                "path": "/opt/examserver/open-world/world",
                "owner": "root",
                "group": "lab-telemetry",
                "mode": "0750",
            },
            {
                "path": "/opt/examserver/open-world/telemetry",
                "owner": "root",
                "group": "root",
                "mode": "0755",
            },
            {
                "path": "/var/lib/examserver-open-world",
                "owner": "lab-telemetry",
                "group": "lab-telemetry",
                "mode": "0750",
            },
        ]
        known_file_targets = {
            "/" + path.relative_to(debian).as_posix()
            for path in debian.rglob("*")
            if path.is_file()
        } | {"/usr/local/bin/kazekiri-report"}
        directories = [
            item
            for item in ownership_rules
            if item["path"] not in known_file_targets
        ]
        file_ownership = [
            item
            for item in ownership_rules
            if item["path"] in known_file_targets
        ]
        debian_entries = _file_entries(
            debian,
            ownership=ownership_rules,
            flag_modes=flag_modes,
            role="debian",
        )
        private_entries = _file_entries(
            installer,
            ownership=[],
            flag_modes={},
            role="installer-private",
        )
        all_entries = debian_entries + private_entries
        entries_by_role_path = {
            (entry["role"], entry["path"]): entry for entry in all_entries
        }
        flag_files = []
        for flag in flags:
            role = "debian"
            entry = entries_by_role_path.get((role, flag["location"]))
            if entry is None:
                raise ContractError(
                    f"flag has no manifest file entry: {flag['id']}"
                )
            flag_files.append(
                {
                    "id": flag["id"],
                    "nodeId": flag["nodeId"],
                    "category": flag["category"],
                    "path": entry["path"],
                    "target": entry["target"],
                    "role": role,
                    "sha256": entry["sha256"],
                    "mode": entry["mode"],
                    "owner": entry["owner"],
                    "group": entry["group"],
                    "manualOnly": bool(flag.get("manualOnly", False)),
                }
            )
        bundle_manifest = {
            "schemaVersion": 2,
            "bundleId": "examserver-open-world-target-v1",
            "flagCounts": {"debian": 13, "total": 13},
            "groups": groups,
            "accounts": accounts,
            "directories": directories,
            "fileOwnership": file_ownership,
            "files": all_entries,
            "flagFiles": flag_files,
            "activation": {
                "apacheAddress": "10.13.37.10:80",
                "apacheSite": "open-world-target",
                "sambaInclude": (
                    "include = /etc/samba/smb.conf.d/open-world-target.conf"
                ),
                "pamAppendFile": "/etc/pam.d/sshd.open-world.append",
                "suidSource": "/usr/local/src/kazekiri-report.c",
                "suidTarget": "/usr/local/bin/kazekiri-report",
                "telemetryPort": 8787,
                "fixedFileWatchService": "open-world-file-watch.service",
                "fixedFileWatchExecutable": (
                    "/usr/local/libexec/open-world-file-watch"
                ),
                "fixedFileWatchCount": 7,
                "freshStateMarker": (
                    "/var/lib/examserver-open-world/fresh-state.json"
                ),
                "eventKeys": {
                    "low": {
                        **{
                            key: value
                            for key, value in fixture_manifest[
                                "eventKeyProvisioning"
                            ]["low"].items()
                            if key != "minimumRandomBytes"
                        },
                        "randomBytes": fixture_manifest[
                            "eventKeyProvisioning"
                        ]["low"]["minimumRandomBytes"],
                    },
                    "root": {
                        **{
                            key: value
                            for key, value in fixture_manifest[
                                "eventKeyProvisioning"
                            ]["root"].items()
                            if key != "minimumRandomBytes"
                        },
                        "randomBytes": fixture_manifest[
                            "eventKeyProvisioning"
                        ]["root"]["minimumRandomBytes"],
                    },
                },
                "eventKeyDirectory": fixture_manifest[
                    "eventKeyProvisioning"
                ]["directory"],
                "eventKeyParentDirectory": {
                    "path": "/etc/examserver-open-world",
                    "owner": "root",
                    "group": "root",
                    "mode": "0711",
                },
                "servicesDisabledAfterInstall": sorted(
                    set(
                        fixture_manifest["services"]
                        + [
                            "open-world-file-watch.service",
                            "open-world-telemetry.socket",
                            "open-world-exercise.target",
                            "open-world-vulnerable.target",
                            "NetworkManager.service",
                            "auditd.service",
                            "dnsmasq.service",
                            "nmbd.service",
                            "rpcbind.service",
                            "rpcbind.socket",
                            "rpc-statd.service",
                            "rpc-statd-notify.service",
                            "systemd-journald-audit.socket",
                            "systemd-networkd.service",
                            "systemd-resolved.service",
                            "wpa_supplicant.service",
                        ]
                    )
                ),
            },
        }
        (temporary / BUNDLE_MANIFEST).write_bytes(
            canonical_json(bundle_manifest)
        )
        validate_target_bundle(temporary)
        if output.exists():
            output.rmdir()
        temporary.replace(output)
    return validate_target_bundle(output)


def validate_target_bundle(root: Path) -> dict[str, Any]:
    if not root.is_dir() or root.is_symlink():
        raise ContractError("target bundle must be a real directory")
    allowed_top_level = {
        BUNDLE_MANIFEST,
        "debian-rootfs",
        "installer-private",
    }
    unexpected_top_level = sorted(
        path.name for path in root.iterdir()
        if path.name not in allowed_top_level
    )
    if unexpected_top_level:
        raise ContractError(
            "target bundle contains an unexpected top-level entry: "
            + ", ".join(unexpected_top_level)
        )
    manifest_path = root / BUNDLE_MANIFEST
    if not manifest_path.is_file() or manifest_path.is_symlink():
        raise ContractError("target bundle manifest must be a regular file")
    manifest = load_json(manifest_path)
    if manifest.get("schemaVersion") != 2:
        raise ContractError("target bundle schemaVersion must be 2")
    counts = manifest.get("flagCounts")
    if counts != {"debian": 13, "total": 13}:
        raise ContractError("target bundle flag counts are invalid")
    expected_groups = {
        "lab-foothold": {
            "gid": 1201,
            "members": ["www-data", "sales", "mechanic"],
        },
        "lab-events": {
            "gid": 1202,
            "members": ["www-data", "nobody", "lab-telemetry"],
        },
    }
    observed_groups = {
        group.get("name"): {
            "gid": group.get("gid"),
            "members": group.get("members"),
        }
        for group in manifest.get("groups", [])
        if isinstance(group, dict)
    }
    if observed_groups != expected_groups:
        raise ContractError("target bundle fixed group contract is invalid")
    expected_accounts = {
        "sales": (1101, 1101, True),
        "mechanic": (1102, 1102, True),
        "lab-telemetry": (1103, 1103, False),
    }
    observed_accounts = {
        account.get("name"): (
            account.get("uid"),
            account.get("gid"),
            account.get("interactive"),
        )
        for account in manifest.get("accounts", [])
        if isinstance(account, dict)
    }
    if observed_accounts != expected_accounts:
        raise ContractError("target bundle fixed account contract is invalid")
    activation = manifest.get("activation")
    if not isinstance(activation, dict):
        raise ContractError("target bundle activation contract is missing")
    fixed_activation = {
        "apacheAddress": "10.13.37.10:80",
        "apacheSite": "open-world-target",
        "sambaInclude": (
            "include = /etc/samba/smb.conf.d/open-world-target.conf"
        ),
        "pamAppendFile": "/etc/pam.d/sshd.open-world.append",
        "suidSource": "/usr/local/src/kazekiri-report.c",
        "suidTarget": "/usr/local/bin/kazekiri-report",
        "telemetryPort": 8787,
        "fixedFileWatchService": "open-world-file-watch.service",
        "fixedFileWatchExecutable": (
            "/usr/local/libexec/open-world-file-watch"
        ),
        "fixedFileWatchCount": 7,
        "freshStateMarker": (
            "/var/lib/examserver-open-world/fresh-state.json"
        ),
    }
    if any(activation.get(key) != value for key, value in fixed_activation.items()):
        raise ContractError("target bundle fixed activation contract is invalid")
    required_disabled = {
        "apache2.service",
        "auditd.service",
        "dnsmasq.service",
        "nfs-server.service",
        "open-world-file-watch.service",
        "open-world-nfs-watch.service",
        "open-world-root-timer.timer",
        "open-world-telemetry.service",
        "open-world-telemetry.socket",
        "rpcbind.service",
        "rpcbind.socket",
        "rpc-statd.service",
        "rpc-statd-notify.service",
        "systemd-journald-audit.socket",
        "systemd-networkd.service",
        "nmbd.service",
        "smbd.service",
        "ssh.service",
    }
    disabled = activation.get("servicesDisabledAfterInstall")
    if not isinstance(disabled, list) or not required_disabled.issubset(disabled):
        raise ContractError("target bundle disabled-service contract is incomplete")
    expected_keys = {
        "low": {
            "path": "/etc/examserver-open-world/event-keys/low.key",
            "owner": "root",
            "group": "lab-events",
            "mode": "0440",
            "randomBytes": 32,
        },
        "root": {
            "path": "/etc/examserver-open-world/event-keys/root.key",
            "owner": "root",
            "group": "lab-telemetry",
            "mode": "0440",
            "randomBytes": 32,
        },
    }
    if activation.get("eventKeys") != expected_keys:
        raise ContractError("target bundle event-key provisioning contract is invalid")
    if activation.get("eventKeyDirectory") != {
        "path": "/etc/examserver-open-world/event-keys",
        "owner": "root",
        "group": "root",
        "mode": "0711",
    }:
        raise ContractError(
            "target bundle event-key directory contract is invalid"
        )
    if activation.get("eventKeyParentDirectory") != {
        "path": "/etc/examserver-open-world",
        "owner": "root",
        "group": "root",
        "mode": "0711",
    }:
        raise ContractError(
            "target bundle event-key parent contract is invalid"
        )
    directory_paths = {
        entry.get("path") for entry in manifest.get("directories", [])
    }
    file_ownership_paths = {
        entry.get("path") for entry in manifest.get("fileOwnership", [])
    }
    if directory_paths & file_ownership_paths:
        raise ContractError("bundle ownership paths must have exactly one type")
    if "/usr/local/bin/kazekiri-report" not in file_ownership_paths:
        raise ContractError("compiled SUID target must be typed as a file")
    expected: set[str] = set()
    seen_role_paths: set[tuple[str, str]] = set()
    seen_debian_targets: set[str] = set()
    for entry in manifest.get("files", []):
        if not isinstance(entry, dict):
            raise ContractError("invalid target bundle file entry")
        role = entry.get("role")
        base = {
            "debian": root / "debian-rootfs",
            "installer-private": root / "installer-private",
        }.get(role)
        if base is None:
            raise ContractError(f"invalid target bundle file role: {role}")
        relative = Path(str(entry.get("path", "")))
        if relative.is_absolute() or ".." in relative.parts:
            raise ContractError("unsafe target bundle path")
        path = base / relative
        if not path.is_file() or path.is_symlink():
            raise ContractError(f"target bundle file is missing: {role}/{relative}")
        if sha256_file(path) != entry.get("sha256"):
            raise ContractError(f"target bundle hash mismatch: {role}/{relative}")
        identity = (role, relative.as_posix())
        if identity in seen_role_paths:
            raise ContractError("target bundle contains a duplicate file entry")
        seen_role_paths.add(identity)
        if role == "debian":
            target = entry.get("target")
            if (
                not isinstance(target, str)
                or not target.startswith("/")
                or target in seen_debian_targets
            ):
                raise ContractError(
                    "target bundle Debian target is unsafe or duplicated"
                )
            seen_debian_targets.add(target)
        expected.add(f"{role}/{relative.as_posix()}")
    if directory_paths & (
        seen_debian_targets | {activation.get("suidTarget")}
    ):
        raise ContractError("bundle directory ownership points at a file target")
    if not file_ownership_paths.issubset(
        seen_debian_targets | {activation.get("suidTarget")}
    ):
        raise ContractError("bundle file ownership points at a non-file target")
    observed = set()
    for role, directory in (
        ("debian", root / "debian-rootfs"),
        ("installer-private", root / "installer-private"),
    ):
        if not directory.is_dir() or directory.is_symlink():
            raise ContractError(f"target bundle role directory is unsafe: {role}")
        resolved_directory = directory.resolve(strict=True)
        for path in directory.rglob("*"):
            if path.is_symlink():
                raise ContractError(
                    f"target bundle contains a symlink: {role}/{path.name}"
                )
            try:
                path.resolve(strict=True).relative_to(resolved_directory)
            except (OSError, ValueError) as exc:
                raise ContractError(
                    f"target bundle path escapes its role: {role}/{path.name}"
                ) from exc
            if not (path.is_dir() or path.is_file()):
                raise ContractError(
                    f"target bundle contains a special file: {role}/{path.name}"
                )
        observed.update(
            f"{role}/{path.relative_to(directory).as_posix()}"
            for path in directory.rglob("*")
            if path.is_file()
        )
    if observed != expected:
        raise ContractError("target bundle has unmanifested or missing files")
    forbidden_guide_fragments = (
        "/open-world-guide.service",
        "/opt/examserver/open-world/guide/",
        "/lab-guide",
    )
    if any(
        fragment in f"/{path}"
        for path in observed
        for fragment in forbidden_guide_fragments
    ):
        raise ContractError("public guide artifacts must not enter the target bundle")
    if any(path.endswith(".key") for path in observed):
        raise ContractError("event keys must never be stored in a target bundle")
    forbidden_runtime_names = {
        "materialize-flags.mjs",
        "private-answers.mjs",
        "validate-private-answers.mjs",
        "flag-verifiers.mjs",
    }
    if any(
        PurePosixPath(path).name in forbidden_runtime_names
        for path in observed
        if path.startswith("debian/")
    ):
        raise ContractError(
            "build-only secret generation modules must never enter Debian"
        )
    credentials = load_json(
        root / "installer-private/synthetic-credentials.json"
    )
    credential_entry = next(
        (
            entry
            for entry in manifest["files"]
            if entry.get("role") == "installer-private"
            and entry.get("path") == "synthetic-credentials.json"
        ),
        None,
    )
    if credential_entry is None or credential_entry.get("mode") != "0600":
        raise ContractError("synthetic credential file must be mode 0600")
    accounts = credentials.get("accounts")
    if (
        credentials.get("version") != 1
        or
        credentials.get("trainingOnly") is not True
        or not isinstance(accounts, list)
        or len(accounts) != 1
        or accounts[0].get("username") != "sales"
        or not isinstance(accounts[0].get("password"), str)
        or len(accounts[0]["password"]) < 12
        or len(accounts[0]["password"]) > 128
        or any(character in accounts[0]["password"] for character in "\r\n")
    ):
        raise ContractError("synthetic credential contract is invalid")
    handover = (
        root
        / "debian-rootfs/srv/kazekiri/handover/SHIFT-HANDOVER.txt"
    ).read_text(encoding="utf-8")
    if (
        SALES_PASSWORD_PLACEHOLDER in handover
        or handover.count(accounts[0]["password"]) != 1
    ):
        raise ContractError(
            "generated sales credential is missing from the SMB handover"
        )
    flag_files = manifest.get("flagFiles")
    if not isinstance(flag_files, list) or len(flag_files) != 13:
        raise ContractError("target bundle must identify exactly 13 flag files")
    if len({entry.get("id") for entry in flag_files}) != 13:
        raise ContractError("target bundle flag IDs must be unique")
    flagged_entries = {
        (entry.get("role"), entry.get("path"))
        for entry in manifest["files"]
        if str(entry.get("path", "")).endswith(".flag")
    }
    declared_flags = {
        (entry.get("role"), entry.get("path")) for entry in flag_files
    }
    if flagged_entries != declared_flags:
        raise ContractError("target bundle has undeclared or missing flag files")
    for flag in flag_files:
        if not isinstance(flag, dict):
            raise ContractError("target bundle flag metadata is invalid")
        match = next(
            (
                entry
                for entry in manifest["files"]
                if entry.get("role") == flag.get("role")
                and entry.get("path") == flag.get("path")
            ),
            None,
        )
        if match is None or any(
            match.get(key) != flag.get(key)
            for key in ("target", "sha256", "mode", "owner", "group")
        ):
            raise ContractError(
                f"flag ownership/hash metadata mismatch: {flag.get('id')}"
            )
    expected_flag_ownership = {
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
    observed_flag_ownership = {
        flag.get("id"): (flag.get("owner"), flag.get("group"))
        for flag in flag_files
    }
    if observed_flag_ownership != expected_flag_ownership:
        raise ContractError("target bundle flag ownership contract is invalid")
    if any(flag.get("role") != "debian" for flag in flag_files):
        raise ContractError("all target bundle flags must use the Debian role")
    flag_answers = []
    for flag in flag_files:
        try:
            answer = (
                root / "debian-rootfs" / flag["path"]
            ).read_text(encoding="ascii")
        except (KeyError, OSError, UnicodeError) as exc:
            raise ContractError(
                f"target bundle flag is unreadable: {flag.get('id')}"
            ) from exc
        if re.fullmatch(r"FLAG\{ow_[a-f0-9]{48}\}\n", answer) is None:
            raise ContractError(
                f"target bundle flag format is invalid: {flag.get('id')}"
            )
        flag_answers.append(answer.strip())
    if len(set(flag_answers)) != len(flag_answers):
        raise ContractError("target bundle flag answers must be unique")
    serialized_manifest = canonical_json(manifest)
    if (
        b'"seed"' in serialized_manifest.lower()
        or any(
            answer.encode("ascii") in serialized_manifest
            for answer in flag_answers
        )
        or accounts[0]["password"].encode("ascii") in serialized_manifest
    ):
        raise ContractError(
            "target bundle manifest must not contain generated secret material"
        )
    required_runtime = {
        "/usr/local/bin/open-world-event": ("root", "root", "0755"),
        "/usr/local/sbin/open-world-telemetry-status": (
            "root",
            "root",
            "0750",
        ),
        "/var/lib/examserver-open-world/fresh-state.json": (
            "root",
            "lab-telemetry",
            "0400",
        ),
    }
    entries_by_target = {
        entry.get("target"): entry
        for entry in manifest["files"]
        if entry.get("role") == "debian"
    }
    for target, expected_metadata in required_runtime.items():
        entry = entries_by_target.get(target)
        if entry is None or (
            entry.get("owner"),
            entry.get("group"),
            entry.get("mode"),
        ) != expected_metadata:
            raise ContractError(
                f"target bundle runtime metadata is invalid: {target}"
            )
    access = event_key_access_matrix(manifest)
    if access != {
        "low-emitter": {"low": True, "root": False},
        "telemetry": {"low": True, "root": True},
        "unprivileged": {"low": False, "root": False},
    }:
        raise ContractError("event-key POSIX access matrix is unsafe")
    return {
        "ok": True,
        "bundleId": manifest["bundleId"],
        "bundleManifestSha256": sha256_file(manifest_path),
        "fileCount": len(expected),
        "flagCounts": counts,
        "eventKeyAccess": access,
        "manifest": manifest,
    }
