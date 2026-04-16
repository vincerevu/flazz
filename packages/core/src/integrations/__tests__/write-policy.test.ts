import test from "node:test";
import assert from "node:assert/strict";
import { enforceWritePolicy } from "../write-policy.js";

test("write policy blocks unconfirmed write actions", () => {
  const result = enforceWritePolicy({
    app: "gmail",
    capability: "reply",
    confirmed: false,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /requires explicit confirmation/i);
  }
});

test("write policy allows confirmed write actions", () => {
  const result = enforceWritePolicy({
    app: "jira",
    capability: "comment",
    confirmed: true,
  });

  assert.equal(result.ok, true);
});

test("write policy ignores read capabilities", () => {
  const result = enforceWritePolicy({
    app: "notion",
    capability: "read",
    confirmed: false,
  });

  assert.equal(result.ok, true);
});
