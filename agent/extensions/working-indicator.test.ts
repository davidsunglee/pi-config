import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadSavedMode, saveMode } from "./working-indicator.ts";

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
