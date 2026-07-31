import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { materializeFlags } from "../../world/materialize-flags.mjs";
import { validateWorld } from "../../world/validate-world.mjs";
import { WORLD } from "../../world/world-definition.mjs";

test("world contract has 3 entrances, 3 footholds, 3 root paths, 13 flags, and 9 combinations", () => {
  const result = validateWorld();
  assert.deepEqual(
    {
      entrances: result.entrances,
      footholds: result.footholds,
      rootPaths: result.rootPaths,
      flags: result.flags,
      combinations: result.viableCombinations.length,
    },
    {
      entrances: 3,
      footholds: 3,
      rootPaths: 3,
      flags: 13,
      combinations: 9,
    },
  );

  const combinations = new Set(
    result.viableCombinations.map(
      ({ entranceId, rootPathId }) => `${entranceId}:${rootPathId}`,
    ),
  );
  for (const entranceId of WORLD.entranceIds) {
    for (const rootPathId of WORLD.rootPathIds) {
      assert.ok(combinations.has(`${entranceId}:${rootPathId}`));
    }
  }
});

test("public world source contains no fixed flag answers or verifier table", async () => {
  const worldRoot = new URL("../../world/", import.meta.url);
  const names = await readdir(worldRoot);
  assert.ok(!names.includes("private-answers.mjs"));
  assert.ok(!names.includes("validate-private-answers.mjs"));
  assert.ok(!names.includes("flag-verifiers.mjs"));

  const publicSources = await Promise.all(
    names
      .filter((name) => name.endsWith(".mjs"))
      .map((name) => readFile(new URL(name, worldRoot), "utf8")),
  );
  assert.ok(
    publicSources.every(
      (source) => !/FLAG\{ow_[a-f0-9]{32,}\}/.test(source),
    ),
  );
  const sessionEngine = await readFile(
    new URL("../src/session-engine.mjs", import.meta.url),
    "utf8",
  );
  assert.ok(!sessionEngine.includes("private-answers"));
  const runtimeValidator = await readFile(
    new URL("../../world/validate-world.mjs", import.meta.url),
    "utf8",
  );
  assert.ok(!runtimeValidator.includes("private-answers"));
  assert.ok(!runtimeValidator.includes("flag-verifiers"));
});

test("flag materializer generates 13 unique random answers without overwriting", async (context) => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "open-world-flags-"),
  );
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));

  const written = await materializeFlags(temporaryRoot);
  assert.equal(written.length, 13);
  assert.equal(new Set(written).size, 13);

  const answers = [];
  for (const flag of WORLD.flags) {
    const destination = path.join(temporaryRoot, flag.location);
    const answer = await readFile(destination, "utf8");
    assert.match(answer, /^FLAG\{ow_[a-f0-9]{48}\}\n$/);
    assert.ok(!answer.includes(flag.id));
    answers.push(answer);
    const metadata = await stat(destination);
    assert.ok(metadata.isFile());
  }
  assert.equal(new Set(answers).size, WORLD.flags.length);

  await assert.rejects(
    materializeFlags(temporaryRoot),
    (error) => error?.code === "EEXIST",
  );
  await assert.rejects(
    materializeFlags("relative-root"),
    /absolute path/,
  );
  await assert.rejects(
    materializeFlags(path.parse(temporaryRoot).root),
    /filesystem root/,
  );
});
