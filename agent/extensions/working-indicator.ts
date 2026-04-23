/**
 * Working Indicator Extension
 *
 * Customizes the inline working indicator shown while pi is streaming a
 * response. The chosen indicator is persisted globally across pi sessions in
 * `~/.pi/agent/working.json` under `workingIndicator.mode`. Unrelated keys in
 * that file (including settings written by other extensions) are preserved.
 *
 * Commands:
 *   /working-indicator           Show the active indicator for this session
 *   /working-indicator dot       Use a static dot indicator
 *   /working-indicator pulse     Use a custom animated indicator
 *   /working-indicator none      Hide the indicator entirely
 *   /working-indicator spinner   Restore an animated spinner
 *   /working-indicator reset     Restore pi's default spinner (persists "default")
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ExtensionAPI, ExtensionContext, WorkingIndicatorOptions } from "@mariozechner/pi-coding-agent";

export type WorkingIndicatorMode = "dot" | "none" | "pulse" | "spinner" | "default";

export const WORKING_INDICATOR_MODES: readonly WorkingIndicatorMode[] = [
  "dot",
  "none",
  "pulse",
  "spinner",
  "default",
];

const FOOTER_STATUS_KEY = "working-indicator";

export const DEFAULT_SETTINGS_PATH = path.join(os.homedir(), ".pi", "agent", "working.json");

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const PASTEL_RAINBOW = [
  "\x1b[38;2;255;179;186m",
  "\x1b[38;2;255;223;186m",
  "\x1b[38;2;255;255;186m",
  "\x1b[38;2;186;255;201m",
  "\x1b[38;2;186;225;255m",
  "\x1b[38;2;218;186;255m",
];
const RESET_FG = "\x1b[39m";
const HIDDEN_INDICATOR: WorkingIndicatorOptions = { frames: [] };

function colorize(text: string, color: string): string {
  return `${color}${text}${RESET_FG}`;
}

function getIndicator(mode: WorkingIndicatorMode): WorkingIndicatorOptions | undefined {
  switch (mode) {
    case "dot":
      return { frames: [colorize("●", PASTEL_RAINBOW[0]!)] };
    case "none":
      return HIDDEN_INDICATOR;
    case "pulse":
      return {
        frames: [
          colorize("·", PASTEL_RAINBOW[0]!),
          colorize("•", PASTEL_RAINBOW[2]!),
          colorize("●", PASTEL_RAINBOW[4]!),
          colorize("•", PASTEL_RAINBOW[5]!),
        ],
        intervalMs: 120,
      };
    case "spinner":
      return {
        frames: SPINNER_FRAMES.map((frame, index) =>
          colorize(frame, PASTEL_RAINBOW[index % PASTEL_RAINBOW.length]!),
        ),
        intervalMs: 80,
      };
    case "default":
      return undefined;
  }
}

function describeMode(mode: WorkingIndicatorMode): string {
  switch (mode) {
    case "dot":
      return "static dot";
    case "none":
      return "hidden";
    case "pulse":
      return "custom pulse";
    case "spinner":
      return "custom spinner";
    case "default":
      return "pi default spinner";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isWorkingIndicatorMode(value: unknown): value is WorkingIndicatorMode {
  return typeof value === "string" && (WORKING_INDICATOR_MODES as readonly string[]).includes(value);
}

export async function loadSavedMode(filePath: string): Promise<WorkingIndicatorMode | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (!isPlainObject(parsed)) return undefined;
  const wi = parsed.workingIndicator;
  if (!isPlainObject(wi)) return undefined;
  return isWorkingIndicatorMode(wi.mode) ? wi.mode : undefined;
}

export async function saveMode(filePath: string, mode: WorkingIndicatorMode): Promise<void> {
  let settings: Record<string, unknown> = {};

  let raw: string | undefined;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  if (raw !== undefined) {
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      throw new Error(`${filePath}: top-level JSON must be an object`);
    }
    settings = { ...parsed };
  }

  const current = settings.workingIndicator;
  const wi: Record<string, unknown> = isPlainObject(current) ? { ...current } : {};
  wi.mode = mode;
  settings.workingIndicator = wi;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

export function createExtension(settingsPath: string = DEFAULT_SETTINGS_PATH) {
  return function (pi: ExtensionAPI): void {
    let mode: WorkingIndicatorMode = "default";

    const applyIndicator = (ctx: ExtensionContext) => {
      ctx.ui.setWorkingIndicator(getIndicator(mode));
    };

    pi.on("session_start", async (_event, ctx) => {
      ctx.ui.setStatus(FOOTER_STATUS_KEY, undefined);
      const saved = await loadSavedMode(settingsPath);
      mode = saved ?? "default";
      applyIndicator(ctx);
    });

    pi.registerCommand("working-indicator", {
      description:
        "Set the streaming working indicator: dot, pulse, none, spinner, or reset. Persists globally.",
      handler: async (args, ctx) => {
        const nextMode = args.trim().toLowerCase();
        if (!nextMode) {
          ctx.ui.notify(`Working indicator: ${describeMode(mode)}`, "info");
          return;
        }

        if (
          nextMode !== "dot" &&
          nextMode !== "none" &&
          nextMode !== "pulse" &&
          nextMode !== "spinner" &&
          nextMode !== "reset"
        ) {
          ctx.ui.notify("Usage: /working-indicator [dot|pulse|none|spinner|reset]", "error");
          return;
        }

        mode = nextMode === "reset" ? "default" : nextMode;
        applyIndicator(ctx);
        ctx.ui.notify(`Working indicator set to: ${describeMode(mode)}`, "info");
      },
    });
  };
}

export default createExtension();
