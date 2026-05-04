import { execFileSync } from "node:child_process";
import path from "node:path";

const TODO_PATH_ENV = "PI_TODO_PATH";

function getGitRoot(cwd: string): string {
	try {
		return execFileSync("git", ["rev-parse", "--show-toplevel"], {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return cwd;
	}
}

export default function configureTodoPath() {
	const existingTodoPath = process.env[TODO_PATH_ENV];
	if (existingTodoPath?.trim()) return;

	process.env[TODO_PATH_ENV] = path.join(getGitRoot(process.cwd()), "docs", "todos");
}
