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

test("allows unrelated tool calls", async () => {
  const handler = createToolHandler();

  const result = await handler(
    { toolName: "read", input: { path: "README.md" } },
    { cwd: process.cwd(), hasUI: false },
  );

  assert.equal(result, undefined);
});
