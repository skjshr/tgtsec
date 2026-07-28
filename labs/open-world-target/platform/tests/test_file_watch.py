from __future__ import annotations

import importlib.machinery
import importlib.util
import json
import multiprocessing
import os
import queue
import sys
import tempfile
import unittest
from pathlib import Path


PLATFORM_ROOT = Path(__file__).resolve().parents[1]
WATCHER_PATH = (
    PLATFORM_ROOT
    / "templates/usr/local/libexec/open-world-file-watch"
)


def _load_watcher():
    loader = importlib.machinery.SourceFileLoader(
        "open_world_file_watch_fixture",
        str(WATCHER_PATH),
    )
    spec = importlib.util.spec_from_loader(loader.name, loader)
    if spec is None:
        raise RuntimeError("could not load fixed-path watcher")
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


@unittest.skipUnless(
    sys.platform.startswith("linux"),
    "real inotify coverage requires Linux/WSL",
)
class FixedFileWatchLinuxTests(unittest.TestCase):
    def setUp(self) -> None:
        self.watcher = _load_watcher()
        self.context = multiprocessing.get_context("fork")

    def _fixture(self, root: Path):
        specs = []
        for index, (_path, arguments) in enumerate(
            self.watcher.WATCH_SPECS
        ):
            watched = root / f"watched-{index}.flag"
            watched.write_text("synthetic flag\n", encoding="ascii")
            specs.append((watched, arguments))
        marker = root / "exercise-ready"
        marker.write_text("ready\n", encoding="ascii")
        return tuple(specs), marker

    def _emitter(self, root: Path, *, succeeds: bool) -> tuple[Path, Path]:
        output = root / "emitted.json"
        emitter = root / "emitter"
        emitter.write_text(
            "#!/usr/bin/python3\n"
            "import json, sys\n"
            f"open({json.dumps(str(output))}, 'w', encoding='utf-8').write("
            "json.dumps(sys.argv[1:]))\n"
            f"raise SystemExit({0 if succeeds else 9})\n",
            encoding="ascii",
        )
        emitter.chmod(0o755)
        return emitter, output

    def _start(self, specs, marker, emitter):
        messages = self.context.Queue()
        watcher = self.watcher

        def run() -> None:
            watcher._notify_ready = lambda: messages.put(("ready", None))
            try:
                code = watcher.watch(
                    specs,
                    ready_marker=marker,
                    emitter=emitter,
                    stop_after_events=1,
                )
            except Exception as error:
                messages.put(("error", type(error).__name__))
                raise SystemExit(1)
            raise SystemExit(code)

        process = self.context.Process(target=run)
        process.start()
        kind, detail = messages.get(timeout=5)
        self.assertEqual((kind, detail), ("ready", None))
        return process, messages

    def test_real_in_access_emits_only_the_fixed_tuple(self) -> None:
        with tempfile.TemporaryDirectory(
            prefix="open-world-file-watch-"
        ) as temporary:
            root = Path(temporary)
            specs, marker = self._fixture(root)
            emitter, output = self._emitter(root, succeeds=True)
            process, _messages = self._start(specs, marker, emitter)
            specs[0][0].read_bytes()
            process.join(timeout=5)
            self.assertEqual(process.exitcode, 0)
            self.assertEqual(
                json.loads(output.read_text(encoding="utf-8")),
                list(specs[0][1]),
            )

    def test_delivery_failure_exits_nonzero_for_systemd_fail_close(self) -> None:
        with tempfile.TemporaryDirectory(
            prefix="open-world-file-watch-fail-"
        ) as temporary:
            root = Path(temporary)
            specs, marker = self._fixture(root)
            emitter, _output = self._emitter(root, succeeds=False)
            process, messages = self._start(specs, marker, emitter)
            specs[0][0].read_bytes()
            kind, detail = messages.get(timeout=5)
            self.assertEqual((kind, detail), ("error", "RuntimeError"))
            process.join(timeout=5)
            self.assertNotEqual(process.exitcode, 0)


if __name__ == "__main__":
    unittest.main()
