import test from "node:test";
import assert from "node:assert/strict";

import workingMessageFactory from "./working-message.ts";

type EventHandler = (event: any, ctx: any) => void | Promise<void>;

function buildMockPi(): { pi: any; handlers: Map<string, EventHandler> } {
  const handlers = new Map<string, EventHandler>();
  const pi = {
    on(event: string, handler: EventHandler) {
      handlers.set(event, handler);
    },
  };
  return { pi, handlers };
}

function makeCtx(hasUI: boolean): { ctx: any; calls: Array<string | undefined> } {
  const calls: Array<string | undefined> = [];
  const ctx = {
    hasUI,
    ui: {
      setWorkingMessage(message?: string) {
        calls.push(message);
      },
    },
  };
  return { ctx, calls };
}

// ─── Scenario A: hasUI === false fallback ────────────────────────────────────

test("hasUI false: publishes plain message without escape bytes", () => {
  const { pi, handlers } = buildMockPi();
  workingMessageFactory(pi as any);

  // Intercept setInterval to verify it is NOT called
  let setIntervalCallCount = 0;
  const originalSetInterval = globalThis.setInterval;
  globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
    setIntervalCallCount++;
    return originalSetInterval(...args);
  }) as typeof setInterval;

  try {
    const turnStart = handlers.get("turn_start")!;
    assert.ok(turnStart, "turn_start handler should be registered");

    const calls: Array<string | undefined> = [];
    const ctx = { hasUI: false, ui: { setWorkingMessage(m?: string) { calls.push(m); } } };
    turnStart({}, ctx);

    assert.ok(calls.length >= 1, "setWorkingMessage should be called at least once");
    const lastCall = calls[calls.length - 1]!;
    assert.equal(typeof lastCall, "string", "published value should be a string");
    assert.doesNotMatch(lastCall, /\x1b\[/, "plain message must not contain escape sequences");
    assert.equal(setIntervalCallCount, 0, "setInterval must not be called when hasUI is false");
  } finally {
    globalThis.setInterval = originalSetInterval;
  }
});

// ─── Scenario B: hasUI === true styled path ──────────────────────────────────

test("hasUI true: starts setInterval and publishes styled message with escapes", () => {
  const { pi, handlers } = buildMockPi();
  workingMessageFactory(pi as any);

  // Capture setInterval / clearInterval calls
  const timerHandles: ReturnType<typeof setInterval>[] = [];
  let clearIntervalCallCount = 0;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;

  globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
    const handle = originalSetInterval(...args);
    timerHandles.push(handle);
    return handle;
  }) as typeof setInterval;

  globalThis.clearInterval = ((handle: ReturnType<typeof setInterval>) => {
    clearIntervalCallCount++;
    return originalClearInterval(handle);
  }) as typeof clearInterval;

  try {
    const turnStart = handlers.get("turn_start")!;
    const turnEnd = handlers.get("turn_end")!;
    assert.ok(turnStart, "turn_start handler should be registered");
    assert.ok(turnEnd, "turn_end handler should be registered");

    const calls: Array<string | undefined> = [];
    const ctx = { hasUI: true, ui: { setWorkingMessage(m?: string) { calls.push(m); } } };
    turnStart({}, ctx);

    // setInterval should have been created
    assert.equal(timerHandles.length, 1, "setInterval should be called exactly once");

    // The initial renderFrame() call from startAnimation() should publish a styled message
    assert.ok(calls.length >= 1, "setWorkingMessage should be called at least once");
    const styledCall = calls.find((c) => c !== undefined && /\x1b\[/.test(c));
    assert.ok(styledCall !== undefined, "at least one call should contain an escape sequence");

    // turn_end: stops timer and clears working message
    turnEnd({}, ctx);

    assert.ok(clearIntervalCallCount >= 1, "clearInterval should be called on turn_end");
    const lastCall = calls[calls.length - 1];
    assert.equal(lastCall, undefined, "last setWorkingMessage call on turn_end should pass undefined (no-arg)");
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    // Clean up any remaining timers
    timerHandles.forEach((h) => originalClearInterval(h));
  }
});
