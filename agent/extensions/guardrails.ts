import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { realpath } from "node:fs/promises";
import * as path from "node:path";

type PathInfo = {
  path: string;
  basename: string;
  segments: string[];
};

const dangerousCommands = [
  { pattern: /\brm\s+(-[^\s]*r|--recursive)/i, desc: "recursive delete" },
  { pattern: /\bfind\b.*(?:\s-delete\b|\s-exec\s+rm\b)/i, desc: "recursive delete (find)" },
  { pattern: /\bsudo\b/i, desc: "sudo command" },
  { pattern: /\bmkfs\b/i, desc: "filesystem format" },
  { pattern: /\bdd\b.*\bof=\/dev\//i, desc: "raw device write" },
  { pattern: /\bchmod\b(?:\s+-[^\s]+)*\s+[0-7]*777\b/i, desc: "dangerous permissions" },
];

function bashWriteProtectedPath(info: PathInfo) {
  const basename = info.basename;

  if (isEnvFile(basename)) return "environment file";
  if (isDevVarsFile(basename)) return "dev vars file";
  if (isPrivateKeyFile(basename)) return "private key file";
  if (isSshKeyName(basename)) return "SSH key";
  if (info.segments.includes(".ssh")) return ".ssh directory";

  return undefined;
}

function hardProtectedPath(info: PathInfo) {
  const basename = info.basename;
  const segments = info.segments;

  if (isEnvFile(basename)) return "environment file";
  if (isDevVarsFile(basename)) return "dev vars file";
  if (segments.includes(".git")) return "git directory";
  if (segments.includes(".ssh")) return ".ssh directory";
  if (segments.includes("node_modules")) return "node_modules";
  if (segments.includes(".venv") || segments.includes("venv")) return "Python virtual environment";
  if (segments.includes("__pycache__")) return "Python bytecode cache";
  if (segments.includes(".pytest_cache")) return "pytest cache";
  if (segments.includes(".mypy_cache")) return "mypy cache";
  if (segments.includes(".ruff_cache")) return "ruff cache";
  if (segments.includes(".tox")) return "tox environment";
  if (segments.includes(".nox")) return "nox environment";
  if (segments.includes(".pytype")) return "pytype cache";
  if (segments.includes(".hypothesis")) return "hypothesis cache";
  if (segments.includes(".gradle")) return "Gradle cache";
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
  switch (info.basename) {
    case "package-lock.json":
    case "yarn.lock":
    case "pnpm-lock.yaml":
    case "poetry.lock":
    case "Pipfile.lock":
    case "uv.lock":
    case "Cargo.lock":
    case "go.sum":
    case "go.work.sum":
    case "gradle.lockfile":
    case "gradle-wrapper.properties":
    case "gradle-wrapper.jar":
      return info.basename;
    default:
      return undefined;
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash") {
      const command = event.input.command as string;

      for (const { pattern, desc } of dangerousCommands) {
        if (!pattern.test(command)) {
          continue;
        }

        if (!ctx.hasUI) {
          return { block: true, reason: `Blocked ${desc} (no UI to confirm)` };
        }

        const ok = await ctx.ui.confirm(`⚠️ Dangerous command: ${desc}`, command);
        if (!ok) {
          return { block: true, reason: `Blocked ${desc} by user` };
        }
        break;
      }

      for (const target of extractSimpleBashWriteTargets(command)) {
        const candidates = await getPathCandidates(target, ctx.cwd);
        for (const candidate of candidates) {
          const protectedDesc = bashWriteProtectedPath(candidate);
          if (!protectedDesc) {
            continue;
          }

          ctx.ui.notify(`🛡️ Blocked bash write to ${protectedDesc}: ${target}`, "warning");
          return { block: true, reason: `Bash command writes to protected path: ${protectedDesc}` };
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

        ctx.ui.notify(`🛡️ Blocked write to ${protectedDesc}: ${filePath}`, "warning");
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

function extractSimpleBashWriteTargets(command: string) {
  const targets = new Set<string>();

  for (const match of command.matchAll(/(?:^|[;&|]\s*|\s)>>?\s*(["']?[^\s"';&|)]+["']?)/g)) {
    const rawTarget = match[1]?.trim();
    if (!rawTarget) continue;
    targets.add(rawTarget.replace(/^['"]|['"]$/g, ""));
  }

  const tokens = tokenizeShellish(command);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === "tee") {
      const teeTargets: string[] = [];
      let j = i + 1;
      while (j < tokens.length && !isControlToken(tokens[j])) {
        if (!tokens[j].startsWith("-")) {
          teeTargets.push(tokens[j]);
        }
        j++;
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
        if (!tokens[j].startsWith("-")) {
          args.push(tokens[j]);
        }
        j++;
      }
      if (args.length >= 2) {
        const destination = args.at(-1);
        if (destination) {
          targets.add(destination);
        }
      }
      i = j - 1;
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

  if (stem !== "credentials") {
    return false;
  }

  const allowedExtensions = new Set(["json", "yaml", "yml", "toml", "txt", "cfg", "ini", "env", "enc"]);
  return extensions.length > 0 && extensions.every((extension) => allowedExtensions.has(extension));
}

function tokenizeShellish(command: string) {
  const matches = command.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+/g) ?? [];
  return matches.map((token) => token.replace(/^['"]|['"]$/g, ""));
}

function isControlToken(token: string) {
  return ["|", "||", "&&", ";"].includes(token);
}
