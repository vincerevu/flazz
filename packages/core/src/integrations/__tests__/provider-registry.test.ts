import test from "node:test";
import assert from "node:assert/strict";
import { getProviderStatus, listSupportedProviderDescriptors } from "../provider-registry.js";
import { PROVIDER_CATALOG } from "../provider-catalog.js";

test("provider catalog declares at least 50 common providers", () => {
  assert.ok(PROVIDER_CATALOG.length >= 50, `expected at least 50 providers, got ${PROVIDER_CATALOG.length}`);
});

test("supported descriptors cover normalized providers only", () => {
  const supported = listSupportedProviderDescriptors();
  assert.ok(supported.length >= 50 - 5);
  assert.ok(supported.every((entry) => entry.capabilities.length > 0));
});

test("unknown provider status defaults to connected but unsupported", () => {
  const status = getProviderStatus("unknown-provider", true);
  assert.equal(status.connected, true);
  assert.equal(status.normalizedSupported, false);
  assert.equal(status.normalizedSupport, "none");
});

test("known provider status reports read-only support when configured that way", () => {
  const status = getProviderStatus("github", true);
  assert.equal(status.connected, true);
  assert.equal(status.normalizedSupported, true);
  assert.equal(status.normalizedSupport, "read_only");
  assert.equal(status.resourceType, "ticket");
});
