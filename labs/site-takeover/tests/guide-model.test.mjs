import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDefacePayload,
  classifyCommandOutput,
  classifyDiscoveredPath,
  classifyNoticeOutput,
  classifyScanOutput,
  classifySiteTreeOutput,
  classifyWorkdirOutput,
  homepageShowsTeam,
  normalizeTeamName,
  scoreDebrief,
} from "../guide/guide-model.mjs";

test("nmap output recognizes the HTTP entry without exact full-output matching", () => {
  const result = classifyScanOutput(`
Nmap scan report for 10.13.37.10
PORT   STATE SERVICE VERSION
80/tcp open  http    Apache httpd 2.4.66
`);

  assert.equal(result.ok, true);
});

test("nmap connectivity failure returns a recoverable diagnostic", () => {
  const result = classifyScanOutput("Note: Host seems down.");

  assert.equal(result.ok, false);
  assert.match(result.message, /LANケーブル/);
});

test("robots path accepts a missing trailing slash", () => {
  assert.equal(classifyDiscoveredPath("/staff").ok, true);
  assert.equal(classifyDiscoveredPath("/STAFF/").ok, true);
  assert.equal(classifyDiscoveredPath("/admin/").ok, false);
});

test("command execution requires both the correct intent and www-data evidence", () => {
  assert.equal(classifyCommandOutput("www-data", "identity").ok, true);
  assert.equal(classifyCommandOutput("uid=33(www-data) gid=33(www-data)", "identity").ok, true);
  assert.equal(classifyCommandOutput("www-data", "password").ok, false);
});

test("filesystem observations are recognized by evidence, not prompt formatting", () => {
  assert.equal(classifyWorkdirOutput("PING...\n/srv/shop-site/public/staff\n").ok, true);
  assert.equal(classifySiteTreeOutput("drwxr-xr-x data\ndrwxr-xr-x public\n").ok, true);
  assert.equal(classifyNoticeOutput("本日は通常どおり営業しています。\n").ok, true);
});

test("team name rejects shell control characters", () => {
  assert.equal(normalizeTeamName("TEAM AO").ok, true);
  assert.equal(normalizeTeamName("青チーム_1").ok, true);
  assert.equal(normalizeTeamName("TEAM; id").ok, false);
  assert.equal(normalizeTeamName("$(id)").ok, false);
});

test("deface payload writes only the discovered announcement file", () => {
  const result = buildDefacePayload("TEAM AO");

  assert.equal(result.ok, true);
  assert.match(result.payload, /^127\.0\.0\.1; printf/);
  assert.match(result.payload, /> \.\.\/\.\.\/data\/announcement\.txt$/);
  assert.doesNotMatch(result.payload, /sudo|\/root/);
});

test("homepage check verifies the actual team-specific state", () => {
  const html = "<p>SECURITY TEST SUCCESS: TEAM AO</p>";

  assert.equal(homepageShowsTeam(html, "TEAM AO"), true);
  assert.equal(homepageShowsTeam(html, "TEAM B"), false);
});

test("debrief passes only when all three causal links are correct", () => {
  assert.equal(scoreDebrief({
    where: "target",
    privilege: "limited",
    reason: "file",
  }).ok, true);

  assert.equal(scoreDebrief({
    where: "kali",
    privilege: "limited",
    reason: "file",
  }).ok, false);
});
