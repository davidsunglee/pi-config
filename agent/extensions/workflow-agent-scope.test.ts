import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

test("workflow skill files must not specify agentScope", async () => {
  const repoRoot = path.resolve(import.meta.dirname, "..", "..");
  const workflowRoot = path.resolve(import.meta.dirname, "..", "skills");

  // Helper function to collect all markdown files recursively
  async function collectMarkdownFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await readdir(dir, {
      withFileTypes: true,
      recursive: true,
    });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const fullPath = path.join(entry.parentPath ?? dir, entry.name);
        files.push(fullPath);
      }
    }

    return files;
  }

  const FORBIDDEN = "agentScope";
  const violations: Array<{ file: string; line: number; text: string }> = [];

  // Collect and scan all markdown files
  const markdownFiles = await collectMarkdownFiles(workflowRoot);

  for (const file of markdownFiles) {
    const content = await readFile(file, "utf-8");
    const lines = content.split("\n");

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      if (line.includes(FORBIDDEN)) {
        violations.push({
          file,
          line: lineNum + 1, // 1-based line numbers
          text: line.trim(),
        });
      }
    }
  }

  // Format violation messages
  if (violations.length > 0) {
    const messages = violations.map((v) => {
      if (v.file === "synthetic") {
        return `${v.file}:${v.line}: ${v.text}`;
      }
      const relPath = path.relative(repoRoot, v.file);
      return `${relPath}:${v.line}: ${v.text}`;
    });
    assert.fail(`Found ${violations.length} agentScope violation(s):\n${messages.join("\n")}`);
  }
});
