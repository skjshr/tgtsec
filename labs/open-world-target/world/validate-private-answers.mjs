import { pathToFileURL } from "node:url";

import {
  getPrivateFlagAnswer,
  getPrivateFlagIds,
} from "./private-answers.mjs";
import {
  getVerifierFlagIds,
  verifyFlagAnswer,
} from "./flag-verifiers.mjs";
import { validateWorld } from "./validate-world.mjs";
import { WORLD } from "./world-definition.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function extractRandomSuffix(answer, flagId) {
  assert(
    typeof answer === "string" &&
      answer.startsWith("FLAG{ow_") &&
      answer.endsWith("}"),
    `flag answer has an invalid envelope: ${flagId}`,
  );
  const separator = answer.lastIndexOf("_");
  const suffix = answer.slice(separator + 1, -1);
  assert(
    /^[a-f0-9]+$/.test(suffix) &&
      suffix.length >= 32 &&
      suffix.length % 2 === 0,
    `flag answer must contain at least 128 bits of random hex: ${flagId}`,
  );
  return suffix;
}

export function validatePrivateAnswers(world = WORLD) {
  const result = validateWorld(world);
  const worldFlagIds = new Set(world.flags.map((flag) => flag.id));
  const privateFlagIds = getPrivateFlagIds();
  const verifierFlagIds = getVerifierFlagIds();

  assert(
    new Set(privateFlagIds).size === privateFlagIds.length,
    "private flag ids must be unique",
  );
  assert(
    privateFlagIds.length === worldFlagIds.size &&
      privateFlagIds.every((flagId) => worldFlagIds.has(flagId)),
    "private answers must match the 14 logical flags exactly",
  );
  assert(
    privateFlagIds.length === verifierFlagIds.length &&
      privateFlagIds.every((flagId) => verifierFlagIds.includes(flagId)),
    "private answers and public verifiers must have identical ids",
  );
  const randomSuffixes = [];
  for (const flagId of privateFlagIds) {
    const answer = getPrivateFlagAnswer(flagId);
    assert(
      verifyFlagAnswer(answer) === flagId,
      `verifier digest is stale for ${flagId}`,
    );
    randomSuffixes.push(extractRandomSuffix(answer, flagId));
  }
  assert(
    new Set(randomSuffixes).size === randomSuffixes.length,
    "flag random suffixes must be unique",
  );
  assert(
    extractRandomSuffix(
      getPrivateFlagAnswer("flag-windows"),
      "flag-windows",
    ).length === 48,
    "Windows flag must contain a 192-bit random suffix",
  );
  return result;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;
if (invokedPath === import.meta.url) {
  const result = validatePrivateAnswers();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
