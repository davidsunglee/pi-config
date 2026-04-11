/**
 * Judgment bridge for the execute-plan extension.
 *
 * Provides three exports:
 *
 * - `registerJudgmentTool`: Registers the `execute_plan_judgment` tool ONCE
 *   globally. The tool's handler uses a `getResolver` callback to find the
 *   current pending resolver, enabling clean separation between tool
 *   registration (done once at startup) and per-request Promise lifecycle.
 *
 * - `sendJudgmentRequest`: Sends a user message via `pi.sendUserMessage()`
 *   describing the judgment request, varying content by request type.
 *
 * - `createJudgmentBridge`: Creates and manages the Promise lifecycle for
 *   `requestJudgment`. Does NOT register tools — that is the caller's
 *   responsibility.
 */

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  JudgmentAction,
  JudgmentRequest,
  JudgmentResponse,
} from "../../lib/execute-plan/types.ts";

// ── registerJudgmentTool ──────────────────────────────────────────────

const JUDGMENT_ACTIONS: [JudgmentAction, ...JudgmentAction[]] = [
  "retry",
  "skip",
  "stop",
  "provide_context",
  "accept",
  "escalate",
];

/**
 * Register the `execute_plan_judgment` tool ONCE globally.
 *
 * When called by the agent:
 * 1. Constructs JudgmentResponse from params
 * 2. Calls getResolver() for current pending resolver
 * 3. If resolver exists, calls it with response and returns success
 * 4. If no resolver, returns error message to agent
 */
export function registerJudgmentTool(
  pi: ExtensionAPI,
  getResolver: () => ((response: JudgmentResponse) => void) | null,
): void {
  pi.registerTool({
    name: "execute_plan_judgment",
    label: "Execute Plan Judgment",
    description:
      "Provide a judgment decision for the execute-plan engine. Call this tool to respond to a pending judgment request with an action and optional context.",
    parameters: Type.Object({
      action: Type.Union(
        JUDGMENT_ACTIONS.map((a) => Type.Literal(a)) as [
          ReturnType<typeof Type.Literal>,
          ...ReturnType<typeof Type.Literal>[],
        ],
        {
          description:
            "The judgment action to take: retry, skip, stop, provide_context, accept, or escalate.",
        },
      ),
      context: Type.Optional(
        Type.String({
          description:
            "Optional context to pass back to the engine. For 'retry' or 'provide_context', this is appended to the task prompt.",
        }),
      ),
      model: Type.Optional(
        Type.String({
          description:
            "Optional model override for 'retry' or 'provide_context' actions.",
        }),
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      const response: JudgmentResponse = {
        action: params.action as JudgmentAction,
        ...(params.context !== undefined && { context: params.context as string }),
        ...(params.model !== undefined && { model: params.model as string }),
      };

      const resolver = getResolver();
      if (resolver === null) {
        return {
          content: [{ type: "text" as const, text: "No pending judgment request. The execute_plan_judgment tool should only be called in response to a judgment request from the execute-plan engine." }],
          details: { error: true },
        };
      }

      resolver(response);

      return {
        content: [{ type: "text" as const, text: `Judgment recorded: ${response.action}` }],
        details: { action: response.action },
      };
    },
  });
}

// ── sendJudgmentRequest ───────────────────────────────────────────────

/**
 * Send a user message to the agent describing a judgment request.
 * Content varies by judgment type to give the agent appropriate context.
 */
export function sendJudgmentRequest(
  pi: ExtensionAPI,
  request: JudgmentRequest,
): void {
  const content = buildJudgmentMessage(request);
  pi.sendUserMessage(content);
}

function buildJudgmentMessage(request: JudgmentRequest): string {
  switch (request.type) {
    case "blocked": {
      return [
        `## Execute Plan: Task BLOCKED`,
        ``,
        `Task **#${request.taskNumber}** (wave ${request.wave}) is blocked and needs your judgment.`,
        ``,
        `**Blocker:** ${request.blocker}`,
        ``,
        `**Details:** ${request.details}`,
        ``,
        `Please use the \`execute_plan_judgment\` tool to respond with one of:`,
        `- \`retry\` — retry the task (optionally with context/model override)`,
        `- \`provide_context\` — retry with additional context`,
        `- \`skip\` — skip this task`,
        `- \`stop\` — halt execution`,
        `- \`escalate\` — escalate to user`,
      ].join("\n");
    }

    case "done_with_concerns": {
      return [
        `## Execute Plan: Task DONE WITH CONCERNS`,
        ``,
        `Task **#${request.taskNumber}** (wave ${request.wave}) completed with concerns.`,
        ``,
        `**Concerns:** ${request.concerns}`,
        ``,
        `**Details:** ${request.details}`,
        ``,
        `Please use the \`execute_plan_judgment\` tool to respond with one of:`,
        `- \`accept\` — accept and proceed despite concerns`,
        `- \`retry\` — retry the task`,
        `- \`stop\` — halt execution`,
        `- \`escalate\` — escalate to user`,
      ].join("\n");
    }

    case "needs_context": {
      return [
        `## Execute Plan: Task NEEDS CONTEXT`,
        ``,
        `Task **#${request.taskNumber}** (wave ${request.wave}) needs additional context.`,
        ``,
        `**Needs:** ${request.needs}`,
        ``,
        `**Details:** ${request.details}`,
        ``,
        `Please use the \`execute_plan_judgment\` tool to respond with one of:`,
        `- \`provide_context\` — provide context (include in \`context\` field)`,
        `- \`retry\` — retry without additional context`,
        `- \`skip\` — skip this task`,
        `- \`stop\` — halt execution`,
        `- \`escalate\` — escalate to user`,
      ].join("\n");
    }

    case "spec_review_failed": {
      return [
        `## Execute Plan: Task SPEC REVIEW FAILED`,
        ``,
        `Task **#${request.taskNumber}** (wave ${request.wave}) failed spec review.`,
        ``,
        `**Details:** ${request.details}`,
        ``,
        `Please use the \`execute_plan_judgment\` tool to respond with one of:`,
        `- \`retry\` — retry the task`,
        `- \`skip\` — skip this task`,
        `- \`stop\` — halt execution`,
        `- \`escalate\` — escalate to user`,
      ].join("\n");
    }

    case "retry_exhausted": {
      return [
        `## Execute Plan: Task RETRY EXHAUSTED`,
        ``,
        `Task **#${request.taskNumber}** (wave ${request.wave}) has exhausted all retry attempts.`,
        ``,
        `**Attempts:** ${request.attempts}`,
        ``,
        `**Last failure:** ${request.lastFailure}`,
        ``,
        `**Details:** ${request.details}`,
        ``,
        `Please use the \`execute_plan_judgment\` tool to respond with one of:`,
        `- \`skip\` — skip this task`,
        `- \`stop\` — halt execution`,
        `- \`escalate\` — escalate to user`,
      ].join("\n");
    }

    case "code_review": {
      const findings = request.review.findings;
      const criticalCount = findings.filter((f) => f.severity === "critical").length;
      const importantCount = findings.filter((f) => f.severity === "important").length;
      const minorCount = findings.filter((f) => f.severity === "minor").length;

      const findingLines = findings.slice(0, 5).map((f) => {
        const fileInfo = f.file ? ` (${f.file})` : "";
        return `- **[${f.severity.toUpperCase()}]** ${f.title}${fileInfo}: ${f.details}`;
      });

      if (findings.length > 5) {
        findingLines.push(`- ... and ${findings.length - 5} more`);
      }

      return [
        `## Execute Plan: CODE REVIEW`,
        ``,
        `Wave ${request.wave} code review completed.`,
        ``,
        `**Overall assessment:** ${request.review.overallAssessment}`,
        ``,
        `**Findings:** ${criticalCount} critical, ${importantCount} important, ${minorCount} minor`,
        ``,
        ...findingLines,
        ``,
        `**Details:** ${request.details}`,
        ``,
        `Please use the \`execute_plan_judgment\` tool to respond with one of:`,
        `- \`accept\` — accept the code review and proceed`,
        `- \`retry\` — request changes and retry`,
        `- \`stop\` — halt execution`,
        `- \`escalate\` — escalate to user`,
      ].join("\n");
    }
  }
}

// ── createJudgmentBridge ──────────────────────────────────────────────

export interface JudgmentBridgeOptions {
  /** Timeout in milliseconds for pending judgment requests. Defaults to 5 minutes. */
  timeoutMs?: number;
}

/**
 * Create a judgment bridge that manages Promise lifecycle.
 *
 * The bridge does NOT register any tools — use `registerJudgmentTool` separately.
 * This separation allows the tool to be registered once globally while the
 * bridge manages per-request Promise state.
 */
export function createJudgmentBridge(
  pi: ExtensionAPI,
  options?: JudgmentBridgeOptions,
): {
  requestJudgment: (request: JudgmentRequest) => Promise<JudgmentResponse>;
  setResolver: (resolver: ((response: JudgmentResponse) => void) | null) => void;
  getResolver: () => ((response: JudgmentResponse) => void) | null;
} {
  const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000; // Default: 5 minutes

  let currentResolver: ((response: JudgmentResponse) => void) | null = null;
  let currentRejecter: ((error: Error) => void) | null = null;

  const setResolver = (resolver: ((response: JudgmentResponse) => void) | null) => {
    currentResolver = resolver;
  };

  const getResolver = () => currentResolver;

  // Bridge-level timeout handle — cleared whenever a new request starts or resolves.
  let currentTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const clearPendingTimeout = () => {
    if (currentTimeoutHandle !== null) {
      clearTimeout(currentTimeoutHandle);
      currentTimeoutHandle = null;
    }
  };

  const requestJudgment = (request: JudgmentRequest): Promise<JudgmentResponse> => {
    // If there's already a pending request, reject it and clear its timeout.
    if (currentRejecter !== null) {
      const prevRejecter = currentRejecter;
      clearPendingTimeout();
      currentResolver = null;
      currentRejecter = null;
      prevRejecter(new Error("Another judgment request was made before this one was resolved."));
    }

    return new Promise<JudgmentResponse>((resolve, reject) => {
      const cleanup = () => {
        clearPendingTimeout();
        currentResolver = null;
        currentRejecter = null;
      };

      currentResolver = (response: JudgmentResponse) => {
        cleanup();
        resolve(response);
      };

      currentRejecter = (error: Error) => {
        cleanup();
        reject(error);
      };

      currentTimeoutHandle = setTimeout(() => {
        const rejecter = currentRejecter;
        cleanup();
        rejecter?.(new Error(`Judgment request timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      // Send the request message to the agent
      sendJudgmentRequest(pi, request);
    });
  };

  return { requestJudgment, setResolver, getResolver };
}
