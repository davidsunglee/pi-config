// https://github.com/michalvavra/agents

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { realpath } from "node:fs/promises";
import * as path from "node:path";

/**
 * Comprehensive security hook:
 * - Blocks dangerous bash commands (rm -rf, sudo, chmod 777, etc.)
 * - Protects sensitive paths from writes (.env, node_modules, .git, keys)
 */
type PathCandidate = {
  path: string;
  basename: string;
  segments: string[];
};

function toMatchPath(filePath: string) {
  return path.normalize(filePath).replace(/\\/g, "/");
}

function toPathCandidate(filePath: string): PathCandidate {
  const normalizedPath = toMatchPath(filePath);
  const segments = normalizedPath.split("/").filter((segment) => segment.length > 0);
  const basename = segments.at(-1) ?? normalizedPath;

  return {
    path: normalizedPath,
    basename,
    segments,
  };
}

function isEnvFile(basename: string) {
  return basename === ".env" || (basename.startsWith(".env.") && !basename.startsWith(".env.example"));
}

function isDevVarsFile(basename: string) {
  return basename === ".dev.vars" || basename.startsWith(".dev.vars.");
}

function isPrivateKeyFile(basename: string) {
  return basename.endsWith(".pem") || basename.endsWith(".key");
}

function isSshPrivateKeyName(basename: string) {
  return ["id_rsa", "id_ed25519", "id_ed25519_github", "id_ecdsa"].includes(basename);
}

function isSecretsFile(basename: string) {
  return /secrets?\.(json|ya?ml|toml)$/i.test(basename);
}

function isCredentialsPath(filePath: string) {
  const { basename, segments } = toPathCandidate(filePath);
  const lowercaseBasename = basename.toLowerCase();
  const lowercaseSegments = segments.map((segment) => segment.toLowerCase());

  if (lowercaseSegments.includes("credentials")) {
    return true;
  }

  if (lowercaseBasename === "credentials" || lowercaseBasename === "application_default_credentials.json") {
    return true;
  }

  const parts = lowercaseBasename.split(".");
  const stem = parts.shift() ?? "";
  const extensions = parts;

  if (!stem.includes("credentials")) {
    return false;
  }

  if (extensions.length === 0) {
    return stem.endsWith("-credentials") || stem.endsWith("_credentials");
  }

  const allowedExtensions = new Set([
    "json",
    "yaml",
    "yml",
    "toml",
    "txt",
    "cfg",
    "ini",
    "env",
    "enc",
    "local",
    "production",
    "staging",
    "development",
    "dev",
    "prod",
  ]);

  return extensions.every((extension) => allowedExtensions.has(extension));
}

async function resolveNearestExistingPath(absolutePath: string) {
  const suffix: string[] = [];
  let ancestor = absolutePath;

  while (true) {
    try {
      const resolvedAncestor = await realpath(ancestor);
      return path.join(resolvedAncestor, ...suffix);
    } catch {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) {
        return undefined;
      }

      suffix.unshift(path.basename(ancestor));
      ancestor = parent;
    }
  }
}

async function getProtectedPathCandidates(filePath: string, cwd: string) {
  const candidates = new Map<string, PathCandidate>();
  const addCandidate = (candidatePath: string) => {
    const candidate = toPathCandidate(candidatePath);
    candidates.set(candidate.path, candidate);
  };

  addCandidate(filePath);

  const absolutePath = path.resolve(cwd, filePath);
  const resolvedTarget = await resolveNearestExistingPath(absolutePath);

  if (resolvedTarget) {
    let resolvedCwd: string;
    try {
      resolvedCwd = await realpath(cwd);
    } catch {
      resolvedCwd = path.resolve(cwd);
    }

    addCandidate(path.relative(resolvedCwd, resolvedTarget) || ".");
  }

  return [...candidates.values()];
}

function isRawDeviceOverwrite(command: string) {
  return />\s*\/dev\/(?!(?:null|zero|random|urandom|stdin|stdout|stderr)(?:$|[\s;&|)]))/.test(command);
}

export default function (pi: ExtensionAPI) {
  const dangerousCommands = [
    { pattern: /\brm\s+(-[^\s]*r|--recursive)/, desc: "recursive delete" }, // rm -rf, rm -r, rm --recursive
    { pattern: /\bfind\b.*(?:\s-delete\b|\s-exec\s+rm\b)/, desc: "recursive delete (find)" }, // find / -delete, find -exec rm
    { pattern: /\bsudo\b/, desc: "sudo command" }, // sudo anything
    { pattern: /\bchmod\b(?:\s+-[^\s]+)*\s+[0-7]*777\b/, desc: "dangerous permissions" }, // chmod 777, 0777, 1777, etc.
    { pattern: /\bmkfs\b/, desc: "filesystem format" }, // mkfs.ext4, mkfs.xfs
    { pattern: /\bdd\b.*\bof=\/dev\//, desc: "raw device write" }, // dd if=x of=/dev/sda
    { matches: isRawDeviceOverwrite, desc: "raw device overwrite" }, // > /dev/sda, /dev/nvme0n1 (not exact safe pseudo-devices)
    { pattern: /\bkill\s+-9\s+-1\b/, desc: "kill all processes" }, // kill -9 -1
    { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/, desc: "fork bomb" }, // :(){:|:&};:
  ];

  const protectedPaths = [
    { matches: ({ basename }: PathCandidate) => isEnvFile(basename), desc: "environment file" }, // .env, .env.local (but not .env.example)
    { matches: ({ basename }: PathCandidate) => isDevVarsFile(basename), desc: "dev vars file" }, // .dev.vars, .dev.vars.local
    { matches: ({ segments }: PathCandidate) => segments.includes("node_modules"), desc: "node_modules" }, // node_modules/
    { matches: ({ segments }: PathCandidate) => segments.includes(".git"), desc: "git directory" }, // .git/
    { matches: ({ basename }: PathCandidate) => isPrivateKeyFile(basename), desc: "private key file" }, // *.pem, *.key
    { matches: ({ basename }: PathCandidate) => isSshPrivateKeyName(basename), desc: "SSH key" }, // id_rsa, id_ed25519
    { matches: ({ segments }: PathCandidate) => segments.includes(".ssh"), desc: ".ssh directory" }, // .ssh/
    { matches: ({ basename }: PathCandidate) => isSecretsFile(basename), desc: "secrets file" }, // secrets.json, secret.yaml
    { matches: ({ path }: PathCandidate) => isCredentialsPath(path), desc: "credentials file" }, // credentials/, credentials.yml.enc, application_default_credentials.json
  ];

  const softProtectedPaths = [
    { matches: ({ basename }: PathCandidate) => basename === "package-lock.json", desc: "package-lock.json" },
    { matches: ({ basename }: PathCandidate) => basename === "yarn.lock", desc: "yarn.lock" },
    { matches: ({ basename }: PathCandidate) => basename === "pnpm-lock.yaml", desc: "pnpm-lock.yaml" },
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

      for (const { pattern, matches, desc } of dangerousCommands) {
        if (pattern?.test(command) || matches?.(command)) {
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

      for (const { matches, desc } of protectedPaths) {
        if (pathCandidates.some((candidate) => matches(candidate))) {
          ctx.ui.notify(`🛡️ Blocked write to ${desc}: ${filePath}`, "warning");
          return { block: true, reason: `Protected path: ${desc}` };
        }
      }

      for (const { matches, desc } of softProtectedPaths) {
        if (pathCandidates.some((candidate) => matches(candidate))) {
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
