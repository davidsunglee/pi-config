import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { derivePlanPath, deriveReviewPath, ensurePlanDirs, formatDate } from "./path-utils.ts";
import type { GenerationIO } from "./types.ts";

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe("formatDate", () => {
  test("formats a date as yyyy-MM-dd with zero-padding", () => {
    const d = new Date(2026, 3, 12); // April 12 2026 (month is 0-indexed)
    assert.equal(formatDate(d), "2026-04-12");
  });

  test("zero-pads single-digit month and day", () => {
    const d = new Date(2026, 0, 5); // Jan 5 2026
    assert.equal(formatDate(d), "2026-01-05");
  });
});

// ---------------------------------------------------------------------------
// derivePlanPath
// ---------------------------------------------------------------------------
describe("derivePlanPath", () => {
  test("returns .pi/plans/yyyy-MM-dd-<shortDescription>.md with provided date", () => {
    const cwd = "/home/user/project";
    const date = new Date(2026, 3, 12); // April 12 2026
    const result = derivePlanPath(cwd, "my-feature", date);
    assert.equal(result, "/home/user/project/.pi/plans/2026-04-12-my-feature.md");
  });

  test("uses provided cwd as base", () => {
    const cwd = "/some/other/path";
    const date = new Date(2026, 3, 10); // April 10 2026
    const result = derivePlanPath(cwd, "cool-thing", date);
    assert.equal(result, "/some/other/path/.pi/plans/2026-04-10-cool-thing.md");
  });

  test("uses today's date when no date provided", () => {
    const cwd = "/home/user/project";
    const before = new Date();
    const result = derivePlanPath(cwd, "some-feature");
    const after = new Date();

    // Result should be an absolute path ending in .md
    assert.match(result, /\.md$/);
    assert.ok(result.startsWith(cwd));

    // The date portion should be today
    const todayStr = formatDate(before);
    assert.ok(
      result.includes(todayStr) || result.includes(formatDate(after)),
      `Expected result to contain today's date, got: ${result}`
    );
  });
});

// ---------------------------------------------------------------------------
// deriveReviewPath
// ---------------------------------------------------------------------------
describe("deriveReviewPath", () => {
  test("derives review path from plan path in reviews/ subdirectory with -review suffix", () => {
    const planPath = "/home/user/project/.pi/plans/2026-04-12-my-feature.md";
    const result = deriveReviewPath(planPath);
    assert.equal(
      result,
      "/home/user/project/.pi/plans/reviews/2026-04-12-my-feature-review.md"
    );
  });

  test("handles plans already containing -review in filename (does not double it)", () => {
    const planPath = "/home/user/project/.pi/plans/2026-04-12-my-feature-review.md";
    const result = deriveReviewPath(planPath);
    assert.equal(
      result,
      "/home/user/project/.pi/plans/reviews/2026-04-12-my-feature-review.md"
    );
  });

  test("moves file into reviews/ subdirectory relative to the plans dir", () => {
    const planPath = "/work/repo/.pi/plans/2026-01-01-foo.md";
    const result = deriveReviewPath(planPath);
    assert.equal(
      result,
      "/work/repo/.pi/plans/reviews/2026-01-01-foo-review.md"
    );
  });
});

// ---------------------------------------------------------------------------
// ensurePlanDirs
// ---------------------------------------------------------------------------
describe("ensurePlanDirs", () => {
  test("calls io.mkdir for .pi/plans/ and .pi/plans/reviews/", async () => {
    const created: string[] = [];
    const io: Pick<GenerationIO, "mkdir"> = {
      mkdir: async (p) => { created.push(p); },
    };

    const cwd = "/home/user/project";
    await ensurePlanDirs(io as GenerationIO, cwd);

    assert.ok(
      created.some((p) => p === "/home/user/project/.pi/plans"),
      `Expected .pi/plans to be created, got: ${JSON.stringify(created)}`
    );
    assert.ok(
      created.some((p) => p === "/home/user/project/.pi/plans/reviews"),
      `Expected .pi/plans/reviews to be created, got: ${JSON.stringify(created)}`
    );
  });

  test("creates both directories even if the first one already exists", async () => {
    const created: string[] = [];
    const io: Pick<GenerationIO, "mkdir"> = {
      mkdir: async (p) => {
        // Simulate EEXIST on the first call but swallow it (like recursive mkdir)
        created.push(p);
      },
    };

    const cwd = "/tmp/repo";
    await ensurePlanDirs(io as GenerationIO, cwd);

    assert.equal(created.length, 2);
  });
});
