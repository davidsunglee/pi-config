import type { GenerationIO, GenerationInput, ResolvedInput } from "./types.ts";
import { basename } from "node:path";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Lowercase, replace non-alphanumeric with hyphens, collapse, trim, truncate to 40 chars. */
function slugify(text: string): string {
  let slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length > 40) {
    slug = slug.slice(0, 40).replace(/-+$/, "");
  }

  return slug;
}

/** Extract filename without extension (strips only the last extension). */
function filenameWithoutExtension(filePath: string): string {
  const name = basename(filePath);
  const dotIndex = name.lastIndexOf(".");
  return dotIndex > 0 ? name.slice(0, dotIndex) : name;
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function resolveInput(
  io: GenerationIO,
  input: GenerationInput,
): Promise<ResolvedInput> {
  switch (input.type) {
    case "todo": {
      let todo: { title: string; body: string };
      try {
        todo = await io.readTodo(input.todoId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to read todo "${input.todoId}": ${msg}`);
      }
      return {
        sourceText: todo.body,
        sourceTodoId: input.todoId,
        shortDescription: slugify(todo.title),
      };
    }

    case "file": {
      let contents: string;
      try {
        contents = await io.readFile(input.filePath);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to read file "${input.filePath}": ${msg}`);
      }
      return {
        sourceText: contents,
        sourceTodoId: null,
        shortDescription: slugify(filenameWithoutExtension(input.filePath)),
      };
    }

    case "freeform": {
      const firstLine = input.text.split("\n")[0] ?? input.text;
      return {
        sourceText: input.text,
        sourceTodoId: null,
        shortDescription: slugify(firstLine),
      };
    }
  }
}
