import test from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";

// Mocking dependencies is tricky with ES modules, so we'll test the core logic
// by ensuring the config is written and then calling the functions.
import { getSecurityAllowList, resetSecurityAllowListCache, addToSecurityConfig, SECURITY_CONFIG_PATH } from "../../config/system-policy.ts";
import { isBlocked, extractCommandNames } from "./command-executor.ts";

test("extractCommandNames", async (t) => {
    await t.test("extracts single command", () => {
        assert.deepEqual(extractCommandNames("ls"), ["ls"]);
    });

    await t.test("extracts multiple commands in pipe", () => {
        assert.deepEqual(extractCommandNames("ls -la | grep foo | awk '{print $1}'"), ["ls", "grep", "awk"]);
    });

    await t.test("ignores env assignments", () => {
        assert.deepEqual(extractCommandNames("FOO=bar ls"), ["ls"]);
    });

    await t.test("extracts wrapped commands", () => {
        const cmds = extractCommandNames("sudo apt-get update");
        assert.ok(cmds.includes("sudo"));
        assert.ok(cmds.includes("apt-get"));
    });
});

test("Command Policy Integration", async (t) => {
    // Save original allow list
    resetSecurityAllowListCache();
    let originalConfig = "[]";
    if (fs.existsSync(SECURITY_CONFIG_PATH)) {
        originalConfig = fs.readFileSync(SECURITY_CONFIG_PATH, "utf8");
    }

    t.after(() => {
        // Restore original config
        fs.writeFileSync(SECURITY_CONFIG_PATH, originalConfig, "utf8");
        resetSecurityAllowListCache();
    });

    await t.test("isBlocked returns true for unapproved command", async () => {
        fs.writeFileSync(SECURITY_CONFIG_PATH, JSON.stringify(["cat"]), "utf8");
        resetSecurityAllowListCache();

        assert.strictEqual(isBlocked("rm -rf /"), true);
    });

    await t.test("isBlocked returns false for approved command", async () => {
        fs.writeFileSync(SECURITY_CONFIG_PATH, JSON.stringify(["ls"]), "utf8");
        resetSecurityAllowListCache();

        assert.strictEqual(isBlocked("ls -la"), false);
    });

    await t.test("isBlocked respects wildcard", async () => {
        fs.writeFileSync(SECURITY_CONFIG_PATH, JSON.stringify(["*"]), "utf8");
        resetSecurityAllowListCache();

        assert.strictEqual(isBlocked("any_command"), false);
    });

    await t.test("addToSecurityConfig updates allowlist", async () => {
        fs.writeFileSync(SECURITY_CONFIG_PATH, JSON.stringify([]), "utf8");
        resetSecurityAllowListCache();

        await addToSecurityConfig(["git"]);

        const allowList = getSecurityAllowList();
        assert.ok(allowList.includes("git"));
        assert.strictEqual(isBlocked("git status"), false);
    });
});
