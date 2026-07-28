import { chmod, mkdir, open } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { getPrivateFlagAnswer } from "./private-answers.mjs";
import { validatePrivateAnswers } from "./validate-private-answers.mjs";
import { WORLD } from "./world-definition.mjs";

function assertSafeDestination(destinationRoot) {
  if (!path.isAbsolute(destinationRoot)) {
    throw new Error("destination root must be an absolute path");
  }
  const resolved = path.resolve(destinationRoot);
  if (resolved === path.parse(resolved).root) {
    throw new Error("refusing to materialize flags at a filesystem root");
  }
  return resolved;
}

export async function materializeFlags(destinationRoot, { force = false } = {}) {
  validatePrivateAnswers();
  const resolvedRoot = assertSafeDestination(destinationRoot);
  const written = [];

  for (const flag of WORLD.flags) {
    const destination = path.resolve(resolvedRoot, flag.location);
    const relative = path.relative(resolvedRoot, destination);
    if (
      relative.startsWith("..") ||
      path.isAbsolute(relative) ||
      relative.length === 0
    ) {
      throw new Error(`unsafe flag location: ${flag.location}`);
    }

    await mkdir(path.dirname(destination), { recursive: true });
    const handle = await open(destination, force ? "w" : "wx", flag.mode);
    try {
      await handle.writeFile(`${getPrivateFlagAnswer(flag.id)}\n`, "utf8");
    } finally {
      await handle.close();
    }
    await chmod(destination, flag.mode);
    written.push(destination);
  }

  return written;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;
if (invokedPath === import.meta.url) {
  const destinationRoot = process.argv[2];
  if (!destinationRoot) {
    process.stderr.write(
      "usage: node materialize-flags.mjs /absolute/staging/root [--force]\n",
    );
    process.exitCode = 2;
  } else {
    const written = await materializeFlags(destinationRoot, {
      force: process.argv.includes("--force"),
    });
    process.stdout.write(`materialized ${written.length} training flags\n`);
  }
}
