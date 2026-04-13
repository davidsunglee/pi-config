import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildGenerationPrompt, buildEditPrompt } from "./prompt-builder.ts";
import type { ReviewIssue, RepairStrategy } from "./types.ts";

describe("buildGenerationPrompt", () => {
  const baseParams = {
    sourceText: "Implement a caching layer for the API endpoints",
    sourceTodoId: "7ef7d441" as string | null,
    cwd: "/Users/david/Code/my-project",
    outputPath: ".pi/plans/2026-04-12-caching-layer.md",
  };

  it("(a) prompt includes the full source text", () => {
    const prompt = buildGenerationPrompt(baseParams);
    assert.ok(
      prompt.includes("Implement a caching layer for the API endpoints"),
      "prompt should include the full source text",
    );
  });

  it("(b) prompt includes the cwd for context", () => {
    const prompt = buildGenerationPrompt(baseParams);
    assert.ok(
      prompt.includes("/Users/david/Code/my-project"),
      "prompt should include the cwd",
    );
  });

  it("(c) prompt includes the output path instruction with correct date-prefixed filename", () => {
    const prompt = buildGenerationPrompt(baseParams);
    assert.ok(
      prompt.includes(".pi/plans/2026-04-12-caching-layer.md"),
      "prompt should include the output path",
    );
  });

  it("(d) prompt includes Source todo: TODO-<id> when sourceTodoId is present", () => {
    const prompt = buildGenerationPrompt(baseParams);
    assert.ok(
      prompt.includes("Source todo: TODO-7ef7d441"),
      "prompt should include Source todo line when sourceTodoId is present",
    );
  });

  it("(e) prompt does NOT include Source todo: line when sourceTodoId is null", () => {
    const prompt = buildGenerationPrompt({ ...baseParams, sourceTodoId: null });
    assert.ok(
      !prompt.includes("Source todo:"),
      "prompt should not include Source todo line when sourceTodoId is null",
    );
  });

  it("(f) prompt structure matches SKILL.md Step 2 format", () => {
    // With todo source — should match:
    //   Analyze the codebase at <cwd> and produce a structured implementation plan.
    //
    //   Task (from TODO-<id>):
    //   <full task description>
    //
    //   Source todo: TODO-<id>
    //
    //   Write the plan to <outputPath>.
    const promptWithTodo = buildGenerationPrompt(baseParams);
    assert.ok(
      promptWithTodo.includes(
        "Analyze the codebase at /Users/david/Code/my-project and produce a structured implementation plan.",
      ),
      "prompt should start with the analyze instruction including cwd",
    );
    assert.ok(
      promptWithTodo.includes("Task (from TODO-7ef7d441):"),
      "prompt with todo should use 'Task (from TODO-<id>):' header",
    );
    assert.ok(
      promptWithTodo.includes(
        "Write the plan to .pi/plans/2026-04-12-caching-layer.md.",
      ),
      "prompt should include write instruction with output path",
    );

    // Without todo source — should match:
    //   Analyze the codebase at <cwd> and produce a structured implementation plan.
    //
    //   Task:
    //   <full task description>
    //
    //   Write the plan to <outputPath>.
    const promptWithoutTodo = buildGenerationPrompt({
      ...baseParams,
      sourceTodoId: null,
    });
    assert.ok(
      promptWithoutTodo.includes("Task:\n"),
      "prompt without todo should use plain 'Task:' header",
    );
    assert.ok(
      !promptWithoutTodo.includes("Task (from TODO-"),
      "prompt without todo should not have '(from TODO-...)' in the header",
    );
  });
});

describe("buildEditPrompt", () => {
  const currentPlan = `# Implementation Plan: Caching Layer

## Task 1: Add Redis connection
Set up Redis client and connection pooling.

## Task 2: Implement cache middleware
Add caching middleware to Express routes.
`;

  const findings: ReviewIssue[] = [
    {
      severity: "error",
      taskNumber: 1,
      shortDescription: "Missing error handling for Redis connection failures",
      fullText:
        "Task 1 does not address error handling when Redis is unavailable. This could cause the entire application to crash on startup.",
    },
    {
      severity: "warning",
      taskNumber: 2,
      shortDescription: "Cache TTL not specified",
      fullText:
        "Task 2 mentions caching middleware but does not specify TTL values. Without explicit TTLs, cached data may become stale.",
    },
  ];

  const baseEditParams = {
    currentPlanContent: currentPlan,
    outputPath: ".pi/plans/2026-04-12-caching-layer.md",
    findings,
    validationErrors: [] as string[],
    strategy: "targeted_edit" as RepairStrategy,
  };

  it("(g) edit prompt includes the current plan content plus specific findings and instructs targeted editing", () => {
    const prompt = buildEditPrompt(baseEditParams);
    assert.ok(
      prompt.includes(currentPlan),
      "edit prompt should include the full current plan content",
    );
    assert.ok(
      prompt.includes(
        "Missing error handling for Redis connection failures",
      ),
      "edit prompt should include finding short descriptions",
    );
    assert.ok(
      prompt.includes(
        "Task 1 does not address error handling when Redis is unavailable",
      ),
      "edit prompt should include finding full text",
    );
    assert.ok(
      prompt.includes("edit the plan in place"),
      "edit prompt should instruct targeted editing",
    );
    assert.ok(
      prompt.includes("do not regenerate sections that are already correct"),
      "edit prompt should instruct not to regenerate correct sections",
    );
  });

  it("(h) edit prompt includes the output path so the plan-generator knows which file to overwrite", () => {
    const prompt = buildEditPrompt(baseEditParams);
    assert.ok(
      prompt.includes(".pi/plans/2026-04-12-caching-layer.md"),
      "edit prompt should include the output path",
    );
  });

  it("(i) edit prompt includes validation errors when present", () => {
    const prompt = buildEditPrompt({
      ...baseEditParams,
      validationErrors: [
        "Missing required header field: Source",
        "Task 2 is missing acceptance criteria",
      ],
    });
    assert.ok(
      prompt.includes("Missing required header field: Source"),
      "edit prompt should include the first validation error",
    );
    assert.ok(
      prompt.includes("Task 2 is missing acceptance criteria"),
      "edit prompt should include the second validation error",
    );
  });

  it("(j-1) partial regen with empty findings but validation errors derives sections from errors", () => {
    const prompt = buildEditPrompt({
      ...baseEditParams,
      strategy: "partial_regen",
      findings: [],
      validationErrors: [
        'Missing required section: Goal',
        'Missing required section: File Structure',
        'Task 3 depends on Task 99, but Task 99 does not exist',
      ],
    });

    // Should contain non-empty section references derived from validation errors
    assert.ok(
      prompt.includes("## Sections to regenerate"),
      "partial regen prompt should have Sections to regenerate heading",
    );
    assert.ok(
      prompt.includes("Goal"),
      "partial regen prompt should derive 'Goal' section from validation error",
    );
    assert.ok(
      prompt.includes("File Structure"),
      "partial regen prompt should derive 'File Structure' section from validation error",
    );
    assert.ok(
      prompt.includes("Task 3"),
      "partial regen prompt should derive 'Task 3' section from validation error",
    );
    // Should NOT have an empty section list
    const sectionsBlock = prompt.split("## Sections to regenerate")[1]!;
    const sectionLines = sectionsBlock.split("\n").filter((l) => l.startsWith("- "));
    assert.ok(
      sectionLines.length > 0,
      "Sections to regenerate should not be empty when validation errors exist",
    );
  });

  it("(j-2) partial regen with unparseable validation errors falls back to generic label", () => {
    const prompt = buildEditPrompt({
      ...baseEditParams,
      strategy: "partial_regen",
      findings: [],
      validationErrors: [
        "Some completely unexpected error format",
      ],
    });

    assert.ok(
      prompt.includes("All structurally invalid sections"),
      "Should fall back to generic label when no specific sections can be parsed",
    );
  });

  it("(j) partial regen prompt identifies the specific section(s) to regenerate based on findings", () => {
    const prompt = buildEditPrompt({
      ...baseEditParams,
      strategy: "partial_regen",
    });
    // Should identify affected sections by task number
    assert.ok(
      prompt.includes("Task 1"),
      "partial regen prompt should identify Task 1 as an affected section",
    );
    assert.ok(
      prompt.includes("Task 2"),
      "partial regen prompt should identify Task 2 as an affected section",
    );
    // Should instruct to regenerate only those sections
    assert.ok(
      prompt.includes("regenerat"),
      "partial regen prompt should instruct regeneration of affected sections",
    );
    assert.ok(
      prompt.includes("preserv"),
      "partial regen prompt should instruct preserving unaffected sections",
    );
    // Should NOT instruct targeted editing
    assert.ok(
      !prompt.includes("edit the plan in place"),
      "partial regen prompt should not instruct targeted editing",
    );
  });
});
