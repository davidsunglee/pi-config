import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getReviewTemplatePath,
  loadReviewTemplate,
  fillReviewTemplate,
} from "./review-template.ts";
import type { GenerationIO } from "./types.ts";

// ---------------------------------------------------------------------------
// Helper: minimal mock GenerationIO
// ---------------------------------------------------------------------------
function mockIO(files: Record<string, string>): GenerationIO {
  return {
    readFile: async (p: string) => {
      if (p in files) return files[p];
      throw new Error(`ENOENT: no such file: ${p}`);
    },
    writeFile: async () => {},
    fileExists: async (p: string) => p in files,
    mkdir: async () => {},
    readdir: async () => [],
    readTodo: async () => ({ title: "", body: "" }),
    dispatchSubagent: async () => ({ text: "", exitCode: 0 }),
  };
}

// ---------------------------------------------------------------------------
// getReviewTemplatePath
// ---------------------------------------------------------------------------
describe("getReviewTemplatePath", () => {
  test("returns <agentDir>/skills/generate-plan/plan-reviewer.md", () => {
    const result = getReviewTemplatePath("/home/user/agent");
    assert.equal(
      result,
      "/home/user/agent/skills/generate-plan/plan-reviewer.md"
    );
  });

  test("works with trailing slash in agentDir", () => {
    // path.join normalizes this
    const result = getReviewTemplatePath("/home/user/agent/");
    assert.equal(
      result,
      "/home/user/agent/skills/generate-plan/plan-reviewer.md"
    );
  });
});

// ---------------------------------------------------------------------------
// loadReviewTemplate
// ---------------------------------------------------------------------------
describe("loadReviewTemplate", () => {
  test("reads plan-reviewer.md from the correct path via io.readFile", async () => {
    const templateContent = "# Review\n\n{ORIGINAL_SPEC}\n\n{PLAN_CONTENTS}";
    const agentDir = "/home/user/agent";
    const expectedPath = "/home/user/agent/skills/generate-plan/plan-reviewer.md";

    const readPaths: string[] = [];
    const io = mockIO({ [expectedPath]: templateContent });
    const origReadFile = io.readFile.bind(io);
    io.readFile = async (p: string) => {
      readPaths.push(p);
      return origReadFile(p);
    };

    const result = await loadReviewTemplate(io, agentDir);

    assert.equal(result, templateContent);
    assert.ok(
      readPaths.includes(expectedPath),
      `Expected readFile to be called with ${expectedPath}, got: ${JSON.stringify(readPaths)}`
    );
  });
});

// ---------------------------------------------------------------------------
// fillReviewTemplate
// ---------------------------------------------------------------------------
describe("fillReviewTemplate", () => {
  const template =
    "## Spec\n\n{ORIGINAL_SPEC}\n\n## Plan\n\n{PLAN_CONTENTS}\n\n## End";

  test("replaces {PLAN_CONTENTS} with plan content", () => {
    const result = fillReviewTemplate(template, {
      planContents: "My plan here",
      originalSpec: "My spec here",
    });
    assert.ok(
      result.includes("My plan here"),
      "Expected filled template to contain plan contents"
    );
    assert.ok(
      !result.includes("{PLAN_CONTENTS}"),
      "Expected {PLAN_CONTENTS} to be replaced"
    );
  });

  test("replaces {ORIGINAL_SPEC} with original spec text", () => {
    const result = fillReviewTemplate(template, {
      planContents: "My plan here",
      originalSpec: "My spec here",
    });
    assert.ok(
      result.includes("My spec here"),
      "Expected filled template to contain original spec"
    );
    assert.ok(
      !result.includes("{ORIGINAL_SPEC}"),
      "Expected {ORIGINAL_SPEC} to be replaced"
    );
  });

  test("filled template does not contain literal {PLAN_CONTENTS} or {ORIGINAL_SPEC}", () => {
    const result = fillReviewTemplate(template, {
      planContents: "plan text",
      originalSpec: "spec text",
    });
    assert.ok(!result.includes("{PLAN_CONTENTS}"));
    assert.ok(!result.includes("{ORIGINAL_SPEC}"));
  });

  test("throws if any placeholder remains unfilled after substitution", () => {
    const templateWithExtra =
      "## Spec\n\n{ORIGINAL_SPEC}\n\n{PLAN_CONTENTS}\n\n{UNKNOWN_PLACEHOLDER}";

    assert.throws(
      () =>
        fillReviewTemplate(templateWithExtra, {
          planContents: "plan",
          originalSpec: "spec",
        }),
      (err: Error) => {
        assert.ok(
          err.message.includes("{UNKNOWN_PLACEHOLDER}"),
          `Expected error message to mention the unfilled placeholder, got: ${err.message}`
        );
        return true;
      }
    );
  });

  test("does not throw when parameter values happen to contain brace patterns", () => {
    // Values that look like placeholders should NOT trigger the unfilled check
    const result = fillReviewTemplate(template, {
      planContents: "Use {braces} in code",
      originalSpec: "Config uses {variable} syntax",
    });
    assert.ok(result.includes("Use {braces} in code"));
    assert.ok(result.includes("Config uses {variable} syntax"));
  });
});
