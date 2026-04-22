import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeMessagesForPrompt, EMPTY_ASSISTANT_FALLBACK_TEXT } from "../prompt-sanitizer.js";

test("sanitizeMessagesForPrompt drops no-output fallback assistant messages", () => {
    const messages = [
        { role: "user", content: "create slides" },
        {
            role: "assistant",
            content: [{ type: "text", text: EMPTY_ASSISTANT_FALLBACK_TEXT }],
        },
        { role: "user", content: "continue" },
    ] as const;

    const sanitized = sanitizeMessagesForPrompt(messages as never);

    assert.deepEqual(sanitized, [
        { role: "user", content: "create slides" },
        { role: "user", content: "continue" },
    ]);
});

test("sanitizeMessagesForPrompt drops orphaned tool results after filtering assistant messages", () => {
    const messages = [
        {
            role: "assistant",
            content: [{ type: "text", text: EMPTY_ASSISTANT_FALLBACK_TEXT }],
        },
        {
            role: "tool",
            content: "{\"error\":\"orphaned\"}",
            toolCallId: "call-1",
            toolName: "workspace-writeFile",
        },
        { role: "user", content: "continue" },
    ] as const;

    const sanitized = sanitizeMessagesForPrompt(messages as never);

    assert.deepEqual(sanitized, [
        { role: "user", content: "continue" },
    ]);
});

test("sanitizeMessagesForPrompt keeps valid tool-call/tool-result pairs", () => {
    const messages = [
        {
            role: "assistant",
            content: [{
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "workspace-readFile",
                arguments: { path: "slides/slide-01.js" },
            }],
        },
        {
            role: "tool",
            content: "{\"ok\":true}",
            toolCallId: "call-1",
            toolName: "workspace-readFile",
        },
    ] as const;

    const sanitized = sanitizeMessagesForPrompt(messages as never);

    assert.equal(sanitized.length, 2);
    assert.equal(sanitized[1]?.role, "tool");
});

test("sanitizeMessagesForPrompt drops provider noise assistant messages", () => {
    const messages = [
        { role: "user", content: "continue" },
        {
            role: "assistant",
            content: "name: AI_APICallError\nresponseBody: {\"error\":{\"type\":\"invalid_request_error\",\"code\":\"bad_request\"}}",
        },
        { role: "user", content: "retry" },
    ] as const;

    const sanitized = sanitizeMessagesForPrompt(messages as never);

    assert.deepEqual(sanitized, [
        { role: "user", content: "continue" },
        { role: "user", content: "retry" },
    ]);
});

test("sanitizeMessagesForPrompt keeps actionable tool errors but truncates long content", () => {
    const messages = [
        {
            role: "assistant",
            content: [{
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "executeCommand",
                arguments: { command: "python -m markitdown deck.pptx" },
            }],
        },
        {
            role: "tool",
            content: JSON.stringify({
                success: false,
                stderr: "No module named markitdown",
                exitCode: 1,
            }),
            toolCallId: "call-1",
            toolName: "executeCommand",
        },
        {
            role: "tool",
            content: "x".repeat(1200),
            toolCallId: "call-1",
            toolName: "executeCommand",
        },
    ] as const;

    const sanitized = sanitizeMessagesForPrompt(messages as never);

    assert.equal(sanitized.length, 3);
    assert.equal(sanitized[1]?.role, "tool");
    assert.match((sanitized[1] as { content: string }).content, /markitdown/);
    assert.match((sanitized[2] as { content: string }).content, /truncated/);
});

test("sanitizeMessagesForPrompt drops provider noise inside tool results", () => {
    const messages = [
        {
            role: "assistant",
            content: [{
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "executeCommand",
                arguments: {},
            }],
        },
        {
            role: "tool",
            content: "AI_APICallError: Input should be a valid dictionary",
            toolCallId: "call-1",
            toolName: "executeCommand",
        },
    ] as const;

    const sanitized = sanitizeMessagesForPrompt(messages as never);

    assert.equal(sanitized.length, 1);
    assert.equal(sanitized[0]?.role, "assistant");
});
