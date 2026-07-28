from __future__ import annotations

import hashlib
import os
import secrets
import shutil
import stat
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Callable

from .install import (
    BUNDLE_ONLY_UNITS,
    disable_raw_audit_units,
    verify_units_absent,
    verify_units_masked_inactive,
)
from .model import (
    ALWAYS_MASKED_UNITS,
    ContractError,
    load_json,
    RAW_AUDIT_UNITS,
    validate_exact_identity,
    validate_platform_identity,
    validate_profile,
    validate_required_packages,
    WINDOWS_MOUNT_UNIT,
)
from .target_bundle import validate_target_bundle


TELEMETRY_STATE = Path(
    "/var/lib/examserver-open-world/telemetry-state.json"
)
SESSION_ENV = Path("/etc/examserver-open-world/session.env")
SESSION_ID = Path("/run/examserver-open-world/session-id")
LAB_UNITS = [
    "NetworkManager.service",
    "apache2.service",
    "dnsmasq.service",
    "nfs-server.service",
    "nmbd.service",
    "open-world-exercise.target",
    "open-world-file-watch.service",
    "open-world-nfs-watch.service",
    "open-world-root-timer.service",
    "open-world-root-timer.timer",
    "open-world-telemetry.service",
    "open-world-telemetry.socket",
    "open-world-vulnerable.target",
    "open-world-vulnerable-failure.service",
    "rpcbind.service",
    "rpcbind.socket",
    "rpc-statd.service",
    "rpc-statd-notify.service",
    "smbd.service",
    "ssh.service",
    "systemd-resolved.service",
    "wpa_supplicant.service",
    WINDOWS_MOUNT_UNIT,
]


@dataclass(frozen=True)
class TargetInstallRequest:
    disk_by_id: str
    debian_partuuid: str
    esp_partuuid: str
    windows_partuuid: str
    bundle_manifest_sha256: str
    confirmation: str


def _validate_live_root(
    profile: dict[str, Any], inventory: dict[str, Any]
) -> None:
    if inventory.get("bootEnvironment") != "installed-debian-maintenance":
        raise ContractError(
            "target install requires installed Debian maintenance mode"
        )
    partition = inventory.get("partitions", {}).get("debian")
    root = inventory.get("rootFilesystem")
    if not isinstance(partition, dict) or not isinstance(root, dict):
        raise ContractError("live root/partition evidence is missing")
    if (
        root.get("sourceDevice") != partition.get("device")
        or root.get("target") != "/"
        or "/" not in (partition.get("mountpoints") or [])
    ):
        raise ContractError("live / is not the profile Debian PARTUUID partition")


def validate_target_install_request(
    manifest: dict[str, Any],
    profile: dict[str, Any],
    inventory: dict[str, Any],
    bundle: Path,
    request: TargetInstallRequest,
) -> dict[str, Any]:
    validate_profile(profile)
    validate_platform_identity(manifest, inventory)
    validate_required_packages(manifest, inventory)
    _validate_live_root(profile, inventory)
    identity_errors = validate_exact_identity(profile, inventory)
    if identity_errors:
        raise ContractError("; ".join(identity_errors))
    expected = profile["target"]
    supplied = {
        "diskById": request.disk_by_id,
        "debianPartuuid": request.debian_partuuid,
        "espPartuuid": request.esp_partuuid,
        "windowsPartuuid": request.windows_partuuid,
    }
    for key, value in supplied.items():
        if value != expected[key]:
            raise ContractError(f"supplied {key} does not exactly match profile")
    phrase = f"INSTALL TARGET BUNDLE {expected['diskById']}"
    if request.confirmation != phrase:
        raise ContractError(f"confirmation must exactly equal: {phrase}")
    validation = validate_target_bundle(bundle)
    if (
        request.bundle_manifest_sha256.lower()
        != validation["bundleManifestSha256"]
    ):
        raise ContractError("supplied target-bundle manifest hash does not match")
    manifest = validation["manifest"]
    if any(entry.get("role") == "windows-offline" and entry.get("target", "").startswith("/")
           for entry in manifest["files"]):
        raise ContractError("Windows offline fixture must not have a Debian target")
    return validation


def target_install_plan(
    profile: dict[str, Any],
    request: TargetInstallRequest,
    validation: dict[str, Any],
) -> dict[str, Any]:
    manifest = validation["manifest"]
    activation = manifest["activation"]
    return {
        "applied": False,
        "operation": "install-open-world-target",
        "diskById": profile["target"]["diskById"],
        "debianPartuuid": request.debian_partuuid,
        "bundleManifestSha256": validation["bundleManifestSha256"],
        "copyPolicy": {
            "includedRole": "debian",
            "excludedRoles": ["windows-offline", "installer-private"],
        },
        "flagOwnership": manifest["flagFiles"],
        "actions": [
            {
                "action": "quarantine-and-disable",
                "units": LAB_UNITS,
                "includesTelemetrySocket": True,
            },
            {
                "action": "create-fixed-synthetic-identities",
                "accounts": [
                    {
                        "name": account["name"],
                        "uid": account["uid"],
                        "gid": account["gid"],
                    }
                    for account in manifest["accounts"]
                ],
                "groups": manifest["groups"],
                "credentialTransport": "chpasswd-stdin-only",
            },
            {
                "action": "copy-verified-debian-files-only",
                "fileCount": sum(
                    entry["role"] == "debian"
                    for entry in manifest["files"]
                ),
            },
            {
                "action": "compile-and-install-suid-helper",
                "source": activation["suidSource"],
                "target": activation["suidTarget"],
                "owner": "root:root",
                "mode": "4755",
            },
            {
                "action": "generate-event-keys-on-target",
                "keys": activation["eventKeys"],
                "storedInBundle": False,
                "exposedInPlanOrLog": False,
            },
            {
                "action": "install-fixed-path-inotify-detector",
                "service": activation["fixedFileWatchService"],
                "executable": activation["fixedFileWatchExecutable"],
                "fixedPathCount": activation["fixedFileWatchCount"],
                "rawAuditRecordsPersisted": False,
            },
            {
                "action": "append-config-exactly-once",
                "samba": activation["sambaInclude"],
                "pamSource": activation["pamAppendFile"],
            },
            {
                "action": "activate-apache-config",
                "portsConf": "exactly Listen 10.13.37.10:80",
                "site": activation["apacheSite"],
                "disableSite": "000-default",
                "enableSinglePackagedPhpModule": True,
            },
            {
                "action": "validate-configurations",
                "commands": [
                    ["apache2ctl", "configtest"],
                    ["sshd", "-t"],
                    ["testparm", "-s"],
                    ["exportfs", "-ra"],
                ],
            },
            {
                "action": "mask-rpcbind-for-nfsv4-only",
                "units": [
                    "rpcbind.service",
                    "rpcbind.socket",
                    "rpc-statd.service",
                    "rpc-statd-notify.service",
                ],
                "mountdPort": 20048,
                "publicNfsPort": 2049,
            },
            {
                "action": "leave-disabled-and-quarantined",
                "units": LAB_UNITS,
                "freshStateMarker": activation["freshStateMarker"],
            },
        ],
        "physicalVerificationRequired": [
            "reboot enters Debian maintenance quarantine",
            "exercise preflight passes with direct cable only",
            "all 13 Debian flags have intended runtime readability",
            "Windows offline flag is placed manually and Windows boots",
        ],
    }


def _run(
    args: list[str],
    *,
    runner: Callable[..., subprocess.CompletedProcess[str]],
    input_text: str | None = None,
    acceptable_returncodes: set[int] | None = None,
) -> subprocess.CompletedProcess[str]:
    completed = runner(
        args,
        input=input_text,
        check=False,
        capture_output=True,
        text=True,
        timeout=60,
    )
    allowed = acceptable_returncodes or {0}
    if completed.returncode not in allowed:
        message = completed.stderr.strip() or completed.stdout.strip()
        raise ContractError(
            f"target install command failed: {args!r}: {message}"
        )
    return completed


def _disable_lab_units(
    *,
    include_bundle_units: bool,
    runner: Callable[..., subprocess.CompletedProcess[str]],
) -> None:
    regular_units = [
        unit
        for unit in LAB_UNITS
        if unit != "open-world-root-timer.service"
        and (include_bundle_units or unit not in BUNDLE_ONLY_UNITS)
    ]
    _run(
        ["systemctl", "disable", "--now", *regular_units],
        runner=runner,
    )
    if include_bundle_units:
        _run(
            ["systemctl", "stop", "open-world-root-timer.service"],
            runner=runner,
        )


def _split_fresh_marker_entry(
    entries: list[dict[str, Any]], fresh_target: str
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    markers = [entry for entry in entries if entry.get("target") == fresh_target]
    if len(markers) != 1:
        raise ContractError(
            "target bundle must contain exactly one trusted fresh-state marker"
        )
    return (
        [entry for entry in entries if entry.get("target") != fresh_target],
        markers[0],
    )


def _ensure_group(
    name: str,
    gid: int,
    *,
    runner: Callable[..., subprocess.CompletedProcess[str]],
) -> None:
    by_name = _run(
        ["getent", "group", name],
        runner=runner,
        acceptable_returncodes={0, 2},
    )
    if by_name.returncode == 0:
        fields = by_name.stdout.strip().split(":")
        if len(fields) < 3 or fields[2] != str(gid):
            raise ContractError(f"group {name} exists with a different GID")
        return
    by_gid = _run(
        ["getent", "group", str(gid)],
        runner=runner,
        acceptable_returncodes={0, 2},
    )
    if by_gid.returncode == 0:
        raise ContractError(f"GID {gid} is already assigned to another group")
    _run(["groupadd", "--gid", str(gid), name], runner=runner)


def _ensure_account(
    account: dict[str, Any],
    *,
    runner: Callable[..., subprocess.CompletedProcess[str]],
) -> None:
    name = account["name"]
    uid = account["uid"]
    gid = account["gid"]
    observed = _run(
        ["getent", "passwd", name],
        runner=runner,
        acceptable_returncodes={0, 2},
    )
    if observed.returncode == 0:
        fields = observed.stdout.strip().split(":")
        if len(fields) < 7 or fields[2:4] != [str(uid), str(gid)]:
            raise ContractError(f"account {name} exists with different UID/GID")
        return
    uid_owner = _run(
        ["getent", "passwd", str(uid)],
        runner=runner,
        acceptable_returncodes={0, 2},
    )
    if uid_owner.returncode == 0:
        raise ContractError(f"UID {uid} is already assigned to another account")
    interactive = account.get("interactive") is True
    command = [
        "useradd",
        "--uid",
        str(uid),
        "--gid",
        account["primaryGroup"],
        "--shell",
        "/bin/bash" if interactive else "/usr/sbin/nologin",
        "--comment",
        "TRAINING ONLY synthetic account",
    ]
    command.append("--create-home" if interactive else "--no-create-home")
    command.append(name)
    _run(command, runner=runner)


def _safe_target(root: Path, absolute: str) -> Path:
    value = PurePosixPath(absolute)
    if not value.is_absolute() or ".." in value.parts:
        raise ContractError(f"unsafe target path: {absolute}")
    return root.joinpath(*value.parts[1:])


def _ensure_real_directory(path: Path, mode: int) -> None:
    if not path.is_absolute():
        raise ContractError(f"directory path must be absolute: {path}")
    cursor = Path(path.anchor)
    for part in path.parts[1:]:
        cursor = cursor / part
        try:
            metadata = cursor.lstat()
        except FileNotFoundError:
            cursor.mkdir(mode=mode)
            metadata = cursor.lstat()
        if cursor.is_symlink() or not stat.S_ISDIR(metadata.st_mode):
            raise ContractError(
                f"directory path has an unsafe component: {cursor}"
            )


def _owner_ids(owner: str, group: str) -> tuple[int, int]:
    try:
        import grp
        import pwd

        return pwd.getpwnam(owner).pw_uid, grp.getgrnam(group).gr_gid
    except ImportError as exc:
        raise ContractError("POSIX owner/group lookup is unavailable") from exc
    except KeyError as exc:
        raise ContractError(f"manifest owner/group is missing: {exc}") from exc


def _apply_owner_mode(
    path: Path, *, owner: str, group: str, mode: str
) -> None:
    uid, gid = _owner_ids(owner, group)
    os.chown(path, uid, gid)
    os.chmod(path, int(mode, 8))


def _copy_atomic(
    source: Path,
    target: Path,
    *,
    owner: str,
    group: str,
    mode: str,
) -> None:
    if source.is_symlink() or not source.is_file():
        raise ContractError(f"bundle source is missing or unsafe: {source}")
    _ensure_real_directory(target.parent, 0o755)
    if target.exists() and (target.is_symlink() or not target.is_file()):
        raise ContractError(f"refusing to replace non-regular target: {target}")
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{target.name}.", dir=target.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as destination, source.open("rb") as incoming:
            shutil.copyfileobj(incoming, destination)
            destination.flush()
            os.fsync(destination.fileno())
        _apply_owner_mode(
            temporary, owner=owner, group=group, mode=mode
        )
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def _write_secret_atomic(
    target: Path, size: int, *, owner: str, group: str, mode: str
) -> None:
    if size < 32:
        raise ContractError("event key contract requires at least 32 random bytes")
    if target.exists():
        raise ContractError(f"refusing to replace an existing event key: {target}")
    _ensure_real_directory(target.parent, 0o710)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{target.name}.", dir=target.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as destination:
            destination.write(_event_key_bytes(size))
            destination.flush()
            os.fsync(destination.fileno())
        _apply_owner_mode(
            temporary, owner=owner, group=group, mode=mode
        )
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def _event_key_bytes(random_bytes: int) -> bytes:
    if random_bytes < 32:
        raise ContractError("event key contract requires at least 32 random bytes")
    return (secrets.token_hex(random_bytes) + "\n").encode("ascii")


def _append_exactly_once(path: Path, line: str) -> None:
    if path.is_symlink() or not path.is_file():
        raise ContractError(f"append target is missing or unsafe: {path}")
    text = path.read_text(encoding="utf-8")
    observed = [item.strip() for item in text.splitlines()].count(line)
    if observed > 1:
        raise ContractError(f"configuration line is duplicated in {path}")
    if observed == 1:
        return
    content = text
    if content and not content.endswith("\n"):
        content += "\n"
    content += line + "\n"
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", dir=path.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as destination:
            destination.write(content)
            destination.flush()
            os.fsync(destination.fileno())
        stat = path.stat()
        os.chown(temporary, stat.st_uid, stat.st_gid)
        os.chmod(temporary, stat.st_mode & 0o7777)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _configure_apache(
    *, runner: Callable[..., subprocess.CompletedProcess[str]]
) -> None:
    ports = Path("/etc/apache2/ports.conf")
    backup = Path("/etc/apache2/ports.conf.open-world-prelab")
    if ports.is_symlink() or not ports.is_file():
        raise ContractError("Apache ports.conf is missing or unsafe")
    if not backup.exists():
        shutil.copy2(ports, backup)
        os.chown(backup, 0, 0)
        os.chmod(backup, 0o600)
    elif backup.is_symlink() or not backup.is_file():
        raise ContractError("Apache ports.conf backup is unsafe")
    temporary = ports.parent / ".ports.conf.open-world"
    if temporary.exists():
        raise ContractError("stale Apache ports.conf staging file exists")
    temporary.write_text("Listen 10.13.37.10:80\n", encoding="ascii")
    os.chown(temporary, 0, 0)
    os.chmod(temporary, 0o644)
    os.replace(temporary, ports)

    modules = sorted(Path("/usr/lib/apache2/modules").glob("libphp*.so"))
    if len(modules) != 1:
        raise ContractError("exactly one packaged Apache PHP module is required")
    module = modules[0].stem.removeprefix("lib")
    _run(["a2dissite", "000-default"], runner=runner)
    _run(["a2enmod", module], runner=runner)
    _run(["a2ensite", "open-world-target"], runner=runner)
    _run(["apache2ctl", "configtest"], runner=runner)


def _compile_suid(
    source: Path,
    target: Path,
    *,
    runner: Callable[..., subprocess.CompletedProcess[str]],
) -> None:
    _ensure_real_directory(target.parent, 0o755)
    staged = target.parent / ".kazekiri-report.open-world"
    if staged.exists():
        raise ContractError("stale SUID helper staging file exists")
    try:
        _run(
            [
                "cc",
                "-O2",
                "-Wall",
                "-Wextra",
                "-o",
                str(staged),
                str(source),
            ],
            runner=runner,
        )
        os.chown(staged, 0, 0)
        os.chmod(staged, 0o4755)
        os.replace(staged, target)
    finally:
        staged.unlink(missing_ok=True)


def _require_apply_authority() -> None:
    if os.name != "posix" or os.geteuid() != 0:
        raise ContractError("target install mutation requires root on Debian")


def apply_target_install(
    bundle: Path,
    validation: dict[str, Any],
    *,
    target_root: Path = Path("/"),
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> dict[str, Any]:
    _require_apply_authority()
    if target_root != Path("/"):
        raise ContractError("apply target_root must be exactly /")
    current = validate_target_bundle(bundle)
    if current["bundleManifestSha256"] != validation["bundleManifestSha256"]:
        raise ContractError("target bundle changed after validation")
    manifest = current["manifest"]
    activation = manifest["activation"]
    fresh_marker = Path(activation["freshStateMarker"])
    for stale in (TELEMETRY_STATE, SESSION_ENV, SESSION_ID, fresh_marker):
        if stale.exists():
            raise ContractError(
                f"stale session state blocks target installation: {stale}"
            )

    verify_units_absent(BUNDLE_ONLY_UNITS, runner=runner)
    _run(
        ["systemctl", "start", "open-world-boot-quarantine.service"],
        runner=runner,
    )
    _disable_lab_units(include_bundle_units=False, runner=runner)
    disable_raw_audit_units(runner=runner)
    _run(
        [
            "systemctl",
            "mask",
            "--now",
            *[
                unit
                for unit in ALWAYS_MASKED_UNITS
                if unit not in RAW_AUDIT_UNITS
            ],
        ],
        runner=runner,
    )

    primary_groups = [
        {
            "name": account["primaryGroup"],
            "gid": account["gid"],
        }
        for account in manifest["accounts"]
    ]
    for group in sorted(
        primary_groups
        + [
            {"name": group["name"], "gid": group["gid"]}
            for group in manifest["groups"]
        ],
        key=lambda item: item["gid"],
    ):
        _ensure_group(group["name"], group["gid"], runner=runner)
    for account in sorted(manifest["accounts"], key=lambda item: item["uid"]):
        _ensure_account(account, runner=runner)
    for group in manifest["groups"]:
        for member in group["members"]:
            existing = _run(
                ["getent", "passwd", member],
                runner=runner,
                acceptable_returncodes={0, 2},
            )
            if existing.returncode != 0:
                raise ContractError(f"required group member is missing: {member}")
            _run(
                ["usermod", "--append", "--groups", group["name"], member],
                runner=runner,
            )

    credentials = load_json(
        bundle / "installer-private/synthetic-credentials.json"
    )
    sales = [
        account
        for account in credentials.get("accounts", [])
        if account.get("username") == "sales"
    ]
    if (
        credentials.get("trainingOnly") is not True
        or len(sales) != 1
        or not isinstance(sales[0].get("password"), str)
        or not sales[0]["password"]
    ):
        raise ContractError("synthetic sales credential contract is invalid")
    _run(
        ["chpasswd"],
        input_text=f"sales:{sales[0]['password']}\n",
        runner=runner,
    )

    debian_entries = [
        entry for entry in manifest["files"] if entry["role"] == "debian"
    ]
    payload_entries, fresh_marker_entry = _split_fresh_marker_entry(
        debian_entries, activation["freshStateMarker"]
    )
    file_targets = {entry["target"] for entry in debian_entries}
    file_targets.add(activation["suidTarget"])
    for entry in sorted(
        manifest["directories"],
        key=lambda item: (
            len(PurePosixPath(item["path"]).parts),
            item["path"],
        ),
    ):
        if entry["path"] in file_targets:
            continue
        target = _safe_target(target_root, entry["path"])
        _ensure_real_directory(target, int(entry["mode"], 8))
        _apply_owner_mode(
            target,
            owner=entry["owner"],
            group=entry["group"],
            mode=entry["mode"],
        )
    for entry in sorted(payload_entries, key=lambda item: item["target"]):
        source = bundle / "debian-rootfs" / entry["path"]
        if hashlib.sha256(source.read_bytes()).hexdigest() != entry["sha256"]:
            raise ContractError(f"bundle source changed during copy: {entry['path']}")
        _copy_atomic(
            source,
            _safe_target(target_root, entry["target"]),
            owner=entry["owner"],
            group=entry["group"],
            mode=entry["mode"],
        )

    _compile_suid(
        Path(activation["suidSource"]),
        Path(activation["suidTarget"]),
        runner=runner,
    )
    event_directory_spec = activation["eventKeyDirectory"]
    event_key_directory = Path(event_directory_spec["path"])
    _ensure_real_directory(
        event_key_directory, int(event_directory_spec["mode"], 8)
    )
    _apply_owner_mode(
        event_key_directory,
        owner=event_directory_spec["owner"],
        group=event_directory_spec["group"],
        mode=event_directory_spec["mode"],
    )
    for spec in activation["eventKeys"].values():
        _write_secret_atomic(
            Path(spec["path"]),
            spec["randomBytes"],
            owner=spec["owner"],
            group=spec["group"],
            mode=spec["mode"],
        )

    _append_exactly_once(
        Path("/etc/samba/smb.conf"), activation["sambaInclude"]
    )
    pam_line_source = Path(activation["pamAppendFile"])
    pam_lines = [
        line.strip()
        for line in pam_line_source.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    if len(pam_lines) != 1:
        raise ContractError("PAM appendix must contain exactly one active line")
    _append_exactly_once(Path("/etc/pam.d/sshd"), pam_lines[0])
    _configure_apache(runner=runner)

    for command in (
        ["sshd", "-t"],
        ["testparm", "-s"],
        ["exportfs", "-ra"],
    ):
        _run(command, runner=runner)
    _run(["systemctl", "daemon-reload"], runner=runner)
    _disable_lab_units(include_bundle_units=True, runner=runner)
    disable_raw_audit_units(runner=runner)
    _run(
        [
            "systemctl",
            "mask",
            "--now",
            *[
                unit
                for unit in ALWAYS_MASKED_UNITS
                if unit not in RAW_AUDIT_UNITS
            ],
        ],
        runner=runner,
    )
    _run(
        [
            "systemctl",
            "enable",
            "open-world-boot-quarantine.service",
            "open-world-maintenance.target",
        ],
        runner=runner,
    )
    _run(
        ["systemctl", "start", "open-world-maintenance.target"],
        runner=runner,
    )
    verify_units_masked_inactive(ALWAYS_MASKED_UNITS, runner=runner)
    fresh_marker_source = bundle / "debian-rootfs" / fresh_marker_entry["path"]
    if (
        hashlib.sha256(fresh_marker_source.read_bytes()).hexdigest()
        != fresh_marker_entry["sha256"]
    ):
        raise ContractError("fresh-state marker changed before final commit")
    _copy_atomic(
        fresh_marker_source,
        fresh_marker,
        owner=fresh_marker_entry["owner"],
        group=fresh_marker_entry["group"],
        mode=fresh_marker_entry["mode"],
    )
    _, telemetry_gid = _owner_ids("root", "lab-telemetry")
    if (
        not fresh_marker.is_file()
        or fresh_marker.is_symlink()
        or (fresh_marker.stat().st_mode & 0o777) != 0o400
        or fresh_marker.stat().st_uid != 0
        or fresh_marker.stat().st_gid != telemetry_gid
    ):
        raise ContractError("trusted fresh-state marker was not installed safely")
    return {
        "applied": True,
        "operation": "install-open-world-target",
        "bundleManifestSha256": current["bundleManifestSha256"],
        "debianFilesInstalled": len(debian_entries),
        "eventKeysGenerated": len(activation["eventKeys"]),
        "windowsOfflineCopiedToDebian": False,
        "servicesEnabled": [
            "open-world-boot-quarantine.service",
            "open-world-maintenance.target",
        ],
        "physicalVerificationRequired": True,
    }
