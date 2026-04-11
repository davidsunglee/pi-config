import test from "node:test";
import assert from "node:assert/strict";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { JudgmentRequest, JudgmentResponse, CodeReviewSummary } from "../../lib/execute-plan/types.ts";
import {
  createJudgmentBridge,
  registerJudgmentTool,
  sendJudgmentRequest,
} from "./judgment.ts";

// ── Mock ExtensionAPI ──────────────────────────────────────────────────

function makeMockPI() {
  const messages: string[] = [];
  let registeredToolHandler: ((params: Record<string, unknown>) => Promise<unknown>) | null = null;

  const mockPI = {
    sendUserMessage: (content: string) => {
      messages.push(content);
    },
    registerTool: (_tool: unknown) => {
      // Capture execute handler for testing tool invocations
      const tool = _tool as {
        execute: (toolCallId: string, params: Record<string, unknown>, signal: undefined, onUpdate: undefined, ctx: unknown) => Promise<unknown>;
      };
      registeredToolHandler = (params) => tool.execute("test-call-id", params, undefined, undefined, {} as never);
    },
    getMessages: () => messages,
    invokeRegisteredTool: (params: Record<string, unknown>) => {
      if (!registeredToolHandler) throw new Error("No tool registered");
      return registeredToolHandler(params);
    },
  } as unknown as ExtensionAPI & {
    getMessages: () => string[];
    invokeRegisteredTool: (params: Record<string, unknown>) => Promise<unknown>;
  };

  return mockPI;
}

// ── createJudgmentBridge tests ─────────────────────────────────────────

test("createJudgmentBridge.requestJudgment resolves when resolver is called", async () => {
  const mockPI = makeMockPI();
  const bridge = createJudgmentBridge(mockPI as unknown as ExtensionAPI);

  const request: JudgmentRequest = {
    type: "blocked",
    taskNumber: 1,
    wave: 1,
    blocker: "Missing dependency",
    details: "Cannot find module",
  };

  const promise = bridge.requestJudgment(request);

  const resolver = bridge.getResolver();
  assert.ok(resolver !== null, "Resolver should be set after requestJudgment");

  const response: JudgmentResponse = { action: "retry" };
  resolver!(response);

  const result = await promise;
  assert.deepEqual(result, response);
});

test("calling requestJudgment twice without resolving rejects the first Promise", async () => {
  const mockPI = makeMockPI();
  const bridge = createJudgmentBridge(mockPI as unknown as ExtensionAPI);

  const request1: JudgmentRequest = {
    type: "blocked",
    taskNumber: 1,
    wave: 1,
    blocker: "Blocker 1",
    details: "Details 1",
  };
  const request2: JudgmentRequest = {
    type: "blocked",
    taskNumber: 2,
    wave: 1,
    blocker: "Blocker 2",
    details: "Details 2",
  };

  const promise1 = bridge.requestJudgment(request1);
  const promise2 = bridge.requestJudgment(request2);

  // Resolve the second one to prevent timeout
  const resolver = bridge.getResolver();
  assert.ok(resolver !== null);
  resolver!({ action: "skip" });

  await assert.rejects(promise1, /Another judgment request/);
  const result2 = await promise2;
  assert.equal(result2.action, "skip");
});

test("resolver called with no pending request returns error", async () => {
  const mockPI = makeMockPI();
  // Create a bridge with a getResolver that always returns null to simulate no-pending state
  const bridge = createJudgmentBridge(mockPI as unknown as ExtensionAPI);

  // Register the tool — getResolver from the bridge should return null when no request is pending
  registerJudgmentTool(mockPI as unknown as ExtensionAPI, () => null);

  // Invoke the registered tool with no pending resolver
  const result = await (mockPI as unknown as { invokeRegisteredTool: (p: Record<string, unknown>) => Promise<unknown> }).invokeRegisteredTool({
    action: "retry",
  }) as { content: Array<{ type: string; text: string }>; details: { error?: boolean } };

  assert.ok(result.details.error === true, "Should return error details when no resolver exists");
  assert.match(result.content[0].text, /No pending/);
});

test("requestJudgment Promise rejects after timeout", async () => {
  const mockPI = makeMockPI();
  const bridge = createJudgmentBridge(mockPI as unknown as ExtensionAPI, { timeoutMs: 100 });

  const request: JudgmentRequest = {
    type: "blocked",
    taskNumber: 1,
    wave: 1,
    blocker: "Will timeout",
    details: "Details",
  };

  const promise = bridge.requestJudgment(request);

  await assert.rejects(promise, /timed out/i);
});

test("setResolver(null) clears the pending resolver", async () => {
  const mockPI = makeMockPI();
  // Use a short timeout so the test doesn't hang
  const bridge = createJudgmentBridge(mockPI as unknown as ExtensionAPI, { timeoutMs: 100 });

  const request: JudgmentRequest = {
    type: "blocked",
    taskNumber: 1,
    wave: 1,
    blocker: "Test blocker",
    details: "Test details",
  };

  // Don't await — just fire it
  const promise = bridge.requestJudgment(request);

  assert.ok(bridge.getResolver() !== null, "Resolver should exist after requestJudgment");

  bridge.setResolver(null);

  assert.equal(bridge.getResolver(), null, "Resolver should be null after setResolver(null)");

  // The dangling promise will eventually reject via timeout — suppress it to avoid
  // unhandled rejection warnings.
  promise.catch(() => {});
});

// ── sendJudgmentRequest tests ──────────────────────────────────────────

test("sendJudgmentRequest calls sendUserMessage for 'blocked' request", () => {
  const mockPI = makeMockPI();
  const msgs = (mockPI as unknown as { getMessages: () => string[] }).getMessages();

  const request: JudgmentRequest = {
    type: "blocked",
    taskNumber: 3,
    wave: 2,
    blocker: "Cannot find the config file",
    details: "Looked everywhere",
  };

  sendJudgmentRequest(mockPI as unknown as ExtensionAPI, request);

  assert.equal(msgs.length, 1);
  const msg = msgs[0];
  assert.ok(msg.includes("blocked") || msg.includes("BLOCKED"), `Expected message to mention 'blocked', got: ${msg}`);
  assert.ok(msg.includes("3") || msg.includes("task"), `Expected message to mention task number 3, got: ${msg}`);
  assert.ok(msg.includes("Cannot find the config file"), `Expected message to include blocker text, got: ${msg}`);
});

test("sendJudgmentRequest calls sendUserMessage for 'code_review' request", () => {
  const mockPI = makeMockPI();
  const msgs = (mockPI as unknown as { getMessages: () => string[] }).getMessages();

  const review: CodeReviewSummary = {
    findings: [
      { severity: "critical", title: "Memory leak", details: "Unbounded array growth", file: "src/main.ts" },
    ],
    strengths: ["Clean architecture"],
    recommendations: ["Fix the leak"],
    overallAssessment: "Needs work",
    rawOutput: "...",
  };

  const request: JudgmentRequest = {
    type: "code_review",
    wave: 3,
    review,
    details: "Wave 3 code review completed",
  };

  sendJudgmentRequest(mockPI as unknown as ExtensionAPI, request);

  assert.equal(msgs.length, 1);
  const msg = msgs[0];
  assert.ok(
    msg.includes("code_review") || msg.includes("code review") || msg.includes("CODE REVIEW"),
    `Expected message to mention code review, got: ${msg}`,
  );
  assert.ok(
    msg.includes("Memory leak") || msg.includes("critical"),
    `Expected message to include finding details, got: ${msg}`,
  );
});

// ── registerJudgmentTool tests ─────────────────────────────────────────

test("registerJudgmentTool resolves pending promise via getResolver", async () => {
  const mockPI = makeMockPI();
  const bridge = createJudgmentBridge(mockPI as unknown as ExtensionAPI);

  registerJudgmentTool(mockPI as unknown as ExtensionAPI, bridge.getResolver);

  const request: JudgmentRequest = {
    type: "blocked",
    taskNumber: 5,
    wave: 1,
    blocker: "Test",
    details: "Details",
  };

  const promise = bridge.requestJudgment(request);

  const result = await (mockPI as unknown as { invokeRegisteredTool: (p: Record<string, unknown>) => Promise<unknown> }).invokeRegisteredTool({
    action: "retry",
    context: "Additional context",
  }) as { content: Array<{ type: string; text: string }>; details: Record<string, unknown> };

  assert.ok(!result.details.error, `Tool should not return error, got: ${JSON.stringify(result)}`);

  const resolved = await promise;
  assert.equal(resolved.action, "retry");
  assert.equal(resolved.context, "Additional context");
});
