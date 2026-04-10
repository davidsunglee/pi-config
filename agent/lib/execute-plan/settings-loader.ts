import { join } from "node:path";
import type { ExecutionIO, ModelTiers } from "./types.ts";

type LoadModelTiersResult =
  | { ok: true; tiers: ModelTiers }
  | { ok: false; error: string };

/**
 * Reads <agentDir>/settings.json via ExecutionIO and extracts modelTiers.
 * Returns an error result (never throws) for all failure modes.
 */
export async function loadModelTiers(
  io: ExecutionIO,
  agentDir: string,
): Promise<LoadModelTiersResult> {
  const settingsPath = join(agentDir, "settings.json");

  let raw: string;
  try {
    raw = await io.readFile(settingsPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Failed to read settings.json: ${message}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Failed to parse settings.json as JSON: ${message}`,
    };
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("modelTiers" in parsed)
  ) {
    return {
      ok: false,
      error: "settings.json is missing required key: modelTiers",
    };
  }

  const tiers = (parsed as Record<string, unknown>)["modelTiers"];

  if (typeof tiers !== "object" || tiers === null) {
    return {
      ok: false,
      error: "settings.json: modelTiers must be an object",
    };
  }

  const tiersObj = tiers as Record<string, unknown>;

  if (typeof tiersObj["capable"] !== "string") {
    return {
      ok: false,
      error: "settings.json: modelTiers.capable is required and must be a string",
    };
  }

  if (typeof tiersObj["standard"] !== "string") {
    return {
      ok: false,
      error: "settings.json: modelTiers.standard is required and must be a string",
    };
  }

  if (typeof tiersObj["cheap"] !== "string") {
    return {
      ok: false,
      error: "settings.json: modelTiers.cheap is required and must be a string",
    };
  }

  const result: ModelTiers = {
    capable: tiersObj["capable"],
    standard: tiersObj["standard"],
    cheap: tiersObj["cheap"],
  };

  // crossProvider is optional
  if ("crossProvider" in tiersObj && tiersObj["crossProvider"] !== undefined) {
    const cp = tiersObj["crossProvider"];
    if (
      typeof cp === "object" &&
      cp !== null &&
      typeof (cp as Record<string, unknown>)["capable"] === "string" &&
      typeof (cp as Record<string, unknown>)["standard"] === "string"
    ) {
      result.crossProvider = {
        capable: (cp as Record<string, unknown>)["capable"] as string,
        standard: (cp as Record<string, unknown>)["standard"] as string,
      };
    }
  }

  return { ok: true, tiers: result };
}
