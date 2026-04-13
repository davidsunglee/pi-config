import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveInput } from "./input-resolver.ts";
import type { GenerationIO, GenerationInput } from "./types.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal mock IO — only readTodo and readFile are relevant for resolveInput. */
function mockIO(overrides: Partial<GenerationIO> = {}): GenerationIO {
  return {
    readFile: async () => "",
    writeFile: async () => {},
    fileExists: async () => false,
    mkdir: async () => {},
    readdir: async () => [],
    readTodo: async () => ({ title: "", body: "" }),
    dispatchSubagent: async () => ({ text: "", exitCode: 0 }),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("resolveInput", () => {
  // (a) todo input
  it("todo input calls io.readTodo and returns ResolvedInput with todo body and slugified title", async () => {
    let calledWith: string | undefined;
    const io = mockIO({
      readTodo: async (todoId: string) => {
        calledWith = todoId;
        return { title: "Add User Authentication Flow", body: "Implement OAuth2 with Google provider." };
      },
    });

    const input: GenerationInput = { type: "todo", todoId: "abc123" };
    const result = await resolveInput(io, input);

    assert.equal(calledWith, "abc123", "should call io.readTodo with the todoId");
    assert.equal(result.sourceText, "Implement OAuth2 with Google provider.");
    assert.equal(result.sourceTodoId, "abc123");
    assert.equal(result.shortDescription, "add-user-authentication-flow");
  });

  // (b) file input
  it("file input calls io.readFile and returns ResolvedInput with file contents and filename-based description", async () => {
    let calledWith: string | undefined;
    const io = mockIO({
      readFile: async (filePath: string) => {
        calledWith = filePath;
        return "# My Plan\n\nSome plan content here.";
      },
    });

    const input: GenerationInput = { type: "file", filePath: "/home/user/specs/user-auth-spec.md" };
    const result = await resolveInput(io, input);

    assert.equal(calledWith, "/home/user/specs/user-auth-spec.md", "should call io.readFile with the filePath");
    assert.equal(result.sourceText, "# My Plan\n\nSome plan content here.");
    assert.equal(result.sourceTodoId, null);
    assert.equal(result.shortDescription, "user-auth-spec");
  });

  // (c) freeform input
  it("freeform input returns ResolvedInput with raw text and description from first line", async () => {
    const io = mockIO();
    const input: GenerationInput = {
      type: "freeform",
      text: "Build a REST API for user management\nwith CRUD operations and validation",
    };
    const result = await resolveInput(io, input);

    assert.equal(result.sourceText, "Build a REST API for user management\nwith CRUD operations and validation");
    assert.equal(result.sourceTodoId, null);
    assert.equal(result.shortDescription, "build-a-rest-api-for-user-management");
  });

  // (d) todo input with non-existent todo throws
  it("todo input throws a descriptive error when todo does not exist", async () => {
    const io = mockIO({
      readTodo: async () => {
        throw new Error("Todo not found: no-such-id");
      },
    });

    const input: GenerationInput = { type: "todo", todoId: "no-such-id" };
    await assert.rejects(
      () => resolveInput(io, input),
      (err: Error) => {
        assert.ok(err.message.includes("no-such-id"), `Expected error to mention todoId, got: ${err.message}`);
        return true;
      },
    );
  });

  // (e) file input with non-existent file throws
  it("file input throws a descriptive error when file does not exist", async () => {
    const io = mockIO({
      readFile: async () => {
        throw new Error("ENOENT: no such file or directory");
      },
    });

    const input: GenerationInput = { type: "file", filePath: "/nonexistent/path.md" };
    await assert.rejects(
      () => resolveInput(io, input),
      (err: Error) => {
        assert.ok(err.message.includes("/nonexistent/path.md"), `Expected error to mention file path, got: ${err.message}`);
        return true;
      },
    );
  });

  // (f) shortDescription is properly slugified
  describe("slugification", () => {
    it("lowercases and replaces spaces with hyphens", async () => {
      const io = mockIO({
        readTodo: async () => ({ title: "Hello World", body: "text" }),
      });
      const result = await resolveInput(io, { type: "todo", todoId: "t1" });
      assert.equal(result.shortDescription, "hello-world");
    });

    it("removes special characters", async () => {
      const io = mockIO({
        readTodo: async () => ({ title: "Fix Bug #123: Handle (edge) cases!", body: "text" }),
      });
      const result = await resolveInput(io, { type: "todo", todoId: "t2" });
      assert.equal(result.shortDescription, "fix-bug-123-handle-edge-cases");
    });

    it("collapses consecutive hyphens", async () => {
      const io = mockIO({
        readTodo: async () => ({ title: "foo---bar   baz", body: "text" }),
      });
      const result = await resolveInput(io, { type: "todo", todoId: "t3" });
      assert.equal(result.shortDescription, "foo-bar-baz");
    });

    it("trims leading and trailing hyphens", async () => {
      const io = mockIO({
        readTodo: async () => ({ title: "  --hello world--  ", body: "text" }),
      });
      const result = await resolveInput(io, { type: "todo", todoId: "t4" });
      assert.equal(result.shortDescription, "hello-world");
    });

    it("truncates to 40 characters max", async () => {
      const io = mockIO({
        readTodo: async () => ({
          title: "This is a very long title that absolutely exceeds forty characters by a lot",
          body: "text",
        }),
      });
      const result = await resolveInput(io, { type: "todo", todoId: "t5" });
      assert.ok(result.shortDescription.length <= 40, `Expected <= 40 chars, got ${result.shortDescription.length}: "${result.shortDescription}"`);
      // Should not end with a hyphen after truncation
      assert.ok(!result.shortDescription.endsWith("-"), `Should not end with hyphen: "${result.shortDescription}"`);
    });

    it("freeform truncates first line for shortDescription", async () => {
      const io = mockIO();
      const result = await resolveInput(io, {
        type: "freeform",
        text: "Implement a comprehensive authentication system with OAuth2 and SAML support\nMore details here",
      });
      assert.ok(result.shortDescription.length <= 40, `Expected <= 40 chars, got ${result.shortDescription.length}: "${result.shortDescription}"`);
      assert.ok(!result.shortDescription.endsWith("-"), `Should not end with hyphen: "${result.shortDescription}"`);
    });

    it("file input derives shortDescription from filename without extension", async () => {
      const io = mockIO({
        readFile: async () => "content",
      });
      const result = await resolveInput(io, { type: "file", filePath: "specs/My Cool Spec.test.md" });
      assert.equal(result.shortDescription, "my-cool-spec-test");
    });
  });
});
