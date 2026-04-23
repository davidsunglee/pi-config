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
