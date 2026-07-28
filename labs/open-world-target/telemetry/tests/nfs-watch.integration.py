#!/usr/bin/python3
"""Linux regression: kernel IN_ACCESS reaches authenticated production ingest."""

from __future__ import annotations

import os
import select
import shutil
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WATCHER = (
    ROOT
    / "world"
    / "fixtures"
    / "rootfs"
    / "usr"
    / "local"
    / "libexec"
    / "open-world-nfs-watch"
)
EMITTER_MODULE = ROOT / "telemetry" / "bin" / "emit-event.mjs"
INGEST_HARNESS = (
    ROOT / "telemetry" / "tests" / "nfs-watch-ingest-harness.mjs"
)


def ready_line(process: subprocess.Popen[str], label: str) -> str:
    assert process.stdout is not None
    readable, _, _ = select.select([process.stdout], [], [], 10)
    if not readable:
        raise AssertionError(f"{label} readiness timed out")
    return process.stdout.readline().strip()


def stop_if_running(process: subprocess.Popen[str] | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=3)


def main() -> int:
    if os.name != "posix":
        raise SystemExit("nfs-watch integration requires Linux")
    node = shutil.which("node")
    if node is None:
        raise SystemExit("nfs-watch integration requires Node.js")

    with tempfile.TemporaryDirectory(prefix="open-world-nfs-watch-") as directory:
        temporary = Path(directory)
        watched = temporary / "ENTRY-NFS.flag"
        socket_path = temporary / "events.sock"
        root_key_path = temporary / "root.key"
        emitter = temporary / "open-world-event"
        watched.write_text("training flag\n", encoding="ascii")
        root_key_path.write_text(
            "root-nfs-integration-key-at-least-32-bytes\n",
            encoding="ascii",
        )
        emitter.write_text(
            "#!/bin/sh\n"
            'exec "$OPEN_WORLD_NODE" "$OPEN_WORLD_EMITTER_MODULE" "$@"\n',
            encoding="ascii",
        )
        emitter.chmod(0o755)
        environment = {
            **os.environ,
            "LAB_SESSION_ID": "nfs-kernel-integration",
            "LAB_EVENT_SOCKET": str(socket_path),
            "LAB_EVENT_ROOT_KEY_FILE": str(root_key_path),
            "OPEN_WORLD_EMITTER_MODULE": str(EMITTER_MODULE),
            "OPEN_WORLD_NODE": node,
        }
        environment.pop("NOTIFY_SOCKET", None)

        ingest: subprocess.Popen[str] | None = subprocess.Popen(
            [node, str(INGEST_HARNESS)],
            env=environment,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        watcher: subprocess.Popen[str] | None = None
        try:
            ingest_ready = ready_line(ingest, "ingest")
            if ingest_ready != "ingest-ready":
                raise AssertionError(
                    f"ingest returned unexpected readiness: {ingest_ready}"
                )

            watcher = subprocess.Popen(
                [
                    "/usr/bin/python3",
                    str(WATCHER),
                    "--watch",
                    str(watched),
                    "--emitter",
                    str(emitter),
                    "--once",
                ],
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            watcher_ready = ready_line(watcher, "watcher")
            if watcher_ready != "watch-ready":
                raise AssertionError(
                    f"watcher returned unexpected readiness: {watcher_ready}"
                )

            replacement = temporary / "replacement.flag"
            replacement.write_text("training flag\n", encoding="ascii")
            os.replace(replacement, watched)
            with watched.open("rb") as flag_file:
                assert flag_file.read() == b"training flag\n"

            watcher_stdout, watcher_stderr = watcher.communicate(timeout=10)
            if watcher.returncode != 0:
                raise AssertionError(
                    f"watcher failed ({watcher.returncode}): "
                    f"{watcher_stdout} {watcher_stderr}"
                )
            ingest_stdout, ingest_stderr = ingest.communicate(timeout=10)
            if ingest.returncode != 0:
                raise AssertionError(
                    f"ingest failed ({ingest.returncode}): "
                    f"{ingest_stdout} {ingest_stderr}"
                )
            if (
                '"discovered":1' not in ingest_stdout
                or '"整備場のNFS共有"' not in ingest_stdout
            ):
                raise AssertionError(
                    f"unexpected projection: {ingest_stdout}"
                )
        finally:
            stop_if_running(watcher)
            stop_if_running(ingest)

        failing_watcher: subprocess.Popen[str] | None = subprocess.Popen(
            [
                "/usr/bin/python3",
                str(WATCHER),
                "--watch",
                str(watched),
                "--emitter",
                "/bin/false",
                "--once",
            ],
            env=environment,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            if ready_line(failing_watcher, "failing watcher") != "watch-ready":
                raise AssertionError("failing watcher did not become ready")
            with watched.open("rb") as flag_file:
                assert flag_file.read() == b"training flag\n"
            failure_stdout, failure_stderr = failing_watcher.communicate(
                timeout=10
            )
            if failing_watcher.returncode != 1:
                raise AssertionError(
                    f"delivery failure did not fail closed: {failure_stdout}"
                )
            if failure_stderr.strip() != (
                "open-world-nfs-watch: RuntimeError"
            ):
                raise AssertionError(
                    f"unexpected bounded failure output: {failure_stderr}"
                )
        finally:
            stop_if_running(failing_watcher)

    print(
        "nfs-watch integration: kernel IN_ACCESS -> HMAC emitter "
        "-> authenticated ingest: PASS"
    )
    print(
        "nfs-watch integration: delivery failure -> nonzero exit: PASS"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
