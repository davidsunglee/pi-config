import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createExtension, loadSavedMode, saveMode } from "./working-indicator.ts";

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
