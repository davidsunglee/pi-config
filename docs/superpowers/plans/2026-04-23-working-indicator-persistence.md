# Working-Indicator Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the working-indicator selection globally to `~/.pi/agent/working.json`, remove the footer status, and change the unsaved/default behavior to pi's built-in spinner.

**Architecture:** Keep the extension in a single file. Add two pure, exported helpers — `loadSavedMode` (silent, read-only) and `saveMode` (preserves unrelated keys, throws on unusable JSON) — and wrap the extension body in a `createExtension(settingsPath)` factory so tests can point at a tmp file. `session_start` clears the stale `working-indicator` footer status and applies the loaded mode silently. The command handler applies the new mode immediately, then persists; a persistence failure produces an error toast in place of (not in addition to) the success toast.

**Tech Stack:** TypeScript, Node's built-in `node:test` runner, `node:fs/promises`, `@mariozechner/pi-coding-agent` extension API.

**Source:** TODO-3ebd6f1d

---

## File Structure

- `agent/extensions/working-indicator.ts` (Modify) — Single file holds the extension factory, pure persistence helpers (`loadSavedMode`, `saveMode`), mode validation, and the existing indicator visuals. Keeping it all together matches the existing one-file-per-extension convention (see `guardrails.ts`, `todos.ts`).
- `agent/extensions/working-indicator.test.ts` (Create) — Houses both focused unit tests for the persistence helpers and behavioral tests for the `session_start` + command wiring. Mirrors `guardrails.test.ts` (same stub-the-API pattern) and `footer.test.ts` (same `node:test` import style).

No new file is needed. Splitting persistence into its own module would not improve testability — the helpers are already exported as pure functions and the behavioral tests can inject a tmp path via the factory.

---

## Task 1: Add `loadSavedMode` reader and factory scaffolding (TDD)

**Files:**
- Modify: `agent/extensions/working-indicator.ts`
- Test: `agent/extensions/working-indicator.test.ts` (Create)

**Context:** `loadSavedMode` is the silent, read-only entry point used by `session_start`. Spec says: if the file is missing, unreadable, malformed, non-object, or has an invalid/incompatible `workingIndicator`, return nothing. The caller will then fall back to pi's default spinner. `"default"` is a valid persisted mode — it must round-trip through the reader.

We also introduce `createExtension(settingsPath)` here so later tasks can inject a tmp path without refactoring the file twice. The production default export continues to use `~/.pi/agent/working.json`.

- [ ] **Step 1: Write the failing unit tests**

Create `agent/extensions/working-indicator.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadSavedMode } from "./working-indicator.ts";

async function makeTmpDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "pi-working-indicator-"));
}

async function withTmpFile(
  fn: (filePath: string, dir: string) => Promise<void>,
): Promise<void> {
  const dir = await makeTmpDir();
  try {
    await fn(path.join(dir, "working.json"), dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("loadSavedMode returns undefined when file does not exist", async () => {
  await withTmpFile(async (filePath) => {
    assert.equal(await loadSavedMode(filePath), undefined);
  });
});

test("loadSavedMode returns undefined when parent directory does not exist", async () => {
  const dir = await makeTmpDir();
  try {
    const nested = path.join(dir, "does-not-exist", "working.json");
    assert.equal(await loadSavedMode(nested), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadSavedMode returns undefined for malformed JSON", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(filePath, "{not json", "utf8");
    assert.equal(await loadSavedMode(filePath), undefined);
  });
});

test("loadSavedMode returns undefined when top level is not an object", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(filePath, JSON.stringify(["dot"]), "utf8");
    assert.equal(await loadSavedMode(filePath), undefined);
  });
});

test("loadSavedMode returns undefined when workingIndicator is missing", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(filePath, JSON.stringify({ other: { a: 1 } }), "utf8");
    assert.equal(await loadSavedMode(filePath), undefined);
  });
});

test("loadSavedMode returns undefined when workingIndicator is not an object", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(filePath, JSON.stringify({ workingIndicator: "dot" }), "utf8");
    assert.equal(await loadSavedMode(filePath), undefined);
  });
});

test("loadSavedMode returns undefined when mode is not a recognized string", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(
      filePath,
      JSON.stringify({ workingIndicator: { mode: "sparkles" } }),
      "utf8",
    );
    assert.equal(await loadSavedMode(filePath), undefined);
  });
});

test("loadSavedMode returns each supported mode", async () => {
  for (const mode of ["dot", "none", "pulse", "spinner", "default"] as const) {
    await withTmpFile(async (filePath) => {
      await writeFile(
        filePath,
        JSON.stringify({ workingIndicator: { mode } }),
        "utf8",
      );
      assert.equal(await loadSavedMode(filePath), mode);
    });
  }
});

test("loadSavedMode ignores unrelated top-level keys and sibling keys", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(
      filePath,
      JSON.stringify({
        someOtherExtension: { foo: "bar" },
        workingIndicator: { mode: "pulse", extra: 7 },
      }),
      "utf8",
    );
    assert.equal(await loadSavedMode(filePath), "pulse");
  });
});
```

- [ ] **Step 2: Run the unit tests to verify they fail**

Run: `cd agent && npm test -- --test-name-pattern "loadSavedMode"`
Expected: FAIL with a module/export error — `loadSavedMode` is not exported from `./working-indicator.ts` yet.

- [ ] **Step 3: Refactor `working-indicator.ts` to introduce the helpers and factory**

Replace the contents of `agent/extensions/working-indicator.ts` with:

```ts
/**
 * Working Indicator Extension
 *
 * Customizes the inline working indicator shown while pi is streaming a
 * response. The chosen indicator is persisted globally across pi sessions in
 * `~/.pi/agent/working.json` under `workingIndicator.mode`. Unrelated keys in
 * that file (including settings written by other extensions) are preserved.
 *
 * Commands:
 *   /working-indicator           Show the active indicator for this session
 *   /working-indicator dot       Use a static dot indicator
 *   /working-indicator pulse     Use a custom animated indicator
 *   /working-indicator none      Hide the indicator entirely
 *   /working-indicator spinner   Restore an animated spinner
 *   /working-indicator reset     Restore pi's default spinner (persists "default")
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ExtensionAPI, ExtensionContext, WorkingIndicatorOptions } from "@mariozechner/pi-coding-agent";

export type WorkingIndicatorMode = "dot" | "none" | "pulse" | "spinner" | "default";

export const WORKING_INDICATOR_MODES: readonly WorkingIndicatorMode[] = [
  "dot",
  "none",
  "pulse",
  "spinner",
  "default",
];

const FOOTER_STATUS_KEY = "working-indicator";

export const DEFAULT_SETTINGS_PATH = path.join(os.homedir(), ".pi", "agent", "working.json");

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const PASTEL_RAINBOW = [
  "\x1b[38;2;255;179;186m",
  "\x1b[38;2;255;223;186m",
  "\x1b[38;2;255;255;186m",
  "\x1b[38;2;186;255;201m",
  "\x1b[38;2;186;225;255m",
  "\x1b[38;2;218;186;255m",
];
const RESET_FG = "\x1b[39m";
const HIDDEN_INDICATOR: WorkingIndicatorOptions = { frames: [] };

function colorize(text: string, color: string): string {
  return `${color}${text}${RESET_FG}`;
}

function getIndicator(mode: WorkingIndicatorMode): WorkingIndicatorOptions | undefined {
  switch (mode) {
    case "dot":
      return { frames: [colorize("●", PASTEL_RAINBOW[0]!)] };
    case "none":
      return HIDDEN_INDICATOR;
    case "pulse":
      return {
        frames: [
          colorize("·", PASTEL_RAINBOW[0]!),
          colorize("•", PASTEL_RAINBOW[2]!),
          colorize("●", PASTEL_RAINBOW[4]!),
          colorize("•", PASTEL_RAINBOW[5]!),
        ],
        intervalMs: 120,
      };
    case "spinner":
      return {
        frames: SPINNER_FRAMES.map((frame, index) =>
          colorize(frame, PASTEL_RAINBOW[index % PASTEL_RAINBOW.length]!),
        ),
        intervalMs: 80,
      };
    case "default":
      return undefined;
  }
}

function describeMode(mode: WorkingIndicatorMode): string {
  switch (mode) {
    case "dot":
      return "static dot";
    case "none":
      return "hidden";
    case "pulse":
      return "custom pulse";
    case "spinner":
      return "custom spinner";
    case "default":
      return "pi default spinner";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isWorkingIndicatorMode(value: unknown): value is WorkingIndicatorMode {
  return typeof value === "string" && (WORKING_INDICATOR_MODES as readonly string[]).includes(value);
}

export async function loadSavedMode(filePath: string): Promise<WorkingIndicatorMode | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (!isPlainObject(parsed)) return undefined;
  const wi = parsed.workingIndicator;
  if (!isPlainObject(wi)) return undefined;
  return isWorkingIndicatorMode(wi.mode) ? wi.mode : undefined;
}

export function createExtension(settingsPath: string = DEFAULT_SETTINGS_PATH) {
  return function (pi: ExtensionAPI): void {
    let mode: WorkingIndicatorMode = "default";

    const applyIndicator = (ctx: ExtensionContext) => {
      ctx.ui.setWorkingIndicator(getIndicator(mode));
    };

    pi.on("session_start", async (_event, ctx) => {
      ctx.ui.setStatus(FOOTER_STATUS_KEY, undefined);
      const saved = await loadSavedMode(settingsPath);
      mode = saved ?? "default";
      applyIndicator(ctx);
    });

    pi.registerCommand("working-indicator", {
      description:
        "Set the streaming working indicator: dot, pulse, none, spinner, or reset. Persists globally.",
      handler: async (args, ctx) => {
        const nextMode = args.trim().toLowerCase();
        if (!nextMode) {
          ctx.ui.notify(`Working indicator: ${describeMode(mode)}`, "info");
          return;
        }

        if (
          nextMode !== "dot" &&
          nextMode !== "none" &&
          nextMode !== "pulse" &&
          nextMode !== "spinner" &&
          nextMode !== "reset"
        ) {
          ctx.ui.notify("Usage: /working-indicator [dot|pulse|none|spinner|reset]", "error");
          return;
        }

        mode = nextMode === "reset" ? "default" : nextMode;
        applyIndicator(ctx);
        ctx.ui.notify(`Working indicator set to: ${describeMode(mode)}`, "info");
      },
    });
  };
}

export default createExtension();
```

Notes on this edit:
- `setStatus(FOOTER_STATUS_KEY, undefined)` already satisfies the "clear any stale `working-indicator` footer status" requirement (it clears even if we never wrote one this session).
- `applyIndicator` no longer calls `ctx.ui.setStatus(...)` — the footer usage is gone.
- The command handler does **not** yet persist on success; that is Task 4. For now, this task only wires the reader.
- `ctx.ui.theme` is no longer referenced, so the `theme` reexport is unused; that is fine.

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `cd agent && npm test -- --test-name-pattern "loadSavedMode"`
Expected: PASS — all nine `loadSavedMode` tests pass.

- [ ] **Step 5: Typecheck**

Run: `cd agent && npm run typecheck`
Expected: PASS — no type errors.

- [ ] **Step 6: Commit**

```bash
git add agent/extensions/working-indicator.ts agent/extensions/working-indicator.test.ts
git commit -m "feat(working-indicator): add silent persistence reader"
```

---

## Task 2: Add `saveMode` writer (TDD)

**Files:**
- Modify: `agent/extensions/working-indicator.ts`
- Test: `agent/extensions/working-indicator.test.ts`

**Context:** The writer preserves unrelated top-level keys and sibling keys inside `workingIndicator`. On an explicit command, it must:
- Create the parent directory if missing.
- If the file is missing, start from `{}`.
- If the file exists and parses to a plain object, merge into it.
- If the file is malformed or its top level is not a plain object, **throw** — the caller turns that into an error toast and a session-only application.
- If the file is a valid object but `workingIndicator` has an incompatible shape (array, string, etc.), normalize that subsection to `{ mode }` and save successfully.
- If `workingIndicator.mode` is invalid but the surrounding JSON is usable, overwrite just that mode.
- Non-JSON filesystem errors (permission denied, EACCES on write, etc.) bubble out as throws too.

Write the file with a trailing newline and 2-space indentation so it is editable by hand if needed.

- [ ] **Step 1: Append failing unit tests to `working-indicator.test.ts`**

Add these tests below the existing `loadSavedMode` tests (keep the helpers at the top of the file and reuse them):

```ts
import { saveMode } from "./working-indicator.ts";

test("saveMode creates the file and parent directory when missing", async () => {
  const dir = await makeTmpDir();
  try {
    const filePath = path.join(dir, "nested", "working.json");
    await saveMode(filePath, "dot");
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(parsed, { workingIndicator: { mode: "dot" } });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("saveMode preserves unrelated top-level keys", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(
      filePath,
      JSON.stringify({ other: { a: 1 }, another: true }),
      "utf8",
    );
    await saveMode(filePath, "pulse");
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(parsed, {
      other: { a: 1 },
      another: true,
      workingIndicator: { mode: "pulse" },
    });
  });
});

test("saveMode preserves sibling keys inside workingIndicator", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(
      filePath,
      JSON.stringify({ workingIndicator: { mode: "dot", nickname: "blip" } }),
      "utf8",
    );
    await saveMode(filePath, "pulse");
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(parsed, { workingIndicator: { mode: "pulse", nickname: "blip" } });
  });
});

test("saveMode normalizes an incompatible workingIndicator shape", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(
      filePath,
      JSON.stringify({ other: "keep", workingIndicator: "broken" }),
      "utf8",
    );
    await saveMode(filePath, "none");
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(parsed, { other: "keep", workingIndicator: { mode: "none" } });
  });
});

test("saveMode overwrites just the mode when the rest of the JSON is usable", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(
      filePath,
      JSON.stringify({ workingIndicator: { mode: "sparkles", extra: 42 } }),
      "utf8",
    );
    await saveMode(filePath, "spinner");
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(parsed, { workingIndicator: { mode: "spinner", extra: 42 } });
  });
});

test("saveMode throws when JSON is malformed", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(filePath, "{not json", "utf8");
    await assert.rejects(() => saveMode(filePath, "dot"));
    // Source file is untouched so nothing leaks in during a failed save.
    assert.equal(await readFile(filePath, "utf8"), "{not json");
  });
});

test("saveMode throws when top-level JSON is not an object", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(filePath, JSON.stringify(["dot"]), "utf8");
    await assert.rejects(() => saveMode(filePath, "dot"), /object/i);
  });
});

test("saveMode persists \"default\" (emitted by /working-indicator reset)", async () => {
  await withTmpFile(async (filePath) => {
    await saveMode(filePath, "default");
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(parsed, { workingIndicator: { mode: "default" } });
  });
});
```

- [ ] **Step 2: Run saveMode tests to verify they fail**

Run: `cd agent && npm test -- --test-name-pattern "saveMode"`
Expected: FAIL with an import/export error — `saveMode` is not exported yet.

- [ ] **Step 3: Add `saveMode` implementation**

Add `saveMode` to `agent/extensions/working-indicator.ts`, placed directly below `loadSavedMode`:

```ts
export async function saveMode(filePath: string, mode: WorkingIndicatorMode): Promise<void> {
  let settings: Record<string, unknown> = {};

  let raw: string | undefined;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  if (raw !== undefined) {
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      throw new Error(`${filePath}: top-level JSON must be an object`);
    }
    settings = { ...parsed };
  }

  const current = settings.workingIndicator;
  const wi: Record<string, unknown> = isPlainObject(current) ? { ...current } : {};
  wi.mode = mode;
  settings.workingIndicator = wi;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}
```

- [ ] **Step 4: Run saveMode tests to verify they pass**

Run: `cd agent && npm test -- --test-name-pattern "saveMode"`
Expected: PASS — all saveMode tests pass.

- [ ] **Step 5: Run the full test suite**

Run: `cd agent && npm test`
Expected: PASS — no existing tests regress.

- [ ] **Step 6: Typecheck**

Run: `cd agent && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add agent/extensions/working-indicator.ts agent/extensions/working-indicator.test.ts
git commit -m "feat(working-indicator): add saveMode writer preserving unrelated keys"
```

---

## Task 3: Behavioral tests for `session_start` (silent load, footer cleared)

**Files:**
- Test: `agent/extensions/working-indicator.test.ts`

**Context:** The wiring already exists (Task 1 set up the factory + handler). We now lock it down with tests: restoring from a valid file, falling back silently on every unusable state, clearing the stale `working-indicator` footer status every startup, and never writing to disk from `session_start`.

We drive the extension the same way `guardrails.test.ts` does: by stubbing `pi.on` / `pi.registerCommand` to capture handlers, then invoking them manually with a stub `ctx`.

- [ ] **Step 1: Add behavioral session_start tests**

Append to `agent/extensions/working-indicator.test.ts`:

```ts
import { createExtension } from "./working-indicator.ts";
import type { WorkingIndicatorMode } from "./working-indicator.ts";

type SessionHandler = (event: any, ctx: any) => Promise<void> | void;
type CommandDef = { description: string; handler: (args: string, ctx: any) => Promise<void> | void };

interface Captured {
  sessionStart: SessionHandler;
  command: CommandDef;
}

function bootExtension(settingsPath: string): Captured {
  let sessionStart: SessionHandler | undefined;
  let command: CommandDef | undefined;

  const stubPi = {
    on(event: string, cb: SessionHandler) {
      if (event === "session_start") sessionStart = cb;
    },
    registerCommand(name: string, def: CommandDef) {
      if (name === "working-indicator") command = def;
    },
  };

  createExtension(settingsPath)(stubPi as any);
  assert.ok(sessionStart, "session_start handler should be registered");
  assert.ok(command, "working-indicator command should be registered");
  return { sessionStart, command };
}

interface CtxStub {
  indicatorCalls: Array<unknown>;
  statusCalls: Array<[string, unknown]>;
  notifications: Array<{ message: string; level: string }>;
  ctx: any;
}

function makeCtx(): CtxStub {
  const indicatorCalls: Array<unknown> = [];
  const statusCalls: Array<[string, unknown]> = [];
  const notifications: Array<{ message: string; level: string }> = [];
  const ctx = {
    ui: {
      setWorkingIndicator(options: unknown) {
        indicatorCalls.push(options);
      },
      setStatus(key: string, value: unknown) {
        statusCalls.push([key, value]);
      },
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
    },
  };
  return { indicatorCalls, statusCalls, notifications, ctx };
}

test("session_start applies the saved mode silently", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(filePath, JSON.stringify({ workingIndicator: { mode: "dot" } }), "utf8");
    const { sessionStart } = bootExtension(filePath);
    const { ctx, indicatorCalls, statusCalls, notifications } = makeCtx();

    await sessionStart({ reason: "startup" }, ctx);

    assert.equal(indicatorCalls.length, 1, "indicator applied once");
    assert.ok(indicatorCalls[0], "dot produces an indicator option object");
    assert.deepEqual(
      statusCalls,
      [["working-indicator", undefined]],
      "stale footer status is cleared",
    );
    assert.deepEqual(notifications, [], "no toast on startup");
  });
});

test("session_start falls back to default spinner when file is missing", async () => {
  await withTmpFile(async (filePath) => {
    const { sessionStart } = bootExtension(filePath);
    const { ctx, indicatorCalls, statusCalls, notifications } = makeCtx();

    await sessionStart({ reason: "startup" }, ctx);

    assert.deepEqual(indicatorCalls, [undefined], "pi default spinner via undefined");
    assert.deepEqual(statusCalls, [["working-indicator", undefined]]);
    assert.deepEqual(notifications, []);
  });
});

test("session_start falls back silently when JSON is malformed and does not rewrite the file", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(filePath, "{broken", "utf8");
    const { sessionStart } = bootExtension(filePath);
    const { ctx, indicatorCalls, statusCalls, notifications } = makeCtx();

    await sessionStart({ reason: "startup" }, ctx);

    assert.deepEqual(indicatorCalls, [undefined]);
    assert.deepEqual(notifications, [], "no toast when startup falls back");
    assert.deepEqual(statusCalls, [["working-indicator", undefined]]);
    assert.equal(await readFile(filePath, "utf8"), "{broken", "file is not auto-repaired");
  });
});

test("session_start falls back silently when mode is unrecognized", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(
      filePath,
      JSON.stringify({ workingIndicator: { mode: "sparkles" } }),
      "utf8",
    );
    const { sessionStart } = bootExtension(filePath);
    const { ctx, indicatorCalls, notifications } = makeCtx();

    await sessionStart({ reason: "reload" }, ctx);

    assert.deepEqual(indicatorCalls, [undefined]);
    assert.deepEqual(notifications, []);
  });
});

test("session_start restores \"default\" as a valid persisted mode", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(filePath, JSON.stringify({ workingIndicator: { mode: "default" } }), "utf8");
    const { sessionStart } = bootExtension(filePath);
    const { ctx, indicatorCalls } = makeCtx();

    await sessionStart({ reason: "new", previousSessionFile: "/tmp/x" }, ctx);

    assert.deepEqual(indicatorCalls, [undefined], "\"default\" resolves to undefined indicator options");
  });
});
```

- [ ] **Step 2: Run behavioral session_start tests**

Run: `cd agent && npm test -- --test-name-pattern "session_start"`
Expected: PASS — all five session_start behavioral tests pass against the implementation from Task 1.

- [ ] **Step 3: Run the full test suite**

Run: `cd agent && npm test`
Expected: PASS — persistence, session_start behavior, and all sibling extension tests pass together.

- [ ] **Step 4: Typecheck**

Run: `cd agent && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agent/extensions/working-indicator.test.ts
git commit -m "test(working-indicator): cover silent session_start load and stale footer clear"
```

---

## Task 4: Persist on command + error-toast semantics (TDD)

**Files:**
- Modify: `agent/extensions/working-indicator.ts`
- Test: `agent/extensions/working-indicator.test.ts`

**Context:** Now we wire the command to `saveMode`. Requirements:

- `/working-indicator` (no args): report only the active indicator for this session. No persistence.
- `/working-indicator dot|pulse|none|spinner`: apply immediately, persist `mode`, emit **one** success toast.
- `/working-indicator reset`: apply `default` indicator immediately, persist `"default"`. If the file does not exist, create it. Emit a success toast (unless persistence fails).
- `/working-indicator default`: rejected by the usage error, not accepted (no new alias).
- `/working-indicator garbage`: usage error toast.
- If a command succeeds at switching the current-session indicator but `saveMode` throws (malformed JSON, non-object top level, permission denied, etc.), emit **only** the error toast — no success toast.
- If the file has a valid object top level but the `workingIndicator` subsection is an incompatible shape, `saveMode` normalizes and saves; the success toast fires.
- If only `workingIndicator.mode` is invalid, `saveMode` overwrites just that key; the success toast fires.

- [ ] **Step 1: Add failing command behavioral tests**

Append to `agent/extensions/working-indicator.test.ts`:

```ts
async function triggerCommand(
  command: CommandDef,
  args: string,
): Promise<{ indicatorCalls: Array<unknown>; statusCalls: Array<[string, unknown]>; notifications: Array<{ message: string; level: string }> }> {
  const { ctx, indicatorCalls, statusCalls, notifications } = makeCtx();
  await command.handler(args, ctx);
  return { indicatorCalls, statusCalls, notifications };
}

test("command with no args reports the current mode and does not write", async () => {
  await withTmpFile(async (filePath) => {
    const { command } = bootExtension(filePath);
    const { indicatorCalls, notifications } = await triggerCommand(command, "");

    assert.deepEqual(indicatorCalls, []);
    assert.equal(notifications.length, 1);
    assert.match(notifications[0]!.message, /^Working indicator:/);
    assert.equal(notifications[0]!.level, "info");
    await assert.rejects(() => readFile(filePath, "utf8"));
  });
});

test("command 'dot' applies and persists", async () => {
  await withTmpFile(async (filePath) => {
    const { command } = bootExtension(filePath);
    const result = await triggerCommand(command, "dot");

    assert.equal(result.indicatorCalls.length, 1);
    assert.ok(result.indicatorCalls[0], "dot maps to defined indicator options");
    assert.deepEqual(result.notifications, [
      { message: "Working indicator set to: static dot", level: "info" },
    ]);
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(parsed, { workingIndicator: { mode: "dot" } });
  });
});

test("command 'reset' persists \"default\" and creates the file when missing", async () => {
  await withTmpFile(async (filePath) => {
    const { command } = bootExtension(filePath);
    const result = await triggerCommand(command, "reset");

    assert.deepEqual(result.indicatorCalls, [undefined], "default indicator is undefined");
    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0]!.level, "info");
    assert.match(result.notifications[0]!.message, /pi default spinner/);
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(parsed, { workingIndicator: { mode: "default" } });
  });
});

test("command 'default' is rejected with the usage toast", async () => {
  await withTmpFile(async (filePath) => {
    const { command } = bootExtension(filePath);
    const result = await triggerCommand(command, "default");

    assert.deepEqual(result.indicatorCalls, []);
    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0]!.level, "error");
    assert.match(result.notifications[0]!.message, /Usage: \/working-indicator/);
    await assert.rejects(() => readFile(filePath, "utf8"));
  });
});

test("command preserves unrelated top-level keys on save", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(
      filePath,
      JSON.stringify({ other: { a: 1 }, workingIndicator: { mode: "dot", extra: 7 } }),
      "utf8",
    );
    const { command } = bootExtension(filePath);
    await triggerCommand(command, "pulse");

    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(parsed, {
      other: { a: 1 },
      workingIndicator: { mode: "pulse", extra: 7 },
    });
  });
});

test("command normalizes an incompatible workingIndicator shape on save", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(
      filePath,
      JSON.stringify({ other: "keep", workingIndicator: "broken" }),
      "utf8",
    );
    const { command } = bootExtension(filePath);
    const result = await triggerCommand(command, "none");

    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0]!.level, "info", "normalization is a success, not an error");
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(parsed, { other: "keep", workingIndicator: { mode: "none" } });
  });
});

test("command applies session-only and emits only an error toast when JSON is malformed", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(filePath, "{broken", "utf8");
    const { command } = bootExtension(filePath);
    const result = await triggerCommand(command, "dot");

    assert.equal(result.indicatorCalls.length, 1, "session indicator still updates");
    assert.ok(result.indicatorCalls[0]);
    assert.equal(result.notifications.length, 1, "exactly one toast, not two");
    assert.equal(result.notifications[0]!.level, "error");
    assert.equal(await readFile(filePath, "utf8"), "{broken", "malformed file is not silently overwritten");
  });
});

test("command applies session-only and emits only an error toast when top level is not an object", async () => {
  await withTmpFile(async (filePath) => {
    await writeFile(filePath, JSON.stringify(["dot"]), "utf8");
    const { command } = bootExtension(filePath);
    const result = await triggerCommand(command, "spinner");

    assert.equal(result.indicatorCalls.length, 1);
    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0]!.level, "error");
    assert.equal(await readFile(filePath, "utf8"), JSON.stringify(["dot"]));
  });
});

test("command applies session-only and emits only an error toast when the write fails", async () => {
  const dir = await makeTmpDir();
  try {
    const readOnlyDir = path.join(dir, "locked");
    await mkdir(readOnlyDir);
    await chmod(readOnlyDir, 0o500); // read+execute, no write
    const filePath = path.join(readOnlyDir, "working.json");
    const { command } = bootExtension(filePath);
    const result = await triggerCommand(command, "dot");

    assert.equal(result.indicatorCalls.length, 1, "session indicator still updates");
    assert.equal(result.notifications.length, 1, "exactly one toast");
    assert.equal(result.notifications[0]!.level, "error");
  } finally {
    // Restore perms so rm can clean up.
    await chmod(path.join(dir, "locked"), 0o700).catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});

test("command 'garbage' shows the usage toast and does not write", async () => {
  await withTmpFile(async (filePath) => {
    const { command } = bootExtension(filePath);
    const result = await triggerCommand(command, "garbage");

    assert.deepEqual(result.indicatorCalls, []);
    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0]!.level, "error");
    assert.match(result.notifications[0]!.message, /Usage: \/working-indicator/);
    await assert.rejects(() => readFile(filePath, "utf8"));
  });
});
```

- [ ] **Step 2: Run command tests to verify they fail**

Run: `cd agent && npm test -- --test-name-pattern "command"`
Expected: FAIL — most command tests fail because the handler from Task 1 does not yet persist, still sends a success toast on persistence failure, and does not normalize.

- [ ] **Step 3: Update the command handler in `agent/extensions/working-indicator.ts`**

Replace the current `handler` inside `registerCommand("working-indicator", ...)` with:

```ts
handler: async (args, ctx) => {
  const nextMode = args.trim().toLowerCase();
  if (!nextMode) {
    ctx.ui.notify(`Working indicator: ${describeMode(mode)}`, "info");
    return;
  }

  if (
    nextMode !== "dot" &&
    nextMode !== "none" &&
    nextMode !== "pulse" &&
    nextMode !== "spinner" &&
    nextMode !== "reset"
  ) {
    ctx.ui.notify("Usage: /working-indicator [dot|pulse|none|spinner|reset]", "error");
    return;
  }

  mode = nextMode === "reset" ? "default" : nextMode;
  applyIndicator(ctx);

  try {
    await saveMode(settingsPath, mode);
    ctx.ui.notify(`Working indicator set to: ${describeMode(mode)}`, "info");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Working indicator set to ${describeMode(mode)}, but could not save: ${reason}`, "error");
  }
},
```

Notes:
- `saveMode` handles the normalize-and-save case internally, so the success toast fires automatically for incompatible `workingIndicator` shapes and invalid `mode` fields.
- The catch branch fires on malformed JSON, non-object top level, permission errors, and any other write failure.

- [ ] **Step 4: Run the command tests to verify they pass**

Run: `cd agent && npm test -- --test-name-pattern "command"`
Expected: PASS — all command behavioral tests pass.

- [ ] **Step 5: Run the full test suite**

Run: `cd agent && npm test`
Expected: PASS — unit tests, session_start tests, command tests, and every other extension test.

- [ ] **Step 6: Typecheck**

Run: `cd agent && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add agent/extensions/working-indicator.ts agent/extensions/working-indicator.test.ts
git commit -m "feat(working-indicator): persist on command with single-toast error semantics"
```

---

## Task 5: Refresh user-facing help text and file docstring

**Files:**
- Modify: `agent/extensions/working-indicator.ts`

**Context:** The file docstring was updated in Task 1 to mention persistence and the command surface. This task confirms the shipped behavior matches and that the `registerCommand` description line is accurate and terse. If Task 1/4 drifted from this wording, correct it here.

- [ ] **Step 1: Confirm the top-of-file docstring matches the shipped behavior**

Open `agent/extensions/working-indicator.ts` and confirm the top block reads exactly:

```ts
/**
 * Working Indicator Extension
 *
 * Customizes the inline working indicator shown while pi is streaming a
 * response. The chosen indicator is persisted globally across pi sessions in
 * `~/.pi/agent/working.json` under `workingIndicator.mode`. Unrelated keys in
 * that file (including settings written by other extensions) are preserved.
 *
 * Commands:
 *   /working-indicator           Show the active indicator for this session
 *   /working-indicator dot       Use a static dot indicator
 *   /working-indicator pulse     Use a custom animated indicator
 *   /working-indicator none      Hide the indicator entirely
 *   /working-indicator spinner   Restore an animated spinner
 *   /working-indicator reset     Restore pi's default spinner (persists "default")
 */
```

If it differs, rewrite it to match.

- [ ] **Step 2: Confirm the `registerCommand` description line**

The `description` field on the command should read:

```ts
description:
  "Set the streaming working indicator: dot, pulse, none, spinner, or reset. Persists globally.",
```

If it differs (for example, still mentions the old `examples/` path or missing persistence note), replace it with the above.

- [ ] **Step 3: Run the full test suite one final time**

Run: `cd agent && npm test`
Expected: PASS — every test still passes after the doc-only edit.

- [ ] **Step 4: Typecheck**

Run: `cd agent && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Close out the source todo file**

Mark TODO-3ebd6f1d as done by updating its status field.

Open `.pi/todos/3ebd6f1d.md` and change the `"status": "open"` line to `"status": "closed"`.

- [ ] **Step 6: Commit**

```bash
git add agent/extensions/working-indicator.ts .pi/todos/3ebd6f1d.md
git commit -m "docs(working-indicator): sync help text with persistence behavior"
```

---

## Verification Checklist

After all tasks, re-verify each acceptance criterion from the todo:

- [ ] `dot`, `pulse`, `none`, `spinner` update the active indicator and persist to `~/.pi/agent/working.json` under `workingIndicator.mode` — covered by "command 'dot' applies and persists" + manual sanity.
- [ ] `reset` updates to pi default and persists `"default"` — covered by "command 'reset' persists \"default\"…".
- [ ] Every `session_start` restores a valid saved mode or silently falls back — covered by five session_start tests.
- [ ] Footer status no longer used; stale status cleared — covered by "session_start applies the saved mode silently" (no non-clearing setStatus call) and by code review that `applyIndicator` no longer calls `setStatus`.
- [ ] Shared JSON preserved — covered by "command preserves unrelated top-level keys on save".
- [ ] Malformed file never rewritten at startup — covered by "session_start falls back silently when JSON is malformed and does not rewrite the file".
- [ ] Write failures surface a single error toast, session still updates — covered by three error-toast tests.
- [ ] Help text matches behavior — covered by the Task 5 review.
- [ ] Automated tests cover persistence and behavior — covered (unit tests for `loadSavedMode`/`saveMode`, behavioral tests for session + command).
