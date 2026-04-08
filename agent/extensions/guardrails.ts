// https://github.com/michalvavra/agents

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { realpath } from "node:fs/promises";
import * as path from "node:path";

/**
 * Comprehensive security hook:
 * - Blocks dangerous bash commands (rm -rf, sudo, chmod 777, etc.)
 * - Protects sensitive paths from writes (.env, node_modules, .git, keys)
 */
function toMatchPath(filePath: string) {
  return path.normalize(filePath).replace(/\\/g, "/");
}

async function getProtectedPathCandidates(filePath: string, cwd: string) {
  const normalizedPath = toMatchPath(filePath);
  const absolutePath = toMatchPath(path.resolve(cwd, normalizedPath));
  const candidates = new Set([normalizedPath, absolutePath]);

  try {
    candidates.add(toMatchPath(await realpath(absolutePath)));
  } catch {
    try {
      const realParent = await realpath(path.dirname(absolutePath));
      candidates.add(toMatchPath(path.join(realParent, path.basename(absolutePath))));
    } catch {
      // Best-effort only: the path may not exist yet and its parent may also be unresolved.
    }
  }

  return [...candidates];
}

export default function (pi: ExtensionAPI) {
  const dangerousCommands = [
    { pattern: /\brm\s+(-[^\s]*r|--recursive)/, desc: "recursive delete" }, // rm -rf, rm -r, rm --recursive
    { pattern: /\bfind\b.*(?:\s-delete\b|\s-exec\s+rm\b)/, desc: "recursive delete (find)" }, // find / -delete, find -exec rm
    { pattern: /\bsudo\b/, desc: "sudo command" }, // sudo anything
    { pattern: /\b(chmod|chown)\b.*\b777\b/, desc: "dangerous permissions" }, // chmod 777 (won't match 7770, etc.)
    { pattern: /\bmkfs\b/, desc: "filesystem format" }, // mkfs.ext4, mkfs.xfs
    { pattern: /\bdd\b.*\bof=\/dev\//, desc: "raw device write" }, // dd if=x of=/dev/sda
    { pattern: />\s*\/dev\/(?!null|zero|random|urandom|stdin|stdout|stderr)/, desc: "raw device overwrite" }, // > /dev/sda, /dev/nvme0n1 (not /dev/null)
    { pattern: /\bkill\s+-9\s+-1\b/, desc: "kill all processes" }, // kill -9 -1
    { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/, desc: "fork bomb" }, // :(){:|:&};:
  ];

  const protectedPaths = [
    { pattern: /\.env($|\.(?!example))/, desc: "environment file" }, // .env, .env.local (but not .env.example)
    { pattern: /\.dev\.vars($|\.)/, desc: "dev vars file" }, // .dev.vars, .dev.vars.local
    { pattern: /node_modules\//, desc: "node_modules" }, // node_modules/
    { pattern: /^\.git\/|\/\.git\//, desc: "git directory" }, // .git/
    { pattern: /\.pem$|\.key$/, desc: "private key file" }, // *.pem, *.key
    { pattern: /id_rsa|id_ed25519|id_ed25519_github|id_ecdsa/, desc: "SSH key" }, // id_rsa, id_ed25519
    { pattern: /\.ssh\//, desc: ".ssh directory" }, // .ssh/
    { pattern: /secrets?\.(json|ya?ml|toml)$/i, desc: "secrets file" }, // secrets.json, secret.yaml
    { pattern: /credentials/i, desc: "credentials file" }, // credentials, CREDENTIALS
  ];

  const softProtectedPaths = [
    { pattern: /package-lock\.json$/, desc: "package-lock.json" },
    { pattern: /yarn\.lock$/, desc: "yarn.lock" },
    { pattern: /pnpm-lock\.yaml$/, desc: "pnpm-lock.yaml" },
  ];

  const dangerousBashWrites = [
    />\s*\.env(?!\.example)(\b|$)/, // echo x > .env, .env.local (but not .env.example)
    />\s*\.dev\.vars/, // echo x > .dev.vars
    />\s*.*\.pem/, // echo x > key.pem
    />\s*.*\.key/, // echo x > secret.key
    /tee\s+.*\.env(?!\.example)(\b|$)/, // cat x | tee .env, .env.local (but not .env.example)
    /tee\s+.*\.dev\.vars/, // cat x | tee .dev.vars
    /cp\s+.*\s+\.env(?!\.example)(\b|$)/, // cp x .env, .env.local (but not .env.example)
    /mv\s+.*\s+\.env(?!\.example)(\b|$)/, // mv x .env, .env.local (but not .env.example)
  ];

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash") {
      const command = event.input.command as string;

      for (const { pattern, desc } of dangerousCommands) {
        if (pattern.test(command)) {
          if (!ctx.hasUI) {
            return { block: true, reason: `Blocked ${desc} (no UI to confirm)` };
          }

          const ok = await ctx.ui.confirm(`⚠️ Dangerous command: ${desc}`, command);

          if (!ok) {
            return { block: true, reason: `Blocked ${desc} by user` };
          }
          break;
        }
      }

      for (const pattern of dangerousBashWrites) {
        if (pattern.test(command)) {
          ctx.ui.notify(`🛡️ Blocked bash write to protected path`, "warning");
          return { block: true, reason: "Bash command writes to protected path" };
        }
      }

      return undefined;
    }

    if (event.toolName === "write" || event.toolName === "edit") {
      const filePath = event.input.path as string;
      const pathCandidates = await getProtectedPathCandidates(filePath, ctx.cwd);

      for (const { pattern, desc } of protectedPaths) {
        if (pathCandidates.some((candidate) => pattern.test(candidate))) {
          ctx.ui.notify(`🛡️ Blocked write to ${desc}: ${filePath}`, "warning");
          return { block: true, reason: `Protected path: ${desc}` };
        }
      }

      for (const { pattern, desc } of softProtectedPaths) {
        if (pathCandidates.some((candidate) => pattern.test(candidate))) {
          if (!ctx.hasUI) {
            return { block: true, reason: `Protected path (no UI): ${desc}` };
          }

          const ok = await ctx.ui.confirm(
            `⚠️ Modifying ${desc}`,
            `Are you sure you want to modify ${filePath}?`,
          );

          if (!ok) {
            return { block: true, reason: `User blocked write to ${desc}` };
          }
          break;
        }
      }

      return undefined;
    }

    return undefined;
  });
}

