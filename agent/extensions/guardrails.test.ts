import test from "node:test";
import assert from "node:assert/strict";

import guardrails from "./guardrails.ts";

type ToolHandler = (event: any, ctx: any) => Promise<any> | any;

function createToolHandler(): ToolHandler {
  let handler: ToolHandler | undefined;

  guardrails({
    on(event: string, callback: ToolHandler) {
      if (event === "tool_call") {
        handler = callback;
      }
    },
  } as any);

  assert.ok(handler, "guardrails extension should register a tool_call handler");
  return handler;
}

test("blocks kill -9 -1 without UI", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "kill -9 -1" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked kill all processes (no UI to confirm)",
  });
});

test("blocks raw device redirects beyond /dev/sdX", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "echo nope > /dev/disk3" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked raw device overwrite (no UI to confirm)",
  });
});

test("blocks raw device redirects to macOS partition devices", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "echo nope > /dev/disk3s1" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked raw device overwrite (no UI to confirm)",
  });
});

test("blocks raw device writes detected via extracted bash targets", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "cat payload | tee /dev/nvme0n1p1" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked raw device overwrite (no UI to confirm)",
  });
});

test("blocks raw device writes to macOS raw partition devices via tee", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "cat payload | tee /dev/rdisk3s1" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked raw device overwrite (no UI to confirm)",
  });
});

test("allows dd output to safe pseudo-devices", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "dd if=input.bin of=/dev/null bs=4k" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.equal(result, undefined);
});

test("blocks dd output to raw devices", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "dd if=input.bin of=/dev/sda bs=4k" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked raw device overwrite (no UI to confirm)",
  });
});

test("blocks rm -rf style commands without UI", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "rm -rf dist" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked recursive delete (no UI to confirm)",
  });
});

test("blocks find -delete without UI", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "find . -delete" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked recursive delete (find) (no UI to confirm)",
  });
});

test("blocks find -exec rm without UI", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "find . -exec rm {} \\;" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked recursive delete (find) (no UI to confirm)",
  });
});

test("blocks mkfs commands without UI", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "mkfs.ext4 /dev/sdb" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked filesystem format (no UI to confirm)",
  });
});

test("does not flag ordinary chmod 755 commands", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "chmod 755 script.sh" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.equal(result, undefined);
});

test("blocks fork bombs without UI", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: ":(){ :|:& };:" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked fork bomb (no UI to confirm)",
  });
});

test("blocks bash writes to secrets files", async () => {
  const handler = createToolHandler();
  const notifications: Array<{ message: string; level: string }> = [];

  const result = await handler(
    { toolName: "bash", input: { command: "mv draft.txt config/secrets.yaml" } },
    {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        notify(message: string, level: string) {
          notifications.push({ message, level });
        },
      },
    },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Bash command writes to protected path: secrets file",
  });
  assert.equal(notifications.length, 1);
  assert.match(notifications[0]!.message, /secrets file/);
});

test("headless protected writes do not require ui.notify to exist", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "write", input: { path: ".env" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Protected path: environment file",
  });
});

test("blocks writes to .env.local", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "write", input: { path: ".env.local" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Protected path: environment file",
  });
});

test("blocks writes to .dev.vars", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "write", input: { path: ".dev.vars" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Protected path: dev vars file",
  });
});

test("blocks edits to private ssh keys", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "edit", input: { path: ".ssh/id_ed25519" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Protected path: .ssh directory",
  });
});

test("blocks direct writes to secrets files", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "write", input: { path: "config/secrets.yaml" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Protected path: secrets file",
  });
});

test("allows writes to .env.example", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "write", input: { path: ".env.example" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.equal(result, undefined);
});

test("blocks bash writes to Cargo credentials", async () => {
  const handler = createToolHandler();
  const notifications: Array<{ message: string; level: string }> = [];

  const result = await handler(
    { toolName: "bash", input: { command: "cp token.txt ~/.cargo/credentials.toml" } },
    {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        notify(message: string, level: string) {
          notifications.push({ message, level });
        },
      },
    },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Bash command writes to protected path: Cargo credentials",
  });
  assert.equal(notifications.length, 1);
});

test("blocks bash writes to Python package credentials", async () => {
  const handler = createToolHandler();
  const notifications: Array<{ message: string; level: string }> = [];

  const result = await handler(
    { toolName: "bash", input: { command: "cp token.txt .pypirc" } },
    {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        notify(message: string, level: string) {
          notifications.push({ message, level });
        },
      },
    },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Bash command writes to protected path: Python package credentials",
  });
  assert.equal(notifications.length, 1);
});

test("blocks writes inside the git directory", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "write", input: { path: ".git/config" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Protected path: git directory",
  });
});

test("blocks edits inside node_modules", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "edit", input: { path: "node_modules/react/index.js" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Protected path: node_modules",
  });
});

test("blocks writes inside Python virtual environments", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "write", input: { path: ".venv/bin/activate" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Protected path: Python virtual environment",
  });
});

test("blocks writes inside Python tool and cache directories", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "write", input: { path: ".pytest_cache/state/v/cache/nodeids" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Protected path: pytest cache",
  });
});

test("blocks credential files with structured extensions", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "write", input: { path: "config/api-credentials.json" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Protected path: credentials file",
  });
});

test("allows non-secret credentials docs", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "write", input: { path: "docs/credentials.md" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.equal(result, undefined);
});

test("allows public ssh keys outside protected directories", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "write", input: { path: "fixtures/id_ed25519.pub" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.equal(result, undefined);
});

test("allows bash writes to .env.example", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "echo ok > .env.example" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.equal(result, undefined);
});

test("blocks representative soft-protected lockfiles without UI", async () => {
  const handler = createToolHandler();

  for (const basename of ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "Cargo.lock", "go.sum"]) {
    const result = await handler(
      { toolName: "write", input: { path: basename } },
      { cwd: process.cwd(), hasUI: false },
    );

    assert.deepEqual(result, {
      block: true,
      reason: `Protected path (no UI): ${basename}`,
    });
  }
});

test("blocks soft-protected lockfiles without UI", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "write", input: { path: "package-lock.json" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Protected path (no UI): package-lock.json",
  });
});

test("lets users cancel soft-protected lockfile edits", async () => {
  const handler = createToolHandler();
  const confirmations: Array<{ title: string; body: string }> = [];

  const result = await handler(
    { toolName: "write", input: { path: "package-lock.json" } },
    {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        async confirm(title: string, body: string) {
          confirmations.push({ title, body });
          return false;
        },
      },
    },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "User blocked write to package-lock.json",
  });
  assert.deepEqual(confirmations, [
    {
      title: "⚠️ Modifying package-lock.json",
      body: "Are you sure you want to modify package-lock.json?",
    },
  ]);
});

test("allows soft-protected lockfile edits after confirmation", async () => {
  const handler = createToolHandler();
  let confirmationCount = 0;

  const result = await handler(
    { toolName: "write", input: { path: "package-lock.json" } },
    {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        async confirm() {
          confirmationCount += 1;
          return true;
        },
      },
    },
  );

  assert.equal(result, undefined);
  assert.equal(confirmationCount, 1);
});

test("lets users cancel dangerous commands in UI mode", async () => {
  const handler = createToolHandler();
  const confirmations: Array<{ title: string; body: string }> = [];

  const result = await handler(
    { toolName: "bash", input: { command: "sudo ls" } },
    {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        async confirm(title: string, body: string) {
          confirmations.push({ title, body });
          return false;
        },
      },
    },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked sudo command by user",
  });
  assert.deepEqual(confirmations, [
    {
      title: "⚠️ Dangerous command: sudo command",
      body: "sudo ls",
    },
  ]);
});

test("allows dangerous commands after UI confirmation", async () => {
  const handler = createToolHandler();
  let confirmationCount = 0;

  const result = await handler(
    { toolName: "bash", input: { command: "sudo ls" } },
    {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        async confirm() {
          confirmationCount += 1;
          return true;
        },
      },
    },
  );

  assert.equal(result, undefined);
  assert.equal(confirmationCount, 1);
});

test("allows raw device writes to proceed after explicit UI confirmation", async () => {
  const handler = createToolHandler();
  const confirmations: Array<{ title: string; body: string }> = [];

  const result = await handler(
    { toolName: "bash", input: { command: "echo nope > /dev/disk4s2" } },
    {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        async confirm(title: string, body: string) {
          confirmations.push({ title, body });
          return true;
        },
      },
    },
  );

  assert.equal(result, undefined);
  assert.deepEqual(confirmations, [
    {
      title: "⚠️ Dangerous command: raw device overwrite",
      body: "echo nope > /dev/disk4s2",
    },
  ]);
});

test("blocks dd output targets provided as separate arguments", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "dd if input.bin of /dev/sdb bs 4k" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked raw device overwrite (no UI to confirm)",
  });
});

test("allows gradle-wrapper.jar edits without soft-protection prompts", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "write", input: { path: "gradle/wrapper/gradle-wrapper.jar" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.equal(result, undefined);
});

test("allows writes inside .gradle directories", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "write", input: { path: ".gradle/build-cache/state.bin" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.equal(result, undefined);
});

// -- Git command guardrails --

test("blocks git hard resets without UI", async () => {
  const handler = createToolHandler();

  for (const command of ["git reset --hard", "git reset --hard HEAD~3", "git reset origin/main --hard"]) {
    const result = await handler(
      { toolName: "bash", input: { command } },
      { cwd: process.cwd(), hasUI: false },
    );

    assert.deepEqual(result, {
      block: true,
      reason: "Blocked git hard reset (no UI to confirm)",
    });
  }
});

test("blocks destructive git clean variants without UI", async () => {
  const handler = createToolHandler();

  for (const command of [
    "git clean -fd",
    "git clean -fdx",
    "git clean -xfd",
    "git clean -f -d",
    "git clean -d -f -x",
  ]) {
    const result = await handler(
      { toolName: "bash", input: { command } },
      { cwd: process.cwd(), hasUI: false },
    );

    assert.deepEqual(result, {
      block: true,
      reason: "Blocked git clean with force + directory removal (no UI to confirm)",
    });
  }
});

test("blocks git force pushes without UI", async () => {
  const handler = createToolHandler();

  for (const command of [
    "git push --force",
    "git push --force-with-lease",
    "git push -f origin feature",
    "git push origin --force",
  ]) {
    const result = await handler(
      { toolName: "bash", input: { command } },
      { cwd: process.cwd(), hasUI: false },
    );

    assert.deepEqual(result, {
      block: true,
      reason: "Blocked git force push (no UI to confirm)",
    });
  }
});

test("blocks direct pushes to protected branches without UI", async () => {
  const handler = createToolHandler();

  for (const command of [
    "git push origin main",
    "git push origin master",
    "git push origin HEAD:main",
    "git push upstream master",
    "git push origin feature:main",
    "git push origin HEAD:refs/heads/main",
    "git push origin refs/heads/feature:refs/heads/master",
  ]) {
    const result = await handler(
      { toolName: "bash", input: { command } },
      { cwd: process.cwd(), hasUI: false },
    );

    assert.deepEqual(result, {
      block: true,
      reason: "Blocked git push to protected branch (no UI to confirm)",
    });
  }
});

test("blocks git commands with common global options without UI", async () => {
  const handler = createToolHandler();

  const cases = [
    ["git -C repo reset --hard", "Blocked git hard reset (no UI to confirm)"],
    ["git -c color.ui=always push --force origin main", "Blocked git force push (no UI to confirm)"],
    ["git --git-dir=.git push origin feature:main", "Blocked git push to protected branch (no UI to confirm)"],
  ] as const;

  for (const [command, reason] of cases) {
    const result = await handler(
      { toolName: "bash", input: { command } },
      { cwd: process.cwd(), hasUI: false },
    );

    assert.deepEqual(result, {
      block: true,
      reason,
    });
  }
});

test("lets users cancel git hard resets in UI mode", async () => {
  const handler = createToolHandler();
  const confirmations: Array<{ title: string; body: string }> = [];

  const result = await handler(
    { toolName: "bash", input: { command: "git reset --hard HEAD~3" } },
    {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        async confirm(title: string, body: string) {
          confirmations.push({ title, body });
          return false;
        },
      },
    },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked git hard reset by user",
  });
  assert.deepEqual(confirmations, [
    {
      title: "⚠️ Dangerous command: git hard reset",
      body: "git reset --hard HEAD~3",
    },
  ]);
});

test("allows destructive git clean after UI confirmation", async () => {
  const handler = createToolHandler();
  let confirmationCount = 0;

  const result = await handler(
    { toolName: "bash", input: { command: "git clean -d -f -x" } },
    {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        async confirm() {
          confirmationCount += 1;
          return true;
        },
      },
    },
  );

  assert.equal(result, undefined);
  assert.equal(confirmationCount, 1);
});

test("lets users cancel pushes to protected branches in UI mode", async () => {
  const handler = createToolHandler();
  const confirmations: Array<{ title: string; body: string }> = [];

  const result = await handler(
    { toolName: "bash", input: { command: "git push origin HEAD:main" } },
    {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        async confirm(title: string, body: string) {
          confirmations.push({ title, body });
          return false;
        },
      },
    },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked git push to protected branch by user",
  });
  assert.deepEqual(confirmations, [
    {
      title: "⚠️ Dangerous command: git push to protected branch",
      body: "git push origin HEAD:main",
    },
  ]);
});

test("allows git force pushes after UI confirmation", async () => {
  const handler = createToolHandler();
  let confirmationCount = 0;

  const result = await handler(
    { toolName: "bash", input: { command: "git push --force-with-lease" } },
    {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        async confirm() {
          confirmationCount += 1;
          return true;
        },
      },
    },
  );

  assert.equal(result, undefined);
  assert.equal(confirmationCount, 1);
});

test("allows git clean dry-run even with force + directory flags", async () => {
  const handler = createToolHandler();

  for (const command of [
    "git clean -nfd",
    "git clean -nfdx",
    "git clean --dry-run -fd",
    "git clean -fd --dry-run",
    "git clean -f --dry-run -d",
    "git clean --dry-run --force -d",
  ]) {
    const result = await handler(
      { toolName: "bash", input: { command } },
      { cwd: process.cwd(), hasUI: false },
    );

    assert.equal(result, undefined, command);
  }
});

test("allows git push dry-run even with force or protected branch", async () => {
  const handler = createToolHandler();

  for (const command of [
    "git push -n origin main",
    "git push --dry-run origin main",
    "git push --dry-run --force origin feature",
    "git push -n --force-with-lease origin master",
    "git push --force --dry-run origin main",
    "git push -nf origin feature",
  ]) {
    const result = await handler(
      { toolName: "bash", input: { command } },
      { cwd: process.cwd(), hasUI: false },
    );

    assert.equal(result, undefined, command);
  }
});

test("does not flag ordinary git operations", async () => {
  const handler = createToolHandler();

  for (const command of [
    "git reset HEAD~1",
    "git reset --soft HEAD~1",
    "git clean -nd",
    "git push",
    "git push origin feature-branch",
    "git push -u origin feature",
    "git checkout main",
    "git pull origin main",
    "git status",
    "git diff",
    "git log --oneline",
    "git push origin main-feature",
    "git push origin remaster",
  ]) {
    const result = await handler(
      { toolName: "bash", input: { command } },
      { cwd: process.cwd(), hasUI: false },
    );

    assert.equal(result, undefined, command);
  }
});

// -- Web-browser skill guardrails --

test("blocks file:// navigation in browser", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "./scripts/nav.js file:///etc/passwd" } },
    { cwd: process.cwd(), hasUI: true },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked file:// navigation in browser",
  });
});

test("blocks file:// navigation with quoted URL", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "./scripts/nav.js 'file:///Users/david/.ssh/id_ed25519'" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked file:// navigation in browser",
  });
});

test("blocks FILE:// navigation (case-insensitive)", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "./scripts/nav.js FILE:///etc/hosts" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked file:// navigation in browser",
  });
});

test("blocks file:// navigation with double-quoted URL", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: './scripts/nav.js "file:///etc/passwd"' } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked file:// navigation in browser",
  });
});

test("blocks file:// navigation when --new flag precedes URL", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "./scripts/nav.js --new file:///etc/passwd" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked file:// navigation in browser",
  });
});

test("allows normal https navigation", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "./scripts/nav.js https://example.com" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.equal(result, undefined);
});

test("allows nav.js --new with https URL", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "./scripts/nav.js https://example.com --new" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.equal(result, undefined);
});

test("blocks start.js --profile without UI", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "./scripts/start.js --profile" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked browser launch with your real Chrome profile (cookies, logins) (no UI to confirm)",
  });
});

test("lets users cancel --profile launch", async () => {
  const handler = createToolHandler();
  const confirmations: Array<{ title: string; body: string }> = [];

  const result = await handler(
    { toolName: "bash", input: { command: "./scripts/start.js --profile" } },
    {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        async confirm(title: string, body: string) {
          confirmations.push({ title, body });
          return false;
        },
      },
    },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Blocked browser launch with your real Chrome profile (cookies, logins) by user",
  });
  assert.equal(confirmations.length, 1);
  assert.match(confirmations[0]!.title, /Chrome profile/);
});

test("allows --profile launch after UI confirmation", async () => {
  const handler = createToolHandler();
  let confirmationCount = 0;

  const result = await handler(
    { toolName: "bash", input: { command: "./scripts/start.js --profile" } },
    {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        async confirm() {
          confirmationCount += 1;
          return true;
        },
      },
    },
  );

  assert.equal(result, undefined);
  assert.equal(confirmationCount, 1);
});

test("allows start.js without --profile", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "bash", input: { command: "./scripts/start.js" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.equal(result, undefined);
});

test("allows unrelated tool calls", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "read", input: { path: "README.md" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.equal(result, undefined);
});
