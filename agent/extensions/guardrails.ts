import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { realpath } from "node:fs/promises";
import * as path from "node:path";

/**
 * Pragmatic guardrails for common unsafe or dubious operations.
 *
 * Philosophy:
 * - This is not a full security system and does not try to parse shell syntax completely.
 * - It is meant to catch high-signal mistakes and add friction around risky actions.
 * - For stronger isolation or adversarial scenarios, rely on sandboxing rather than this file.
 * - Clarity and maintainability matter more than exhaustive coverage.
 *
 * Concrete policy:
 * - Dangerous bash commands are confirmed (or blocked in headless mode).
 * - Writes to clearly sensitive or tool-managed targets are hard-blocked.
 * - Important generated artifacts like lockfiles are soft-protected via confirmation.
 * - Bash write detection is heuristic and intentionally limited to common forms:
 *   redirection, tee, cp, mv, and dd output targets.
 */

type PathInfo = {
  path: string;
  basename: string;
  segments: string[];
};

const HARD_PROTECTED_SEGMENTS = [
  [".git", "git directory"],
  [".ssh", ".ssh directory"],
  ["node_modules", "node_modules"],
  [".venv", "Python virtual environment"],
  ["venv", "Python virtual environment"],
] as const;

const PYTHON_TOOL_AND_CACHE_SEGMENTS = [
  ["__pycache__", "Python bytecode cache"],
  [".pytest_cache", "pytest cache"],
  [".mypy_cache", "mypy cache"],
  [".ruff_cache", "ruff cache"],
  [".tox", "tox environment"],
  [".nox", "nox environment"],
  [".pytype", "pytype cache"],
  [".hypothesis", "hypothesis cache"],
] as const;

const SOFT_PROTECTED_BASENAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "poetry.lock",
  "Pipfile.lock",
  "uv.lock",
  "Cargo.lock",
  "go.sum",
  "go.work.sum",
  "gradle.lockfile",
  "gradle-wrapper.properties",
]);

const dangerousCommands = [
  { pattern: /\brm\s+(-[^\s]*r|--recursive)/i, desc: "recursive delete" },
  { pattern: /\bfind\b.*(?:\s-delete\b|\s-exec\s+rm\b)/i, desc: "recursive delete (find)" },
  { pattern: /\bsudo\b/i, desc: "sudo command" },
  { pattern: /\bmkfs\b/i, desc: "filesystem format" },
  { pattern: /\bkill\s+-9\s+-1\b/i, desc: "kill all processes" },
  { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/, desc: "fork bomb" },
  { pattern: /\bchmod\b(?:\s+-[^\s]+)*\s+[0-7]*777\b/i, desc: "dangerous permissions" },
];

function bashWriteProtectedPath(info: PathInfo) {
  return hardProtectedPath(info);
}

function hardProtectedPath(info: PathInfo) {
  const basename = info.basename;
  const segments = info.segments;

  if (isEnvFile(basename)) return "environment file";
  if (isDevVarsFile(basename)) return "dev vars file";

  for (const [segment, description] of HARD_PROTECTED_SEGMENTS) {
    if (segments.includes(segment)) {
      return description;
    }
  }

  // Generated Python tool/cache directories are hard-blocked because direct edits are
  // almost always dubious and usually indicate the wrong target was chosen.
  for (const [segment, description] of PYTHON_TOOL_AND_CACHE_SEGMENTS) {
    if (segments.includes(segment)) {
      return description;
    }
  }

  if (isPrivateKeyFile(basename)) return "private key file";
  if (isSshKeyName(basename)) return "SSH key";
  if (isSecretsFile(basename)) return "secrets file";
  if (basename === ".pypirc") return "Python package credentials";
  if (segments.includes(".cargo") && ["credentials", "credentials.toml"].includes(basename)) {
    return "Cargo credentials";
  }
  if (isCredentialsPath(info)) return "credentials file";

  return undefined;
}

function softProtectedPath(info: PathInfo) {
  return SOFT_PROTECTED_BASENAMES.has(info.basename) ? info.basename : undefined;
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash") {
      const command = event.input.command as string;

      for (const { pattern, desc } of dangerousCommands) {
        if (!pattern.test(command)) {
          continue;
        }

        const result = await confirmDangerousCommand(ctx, desc, command);
        if (result) {
          return result;
        }
        break;
      }

      for (const target of extractSimpleBashWriteTargets(command)) {
        const candidates = await getPathCandidates(target, ctx.cwd);
        let rawDeviceConfirmed = false;

        for (const candidate of candidates) {
          if (isRawDevicePath(candidate)) {
            const result = await confirmDangerousCommand(ctx, "raw device overwrite", command);
            if (result) {
              return result;
            }

            rawDeviceConfirmed = true;
            break;
          }

          const protectedDesc = bashWriteProtectedPath(candidate);
          if (!protectedDesc) {
            continue;
          }

          notifyIfUI(ctx, `🛡️ Blocked bash write to ${protectedDesc}: ${target}`, "warning");
          return { block: true, reason: `Bash command writes to protected path: ${protectedDesc}` };
        }

        if (rawDeviceConfirmed) {
          continue;
        }
      }

      return undefined;
    }

    if (event.toolName === "write" || event.toolName === "edit") {
      const filePath = event.input.path as string;
      const candidates = await getPathCandidates(filePath, ctx.cwd);

      for (const candidate of candidates) {
        const protectedDesc = hardProtectedPath(candidate);
        if (!protectedDesc) {
          continue;
        }

        notifyIfUI(ctx, `🛡️ Blocked write to ${protectedDesc}: ${filePath}`, "warning");
        return { block: true, reason: `Protected path: ${protectedDesc}` };
      }

      for (const candidate of candidates) {
        const softDesc = softProtectedPath(candidate);
        if (!softDesc) {
          continue;
        }

        if (!ctx.hasUI) {
          return { block: true, reason: `Protected path (no UI): ${softDesc}` };
        }

        const ok = await ctx.ui.confirm(
          `⚠️ Modifying ${softDesc}`,
          `Are you sure you want to modify ${filePath}?`,
        );

        if (!ok) {
          return { block: true, reason: `User blocked write to ${softDesc}` };
        }
        break;
      }

      return undefined;
    }

    return undefined;
  });
}

async function getPathCandidates(filePath: string, cwd: string): Promise<PathInfo[]> {
  const candidates = new Map<string, PathInfo>();
  const addCandidate = (candidatePath: string) => {
    const info = toPathInfo(candidatePath);
    candidates.set(info.path, info);
  };

  addCandidate(filePath);

  const absolutePath = path.resolve(cwd, filePath);
  addCandidate(absolutePath);

  const resolvedPath = await resolveNearestExistingPath(absolutePath);
  if (resolvedPath) {
    addCandidate(resolvedPath);
  }

  return [...candidates.values()];
}

async function resolveNearestExistingPath(absolutePath: string) {
  const suffix: string[] = [];
  let current = absolutePath;

  while (true) {
    try {
      const resolved = await realpath(current);
      return path.join(resolved, ...suffix);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return undefined;
      }

      suffix.unshift(path.basename(current));
      current = parent;
    }
  }
}

async function confirmDangerousCommand(
  ctx: { hasUI?: boolean; ui?: { confirm?: (title: string, body: string) => Promise<boolean> } },
  desc: string,
  command: string,
) {
  if (!ctx.hasUI || !ctx.ui?.confirm) {
    return { block: true, reason: `Blocked ${desc} (no UI to confirm)` };
  }

  const ok = await ctx.ui.confirm(`⚠️ Dangerous command: ${desc}`, command);
  return ok ? undefined : { block: true, reason: `Blocked ${desc} by user` };
}

function notifyIfUI(ctx: { hasUI?: boolean; ui?: { notify?: (message: string, level: string) => void } }, message: string, level: string) {
  if (!ctx.hasUI || !ctx.ui?.notify) {
    return;
  }

  ctx.ui.notify(message, level);
}

function extractSimpleBashWriteTargets(command: string) {
  const targets = new Set<string>();

  // Heuristic parsing for common write forms only. This intentionally does not try to
  // understand full shell grammar; deeper isolation should come from sandboxing.
  // Supported common forms: redirection, tee, cp, mv, and dd output targets.
  for (const match of command.matchAll(/(?:^|[;&|]\s*|\s)>>?\s*(["']?[^\s"';&|)]+["']?)/g)) {
    const rawTarget = match[1]?.trim();
    if (!rawTarget) continue;
    targets.add(stripTrailingControlPunctuation(rawTarget.replace(/^['"]|['"]$/g, "")));
  }

  const commandChunks = command
    .split(/\r?\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const chunk of commandChunks) {
    const tokens = tokenizeShellish(chunk);
    for (let i = 0; i < tokens.length; i++) {
      const token = stripTrailingControlPunctuation(tokens[i]);

      if (token === "tee") {
        const teeTargets: string[] = [];
        let j = i + 1;
        while (j < tokens.length && !isControlToken(tokens[j])) {
          const rawToken = tokens[j];
          const cleaned = stripTrailingControlPunctuation(rawToken);
          if (cleaned && !cleaned.startsWith("-")) {
            teeTargets.push(cleaned);
          }
          j++;
          if (hasTrailingControlPunctuation(rawToken)) {
            break;
          }
        }
        for (const target of teeTargets) {
          targets.add(target);
        }
        i = j - 1;
        continue;
      }

      if (token === "cp" || token === "mv") {
        const args: string[] = [];
        let j = i + 1;
        while (j < tokens.length && !isControlToken(tokens[j])) {
          const rawToken = tokens[j];
          const cleaned = stripTrailingControlPunctuation(rawToken);
          if (cleaned && !cleaned.startsWith("-")) {
            args.push(cleaned);
          }
          j++;
          if (hasTrailingControlPunctuation(rawToken)) {
            break;
          }
        }
        if (args.length >= 2) {
          const destination = args.at(-1);
          if (destination) {
            targets.add(destination);
          }
        }
        i = j - 1;
        continue;
      }

      if (token === "dd") {
        let j = i + 1;
        while (j < tokens.length && !isControlToken(tokens[j])) {
          const rawToken = tokens[j];
          const cleaned = stripTrailingControlPunctuation(rawToken);

          if (cleaned.startsWith("of=")) {
            const destination = cleaned.slice(3);
            if (destination) {
              targets.add(destination);
            }
          } else if (cleaned === "of") {
            const nextToken = tokens[j + 1];
            if (nextToken && !isControlToken(nextToken)) {
              const destination = stripTrailingControlPunctuation(nextToken);
              if (destination) {
                targets.add(destination);
              }
              j++;
            }
          }

          j++;
          if (hasTrailingControlPunctuation(rawToken)) {
            break;
          }
        }
        i = j - 1;
      }
    }
  }

  return [...targets];
}

function toPathInfo(filePath: string): PathInfo {
  const normalizedPath = normalize(filePath);
  const segments = normalizedPath.split("/").filter(Boolean);

  return {
    path: normalizedPath,
    basename: segments.at(-1) ?? normalizedPath,
    segments,
  };
}

function normalize(filePath: string) {
  return path.normalize(filePath).replace(/\\/g, "/");
}

function isRawDevicePath(info: PathInfo) {
  if (!info.path.startsWith("/dev/")) {
    return false;
  }

  const name = info.basename;
  return (
    /^sd[a-z]\d*$/i.test(name) ||
    /^vd[a-z]\d*$/i.test(name) ||
    /^xvd[a-z]\d*$/i.test(name) ||
    /^nvme\d+n\d+(?:p\d+)?$/i.test(name) ||
    /^r?disk\d+(?:s\d+)?$/i.test(name) ||
    /^mmcblk\d+(?:p\d+)?$/i.test(name)
  );
}

function isEnvFile(name: string) {
  return name === ".env" || (name.startsWith(".env.") && !name.startsWith(".env.example"));
}

function isDevVarsFile(name: string) {
  return name === ".dev.vars" || name.startsWith(".dev.vars.");
}

function isPrivateKeyFile(name: string) {
  return name.endsWith(".pem") || name.endsWith(".key");
}

function isSshKeyName(name: string) {
  if (name.endsWith(".pub") || name.endsWith("-cert.pub")) {
    return false;
  }

  return /^id_(rsa|ecdsa|ed25519)(?:[._-].+)?$/i.test(name);
}

function isSecretsFile(name: string) {
  return /^secrets?\.(json|ya?ml|toml)$/i.test(name);
}

function isCredentialsPath(info: PathInfo) {
  const basename = info.basename.toLowerCase();

  if (basename === "credentials" || basename === "application_default_credentials.json") {
    return true;
  }

  const parts = basename.split(".");
  const stem = parts.shift() ?? "";
  const extensions = parts;

  if (!/(^|[-_])credentials$/.test(stem)) {
    return false;
  }

  const allowedExtensions = new Set(["json", "yaml", "yml", "toml", "txt", "cfg", "ini", "env", "enc"]);
  return extensions.length > 0 && extensions.every((extension) => allowedExtensions.has(extension));
}

function isControlToken(token: string) {
  return ["|", "||", "&&", ";"].includes(stripTrailingControlPunctuation(token));
}

function tokenizeShellish(command: string) {
  const matches = command.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+/g) ?? [];
  return matches.map((token) => token.replace(/^['"]|['"]$/g, ""));
}

function stripTrailingControlPunctuation(token: string) {
  return token.replace(/(?:;|\|\||&&|\||\))+$/, "");
}

function hasTrailingControlPunctuation(token: string) {
  return stripTrailingControlPunctuation(token) !== token;
}

