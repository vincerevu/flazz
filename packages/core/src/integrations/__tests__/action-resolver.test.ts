import test from "node:test";
import assert from "node:assert/strict";
import { selectBestTool, type ResolvedTool } from "../action-resolver.js";
import { getProviderActionPreferences } from "../provider-action-map.js";
import { PROVIDER_CATALOG } from "../provider-catalog.js";

function tool(slug: string, name: string, description: string): ResolvedTool {
  return {
    slug,
    name,
    description,
    inputParameters: {
      type: "object",
      properties: {},
    },
  };
}

test("selectBestTool prefers strong message search matches", () => {
  const result = selectBestTool(
    [
      tool("GENERIC_GET", "Get data", "Fetch generic object"),
      tool("SLACK_SEARCH_MESSAGES", "Search messages", "Search Slack messages in a conversation"),
      tool("SLACK_LIST_CONVERSATIONS", "List conversations", "List Slack conversations"),
    ],
    "search",
    "message",
  );

  assert.equal(result?.slug, "SLACK_SEARCH_MESSAGES");
});

test("core provider wave has preferred action coverage for read paths", () => {
  const coreProviders = PROVIDER_CATALOG.filter((entry) => entry.wave === "p0" && entry.normalizedSupport !== "none");

  for (const provider of coreProviders) {
    const preferences = getProviderActionPreferences(provider.app);
    assert.ok(
      (preferences.list?.length ?? 0) > 0 || !provider.capabilities.includes("list"),
      `${provider.app} is missing preferred list actions`,
    );
    assert.ok(
      (preferences.read?.length ?? 0) > 0 || !provider.capabilities.includes("read"),
      `${provider.app} is missing preferred read actions`,
    );
    if (provider.capabilities.includes("search")) {
      assert.ok((preferences.search?.length ?? 0) > 0, `${provider.app} is missing preferred search actions`);
    }
  }
});

test("full support providers declare preferred write actions for write capabilities", () => {
  const fullProviders = PROVIDER_CATALOG.filter((entry) => entry.normalizedSupport === "full");

  for (const provider of fullProviders) {
    const preferences = getProviderActionPreferences(provider.app);
    if (provider.capabilities.includes("reply")) {
      assert.ok((preferences.reply?.length ?? 0) > 0, `${provider.app} is missing preferred reply actions`);
    }
    if (provider.capabilities.includes("create")) {
      assert.ok((preferences.create?.length ?? 0) > 0, `${provider.app} is missing preferred create actions`);
    }
    if (provider.capabilities.includes("update")) {
      assert.ok((preferences.update?.length ?? 0) > 0, `${provider.app} is missing preferred update actions`);
    }
    if (provider.capabilities.includes("comment")) {
      assert.ok((preferences.comment?.length ?? 0) > 0, `${provider.app} is missing preferred comment actions`);
    }
  }
});

test("all normalized providers declare preferred read-path actions for their declared capabilities", () => {
  const normalizedProviders = PROVIDER_CATALOG.filter((entry) => entry.normalizedSupport !== "none");

  for (const provider of normalizedProviders) {
    const preferences = getProviderActionPreferences(provider.app);
    if (provider.capabilities.includes("list")) {
      assert.ok((preferences.list?.length ?? 0) > 0, `${provider.app} is missing preferred list actions`);
    }
    if (provider.capabilities.includes("search")) {
      assert.ok((preferences.search?.length ?? 0) > 0, `${provider.app} is missing preferred search actions`);
    }
    if (provider.capabilities.includes("read")) {
      assert.ok((preferences.read?.length ?? 0) > 0, `${provider.app} is missing preferred read actions`);
    }
  }
});

test("github preferred actions target assigned issues and issue reads instead of notification-only flows", () => {
  const preferences = getProviderActionPreferences("github");

  assert.deepEqual(preferences.list?.[0], "GITHUB_LIST_ASSIGNED_ISSUES");
  assert.deepEqual(preferences.search?.[0], "GITHUB_SEARCH_ISSUES_AND_PULL_REQUESTS");
  assert.deepEqual(preferences.read?.[0], "GITHUB_GET_AN_ISSUE");
  assert.deepEqual(preferences.comment?.[0], "GITHUB_CREATE_AN_ISSUE_COMMENT");
  assert.ok(!(preferences.list ?? []).includes("GITHUB_LIST_NOTIFICATIONS_FOR_THE_AUTHENTICATED_USER"));
  assert.ok(!(preferences.read ?? []).includes("GITHUB_GET_A_THREAD"));
});

test("p2 full and read-only providers resolve to live-verified preferred actions", () => {
  const shortcut = getProviderActionPreferences("shortcut");
  const wrike = getProviderActionPreferences("wrike");
  const miro = getProviderActionPreferences("miro");
  const zoom = getProviderActionPreferences("zoom");
  const box = getProviderActionPreferences("box");
  const sentry = getProviderActionPreferences("sentry");

  assert.equal(shortcut.list?.[0], "SHORTCUT_LIST_STORIES");
  assert.equal(shortcut.comment?.[0], "SHORTCUT_CREATE_STORY_COMMENT");
  assert.equal(wrike.update?.[0], "WRIKE_MODIFY_TASK");
  assert.equal(miro.search?.[0], "MIRO_GET_BOARDS");
  assert.equal(zoom.create?.[0], "ZOOM_CREATE_A_MEETING");
  assert.equal(box.search?.[0], "BOX_SEARCH_FOR_CONTENT");
  assert.equal(sentry.read?.[0], "SENTRY_GET_ORGANIZATION_ISSUE_DETAILS");
});
