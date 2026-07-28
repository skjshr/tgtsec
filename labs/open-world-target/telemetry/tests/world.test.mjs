import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  getPrivateFlagAnswer,
} from "../../world/private-answers.mjs";
import {
  getVerifierFlagIds,
  verifyFlagAnswer,
} from "../../world/flag-verifiers.mjs";
import { materializeFlags } from "../../world/materialize-flags.mjs";
import {
  validatePrivateAnswers,
} from "../../world/validate-private-answers.mjs";
import { validateWorld } from "../../world/validate-world.mjs";
import { WORLD } from "../../world/world-definition.mjs";

test("world contract has 3 entrances, 3 footholds, 3 root paths, 14 flags, and 9 combinations", () => {
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
      flags: 14,
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

test("runtime verifiers match build-only answers without carrying plaintext", async () => {
  validatePrivateAnswers();
  const flagIds = WORLD.flags.map((flag) => flag.id).sort();
  const randomSuffixes = flagIds.map((flagId) => {
    const answer = getPrivateFlagAnswer(flagId);
    const suffix = answer.slice(answer.lastIndexOf("_") + 1, -1);
    assert.match(suffix, /^[a-f0-9]{32,}$/);
    assert.equal(suffix.length % 2, 0);
    return suffix;
  });
  assert.equal(new Set(randomSuffixes).size, flagIds.length);
  assert.deepEqual(getVerifierFlagIds().sort(), flagIds);
  for (const flagId of flagIds) {
    assert.equal(
      verifyFlagAnswer(getPrivateFlagAnswer(flagId)),
      flagId,
    );
  }
  assert.equal(verifyFlagAnswer("FLAG{wrong}"), null);
  assert.match(
    getPrivateFlagAnswer("flag-windows"),
    /^FLAG\{ow_windows_archive_[a-f0-9]{48}\}$/,
  );

  const sessionEngine = await readFile(
    new URL("../src/session-engine.mjs", import.meta.url),
    "utf8",
  );
  assert.ok(!sessionEngine.includes("private-answers"));
  assert.ok(sessionEngine.includes("flag-verifiers"));

  const runtimeValidator = await readFile(
    new URL("../../world/validate-world.mjs", import.meta.url),
    "utf8",
  );
  const verifierSource = await readFile(
    new URL("../../world/flag-verifiers.mjs", import.meta.url),
    "utf8",
  );
  assert.ok(!runtimeValidator.includes("private-answers"));
  for (const flagId of flagIds) {
    assert.ok(!verifierSource.includes(getPrivateFlagAnswer(flagId)));
  }
});

test("flag materializer creates exactly 14 synthetic files without overwriting", async (context) => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "open-world-flags-"),
  );
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));

  const written = await materializeFlags(temporaryRoot);
  assert.equal(written.length, 14);
  assert.equal(new Set(written).size, 14);

  for (const flag of WORLD.flags) {
    const destination = path.join(temporaryRoot, flag.location);
    assert.equal(
      await readFile(destination, "utf8"),
      `${getPrivateFlagAnswer(flag.id)}\n`,
    );
    const metadata = await stat(destination);
    assert.ok(metadata.isFile());
  }

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
