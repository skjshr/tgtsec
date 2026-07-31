import { randomBytes } from "node:crypto";
import { chmod, mkdir, open } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { validateWorld } from "./validate-world.mjs";
import { WORLD } from "./world-definition.mjs";

const FLAG_RANDOM_BYTES = 24;

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

function generateFlagAnswer() {
  const random = randomBytes(FLAG_RANDOM_BYTES);
  return `FLAG{ow_${random.toString("hex")}}`;
}

export async function materializeFlags(destinationRoot) {
  validateWorld();
  const resolvedRoot = assertSafeDestination(destinationRoot);
  const written = [];
  const answers = WORLD.flags.map(() => generateFlagAnswer());
  if (new Set(answers).size !== answers.length) {
    throw new Error("flag entropy source generated a duplicate answer");
  }

  for (const [index, flag] of WORLD.flags.entries()) {
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
    const handle = await open(destination, "wx", flag.mode);
    try {
      await handle.writeFile(`${answers[index]}\n`, "utf8");
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
      "usage: node materialize-flags.mjs /absolute/new-staging/root\n",
    );
    process.exitCode = 2;
  } else {
    const written = await materializeFlags(destinationRoot);
    process.stdout.write(`generated ${written.length} optional flags\n`);
  }
}
