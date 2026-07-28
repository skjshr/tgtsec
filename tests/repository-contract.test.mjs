import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("active contracts describe the open-world lab", () => {
  const constitution = read("PROJECT_CONSTITUTION.md");
  const task = read("TASK_CONTRACT.md");
  const readme = read("README.md");

  for (const required of [
    "3つの入口",
    "3つの実機root経路",
    "14個のflag",
    "30〜60分",
  ]) {
    assert.match(
      `${constitution}\n${task}\n${readme}`,
      new RegExp(required),
      `missing contract phrase: ${required}`,
    );
  }

  assert.match(constitution, /生コマンドや秘密を集め/);
  assert.match(task, /Root completion is the last trustworthy automatic event/);
});

test("accepted visual references are present", () => {
  for (const path of [
    "docs/design/exploration-map.png",
    "docs/design/situation-consultation.png",
  ]) {
    assert.equal(existsSync(resolve(root, path)), true, `${path} is missing`);
  }
});

test("legacy single-route deliverables are no longer active files", () => {
  for (const path of [
    "labs/site-takeover",
    "METHODS.md",
    "WALKTHROUGH-BEGINNER.md",
    ".github/workflows/build-live-iso.yml",
  ]) {
    assert.equal(
      existsSync(resolve(root, path)),
      false,
      `${path} should only remain in git history`,
    );
  }
});

test("implementation roots exist", () => {
  for (const path of [
    "apps/lab-guide",
    "labs/open-world-target/world",
    "labs/open-world-target/telemetry",
    "labs/open-world-target/platform",
    "labs/open-world-target/operator",
  ]) {
    assert.equal(existsSync(resolve(root, path)), true, `${path} is missing`);
  }
});

test("Vercel origin exposes only the ExamServer lab namespace", () => {
  const config = JSON.parse(read("vercel.json"));

  assert.equal(config.outputDirectory, "apps/lab-guide/dist/client");
  assert.deepEqual(
    config.rewrites.map(({ source }) => source),
    ["/api/lab/:path*", "/lab", "/lab/:path*"],
  );
  assert.equal(
    config.redirects[0].destination,
    "https://exam-server-one.vercel.app/lab",
  );
  assert.equal(existsSync(resolve(root, "api/index.mjs")), true);
});
