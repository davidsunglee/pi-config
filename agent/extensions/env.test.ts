import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import configureTodoPath from "./env.ts";

async function withIsolatedProcessState(fn: (repoDir: string) => Promise<void>): Promise<void> {
	const previousCwd = process.cwd();
	const previousTodoPath = process.env.PI_TODO_PATH;
	const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-todo-path-"));

	try {
		const gitInit = spawnSync("git", ["init"], { cwd: repoDir, encoding: "utf8" });
		assert.equal(gitInit.status, 0, gitInit.stderr || gitInit.stdout);
		await fn(repoDir);
	} finally {
		process.chdir(previousCwd);
		if (previousTodoPath === undefined) {
			delete process.env.PI_TODO_PATH;
		} else {
			process.env.PI_TODO_PATH = previousTodoPath;
		}
		await fs.rm(repoDir, { recursive: true, force: true });
	}
}

test("sets PI_TODO_PATH to docs/todos under the git root when unset", async () => {
	await withIsolatedProcessState(async (repoDir) => {
		const nestedDir = path.join(repoDir, "nested", "project");
		await fs.mkdir(nestedDir, { recursive: true });
		process.chdir(nestedDir);
		delete process.env.PI_TODO_PATH;

		configureTodoPath();

		const realRepoDir = await fs.realpath(repoDir);
		assert.equal(process.env.PI_TODO_PATH, path.join(realRepoDir, "docs", "todos"));
	});
});

test("preserves an explicit PI_TODO_PATH override", async () => {
	await withIsolatedProcessState(async (repoDir) => {
		process.chdir(repoDir);
		process.env.PI_TODO_PATH = "/tmp/custom-todos";

		configureTodoPath();

		assert.equal(process.env.PI_TODO_PATH, "/tmp/custom-todos");
	});
});
