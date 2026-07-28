from __future__ import annotations

import json
import os
import secrets
import tempfile
from pathlib import Path
from typing import Callable

from .model import ContractError, canonical_json


FRESH_MARKER_CONTENT = {
    "schemaVersion": 1,
    "state": "fresh",
    "source": "trusted-bundle-or-recovery",
}
DEFAULT_FRESH_MARKER = Path(
    "/var/lib/examserver-open-world/fresh-state.json"
)
DEFAULT_STATE_PATH = Path(
    "/var/lib/examserver-open-world/telemetry-state.json"
)
DEFAULT_ENV_PATH = Path("/etc/examserver-open-world/session.env")
DEFAULT_RUNTIME_ID_PATH = Path("/run/examserver-open-world/session-id")
ENVIRONMENT_PARENT_MODE = 0o711
RUNTIME_PARENT_MODE = 0o750


def _read_fresh_marker(path: Path) -> None:
    if not path.is_file() or path.is_symlink():
        raise ContractError(
            "trusted fresh-state marker is missing; restore before a new exercise"
        )
    if os.name == "posix":
        metadata = path.stat()
        validate_fresh_marker_metadata(
            uid=metadata.st_uid, mode=metadata.st_mode & 0o777
        )
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ContractError("trusted fresh-state marker is invalid") from exc
    if value != FRESH_MARKER_CONTENT:
        raise ContractError("trusted fresh-state marker content does not match")


def validate_fresh_marker_metadata(*, uid: int, mode: int) -> None:
    if uid != 0 or mode != 0o400:
        raise ContractError(
            "trusted fresh-state marker must be root-owned with mode 0400"
        )


def _atomic_write(
    path: Path,
    content: bytes,
    *,
    mode: int,
    uid: int,
    gid: int,
    chown: Callable[[Path, int, int], None],
) -> None:
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", dir=path.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as destination:
            destination.write(content)
            destination.flush()
            os.fsync(destination.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
        chown(path, uid, gid)
    finally:
        temporary.unlink(missing_ok=True)


def _prepare_parent(
    path: Path,
    *,
    mode: int,
    gid: int,
    chown: Callable[[Path, int, int], None],
) -> None:
    parent = path.parent
    if parent.exists():
        if parent.is_symlink() or not parent.is_dir():
            raise ContractError(f"session parent is not a safe directory: {parent}")
    else:
        if not parent.parent.is_dir() or parent.parent.is_symlink():
            raise ContractError(
                f"session parent base is not a safe directory: {parent.parent}"
            )
        parent.mkdir(mode=mode)
    os.chmod(parent, mode)
    chown(parent, 0, gid)


def prepare_fresh_session(
    *,
    fresh_marker: Path = DEFAULT_FRESH_MARKER,
    state_path: Path = DEFAULT_STATE_PATH,
    environment_path: Path = DEFAULT_ENV_PATH,
    runtime_id_path: Path = DEFAULT_RUNTIME_ID_PATH,
    session_factory: Callable[[], str] | None = None,
    bridge_token_factory: Callable[[], str] | None = None,
    group_lookup: Callable[[str], int] | None = None,
    chown: Callable[[Path, int, int], None] | None = None,
) -> str:
    _read_fresh_marker(fresh_marker)
    stale = [
        path
        for path in (state_path, environment_path, runtime_id_path)
        if path.exists()
    ]
    if stale:
        raise ContractError(
            "stale telemetry/session state exists; trusted restore is required: "
            + ", ".join(str(path) for path in stale)
        )

    session_id = (
        session_factory()
        if session_factory is not None
        else "exercise-" + secrets.token_hex(16)
    )
    if not isinstance(session_id, str) or not session_id.startswith("exercise-"):
        raise ContractError("session factory returned an unsafe session ID")
    suffix = session_id.removeprefix("exercise-")
    if not suffix or len(session_id) > 80 or not suffix.replace("-", "").isalnum():
        raise ContractError("session factory returned an unsafe session ID")
    bridge_token = (
        bridge_token_factory()
        if bridge_token_factory is not None
        else secrets.token_hex(32)
    )
    if (
        not isinstance(bridge_token, str)
        or not 32 <= len(bridge_token) <= 512
        or any(not 33 <= ord(character) <= 126 for character in bridge_token)
    ):
        raise ContractError("bridge token factory returned an unsafe token")

    if group_lookup is None:
        try:
            import grp
        except ImportError as exc:
            raise ContractError("POSIX group lookup is unavailable") from exc
        lookup = lambda name: grp.getgrnam(name).gr_gid
    else:
        lookup = group_lookup
    change_owner = chown or (lambda path, uid, gid: os.chown(path, uid, gid))
    try:
        telemetry_gid = lookup("lab-telemetry")
        event_gid = lookup("lab-events")
    except KeyError as exc:
        raise ContractError(f"required session group is missing: {exc}") from exc
    _prepare_parent(
        environment_path,
        mode=ENVIRONMENT_PARENT_MODE,
        gid=0,
        chown=change_owner,
    )
    _prepare_parent(
        runtime_id_path,
        mode=RUNTIME_PARENT_MODE,
        gid=event_gid,
        chown=change_owner,
    )
    _atomic_write(
        environment_path,
        (
            f"LAB_SESSION_ID={session_id}\n"
            f"TELEMETRY_BRIDGE_TOKEN={bridge_token}\n"
        ).encode("ascii"),
        mode=0o640,
        uid=0,
        gid=telemetry_gid,
        chown=change_owner,
    )
    try:
        _atomic_write(
            runtime_id_path,
            f"{session_id}\n".encode("ascii"),
            mode=0o640,
            uid=0,
            gid=event_gid,
            chown=change_owner,
        )
    except Exception:
        environment_path.unlink(missing_ok=True)
        raise
    fresh_marker.unlink()
    return session_id


def fresh_marker_bytes() -> bytes:
    return canonical_json(FRESH_MARKER_CONTENT)
