import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function getTodosCommandDescription(cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
	const todosModuleUrl = new URL("./todos.ts", import.meta.url).href;
	const script = `
		import todosExtension from ${JSON.stringify(todosModuleUrl)};

		let registeredCommand;
		todosExtension({
			on() {},
			registerTool() {},
			registerCommand(name, command) {
				if (name === "todos") registeredCommand = command;
			},
		});

		if (!registeredCommand) {
			console.error("todos command was not registered");
			process.exit(1);
		}

		console.log(registeredCommand.description);
	`;

	const result = spawnSync(
		process.execPath,
		["--experimental-transform-types", "--input-type=module", "--eval", script],
		{ cwd, env, encoding: "utf8" },
	);

	assert.equal(result.status, 0, result.stderr || result.stdout);
	return result.stdout.trim();
}

test("/todos command description shows PI_TODO_PATH relative to git root when possible", async () => {
	const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-todos-description-"));

	try {
		const gitInit = spawnSync("git", ["init"], { cwd: repoDir, encoding: "utf8" });
		assert.equal(gitInit.status, 0, gitInit.stderr || gitInit.stdout);
		const realRepoDir = await fs.realpath(repoDir);
		const nestedCwd = path.join(realRepoDir, "nested", "project");
		await fs.mkdir(nestedCwd, { recursive: true });

		const description = await getTodosCommandDescription(nestedCwd, {
			...process.env,
			PI_TODO_PATH: path.join(realRepoDir, "docs", "todos"),
		});

		assert.equal(description, "List todos from docs/todos");
	} finally {
		await fs.rm(repoDir, { recursive: true, force: true });
	}
});

test("/todos command description keeps absolute PI_TODO_PATH outside git root", async () => {
	const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-todos-description-repo-"));
	const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-todos-description-outside-"));

	try {
		const gitInit = spawnSync("git", ["init"], { cwd: repoDir, encoding: "utf8" });
		assert.equal(gitInit.status, 0, gitInit.stderr || gitInit.stdout);
		const realOutsideDir = await fs.realpath(outsideDir);
		const outsideTodos = path.join(realOutsideDir, "todos");

		const description = await getTodosCommandDescription(repoDir, {
			...process.env,
			PI_TODO_PATH: outsideTodos,
		});

		assert.equal(description, `List todos from ${outsideTodos}`);
	} finally {
		await fs.rm(repoDir, { recursive: true, force: true });
		await fs.rm(outsideDir, { recursive: true, force: true });
	}
});

test("/todos command description keeps absolute PI_TODO_PATH when not in a git repo", async () => {
	const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "pi-todos-description-"));
	const realCwd = await fs.realpath(cwd);

	try {
		const description = await getTodosCommandDescription(cwd, {
			...process.env,
			PI_TODO_PATH: "docs/todos",
		});

		assert.equal(description, `List todos from ${path.join(realCwd, "docs", "todos")}`);
	} finally {
		await fs.rm(cwd, { recursive: true, force: true });
	}
});
