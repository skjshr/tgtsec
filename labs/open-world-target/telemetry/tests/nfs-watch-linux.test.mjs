import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test(
  "Linux kernel IN_ACCESS reaches HMAC-authenticated ingest",
  {
    skip:
      process.platform === "linux"
        ? false
        : "requires Linux inotify; runs on Ubuntu CI",
    timeout: 30_000,
  },
  async () => {
    const script = fileURLToPath(
      new URL("./nfs-watch.integration.py", import.meta.url),
    );
    const { stdout, stderr } = await execFileAsync(
      "python3",
      [script],
      {
        encoding: "utf8",
        timeout: 20_000,
        windowsHide: true,
      },
    );
    assert.equal(stderr, "");
    assert.match(
      stdout,
      /kernel IN_ACCESS -> HMAC emitter -> authenticated ingest: PASS/,
    );
    assert.match(
      stdout,
      /delivery failure -> nonzero exit: PASS/,
    );
  },
);
