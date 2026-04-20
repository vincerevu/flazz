import test from "node:test";
import assert from "node:assert/strict";
import { getProviderStatus, listSupportedProviderDescriptors } from "../provider-registry.js";
import { PROVIDER_CATALOG } from "../provider-catalog.js";

test("provider catalog keeps a curated production-grade provider set", () => {
  assert.ok(PROVIDER_CATALOG.length >= 31, `expected at least 31 providers, got ${PROVIDER_CATALOG.length}`);
  assert.ok(PROVIDER_CATALOG.length <= 36, `expected a curated provider set, got ${PROVIDER_CATALOG.length}`);
});

test("supported descriptors cover normalized providers only", () => {
  const supported = listSupportedProviderDescriptors();
  const normalizedProviders = PROVIDER_CATALOG.filter((entry) => entry.normalizedSupport !== "none");
  assert.equal(supported.length, normalizedProviders.length);
  assert.ok(supported.length >= 31, `expected at least 31 normalized providers, got ${supported.length}`);
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
  assert.equal(status.normalizedSupport, "full");
  assert.equal(status.resourceType, "ticket");
  assert.equal(status.genericRequestPolicy, "list_recent_first");
  assert.equal(status.genericRequestTarget, "assigned issues and pull requests");
});

test("generic request policies are exposed for providers with strong defaults", () => {
  const gmail = getProviderStatus("gmail", true);
  const slack = getProviderStatus("slack", true);
  const linkedin = getProviderStatus("linkedin", true);
  const googleMeet = getProviderStatus("googlemeet", true);
  const pexels = getProviderStatus("pexels", true);

  assert.equal(gmail.genericRequestPolicy, "list_recent_first");
  assert.equal(gmail.genericRequestTarget, "recent email inbox");
  assert.equal(slack.genericRequestPolicy, "needs_explicit_scope");
  assert.equal(slack.genericRequestTarget, "specific channel or thread");
  assert.equal(linkedin.normalizedSupport, "full");
  assert.equal(linkedin.resourceType, "record");
  assert.equal(linkedin.genericRequestTarget, "your profile, managed company pages, or a post draft");
  assert.equal(googleMeet.normalizedSupport, "full");
  assert.equal(googleMeet.resourceType, "event");
  assert.equal(googleMeet.genericRequestPolicy, "needs_explicit_scope");
  assert.equal(pexels.normalizedSupport, "read_only");
  assert.equal(pexels.resourceType, "file");
  assert.equal(pexels.genericRequestPolicy, "search_first");
  assert.deepEqual(pexels.capabilities, ["list", "search", "read"]);
});

test("providers without live toolkit coverage are exposed as unsupported instead of stale normalized support", () => {
  const teams = getProviderStatus("teams", true);
  const discord = getProviderStatus("discord", true);
  const front = getProviderStatus("front", true);
  const snowflake = getProviderStatus("snowflake", true);
  const pagerDuty = getProviderStatus("pagerduty", true);

  assert.equal(teams.normalizedSupported, false);
  assert.equal(teams.normalizedSupport, "none");
  assert.equal(discord.normalizedSupport, "none");
  assert.equal(front.normalizedSupport, "none");
  assert.equal(snowflake.normalizedSupport, "none");
  assert.equal(pagerDuty.normalizedSupport, "none");
});

test("p2 providers expose only live-verified support levels", () => {
  const shortcut = getProviderStatus("shortcut", true);
  const wrike = getProviderStatus("wrike", true);
  const miro = getProviderStatus("miro", true);
  const zoom = getProviderStatus("zoom", true);
  const box = getProviderStatus("box", true);
  const sentry = getProviderStatus("sentry", true);

  assert.equal(shortcut.normalizedSupport, "full");
  assert.deepEqual(shortcut.capabilities, ["list", "search", "read", "create", "update", "comment"]);
  assert.equal(wrike.normalizedSupport, "full");
  assert.deepEqual(wrike.capabilities, ["list", "read", "create", "update"]);
  assert.equal(miro.normalizedSupport, "read_only");
  assert.deepEqual(miro.capabilities, ["list", "search", "read"]);
  assert.equal(zoom.normalizedSupport, "full");
  assert.deepEqual(zoom.capabilities, ["list", "read", "create", "update"]);
  assert.equal(box.normalizedSupport, "read_only");
  assert.deepEqual(box.capabilities, ["list", "search", "read"]);
  assert.equal(sentry.normalizedSupport, "read_only");
  assert.deepEqual(sentry.capabilities, ["list", "search", "read"]);
});
