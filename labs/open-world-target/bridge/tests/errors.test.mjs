import assert from "node:assert/strict";
import test from "node:test";

import { redactText, writeSafeError } from "../src/errors.mjs";

test("secret-safe errors redact known tokens, bearer values, flags, and URL credentials", () => {
  const secret = "session-upload-token-that-must-never-be-printed";
  const input = new Error(
    `failed Bearer other-secret token=${secret} ` +
      `https://user:password@example.test FLAG{private}`,
  );
  const redacted = redactText(input, [secret]);

  assert.doesNotMatch(redacted, /other-secret/);
  assert.doesNotMatch(redacted, /session-upload/);
  assert.doesNotMatch(redacted, /password@example/);
  assert.doesNotMatch(redacted, /FLAG\{/);
  assert.match(redacted, /REDACTED/);

  let written = "";
  writeSafeError((value) => {
    written += value;
  }, "cloud_retry", input, { secrets: [secret] });
  assert.match(written, /^bridge_error code=cloud_retry/);
  assert.doesNotMatch(written, /session-upload|FLAG\{|password@example/);
});
