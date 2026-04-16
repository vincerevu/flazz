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
