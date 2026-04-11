/**
 * TUI components for the execute-plan extension.
 *
 * Each component is a class that extends Container (from @mariozechner/pi-tui)
 * and follows the pattern used by todos.ts:
 *
 *   await ctx.ui.custom<Result>((tui, theme, keybindings, done) => new MyComponent(tui, theme, keybindings, done))
 *
 * All components call `done(result)` when the user makes a selection.
 */

import {
  Container,
  Input,
  Markdown,
  SelectList,
  Spacer,
  Text,
  type SelectItem,
  type TUI,
} from "@mariozechner/pi-tui";

import {
  DynamicBorder,
  getMarkdownTheme,
  getSelectListTheme,
  type Theme,
  type KeybindingsManager,
} from "@mariozechner/pi-coding-agent";

import type {
  ExecutionSettings,
  RunState,
  CodeReviewSummary,
  FailureContext,
  Plan,
  WorkspaceChoice,
} from "../../lib/execute-plan/types.ts";

import {
  formatSettingsGrid,
  formatResumeStatus,
  formatCodeReviewSummary,
  formatFailureContext,
  formatWaveProgress,
} from "./tui-formatters.ts";

import { computeWaves } from "../../lib/execute-plan/wave-computation.ts";

// ── Helpers ───────────────────────────────────────────────────────────

function makeSelectListTheme(theme: Theme) {
  return {
    selectedPrefix: (text: string) => theme.fg("accent", text),
    selectedText: (text: string) => theme.fg("accent", text),
    description: (text: string) => theme.fg("muted", text),
    scrollInfo: (text: string) => theme.fg("dim", text),
    noMatch: (text: string) => theme.fg("warning", text),
  };
}

// ── SettingsConfirmationComponent ─────────────────────────────────────

type SettingsConfirmMode = "confirm" | "customize";

/**
 * Displays plan info + settings grid.
 * Enter → accept settings, 'c' → enter customize mode, Esc → cancel.
 * In customize mode: each setting is a SelectList choice.
 * When user enables integrationTest and testCommand is null, an Input
 * is shown to enter the test command.
 */
export class SettingsConfirmationComponent extends Container {
  private mode: SettingsConfirmMode = "confirm";
  private settings: ExecutionSettings;
  private customizeIndex = 0;
  private customizeKeys: (keyof ExecutionSettings)[] = [
    "execution",
    "tdd",
    "finalReview",
    "specCheck",
    "integrationTest",
  ];
  private activeSelectList: SelectList | null = null;
  private activeInput: Input | null = null;
  private awaitingInput = false;
  private tui: TUI;
  private theme: Theme;
  private done: (result: ExecutionSettings | null) => void;

  constructor(
    tui: TUI,
    theme: Theme,
    _keybindings: KeybindingsManager,
    plan: Plan,
    initialSettings: ExecutionSettings,
    done: (result: ExecutionSettings | null) => void,
  ) {
    super();
    this.tui = tui;
    this.theme = theme;
    this.settings = { ...initialSettings };
    this.done = done;

    this.buildConfirmView(plan);
  }

  private buildConfirmView(plan: Plan): void {
    this.clear();
    const theme = this.theme;

    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
    this.addChild(new Spacer(1));

    this.addChild(
      new Text(theme.fg("accent", theme.bold(`Plan: ${plan.fileName}`)), 1, 0),
    );
    this.addChild(new Text(theme.fg("text", plan.header.goal), 1, 0));
    const waveCount = computeWaves(plan.tasks, plan.dependencies).length;
    this.addChild(new Text(theme.fg("muted", `${plan.tasks.length} tasks, ${waveCount} waves`), 1, 0));
    this.addChild(new Spacer(1));

    this.addChild(new Text(theme.fg("accent", theme.bold("Settings:")), 1, 0));
    const rows = formatSettingsGrid(this.settings);
    for (const row of rows) {
      this.addChild(
        new Text(
          `  ${theme.fg("muted", row.label + ":")} ${theme.fg("text", row.value)}`,
          0,
          0,
        ),
      );
    }

    this.addChild(new Spacer(1));
    this.addChild(
      new Text(
        theme.fg("dim", "Enter to accept  •  c to customize  •  Esc to cancel"),
        1,
        0,
      ),
    );
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
  }

  private buildCustomizeView(): void {
    this.clear();
    const theme = this.theme;
    const key = this.customizeKeys[this.customizeIndex];
    if (!key) {
      // Done customizing — return settings
      this.done(this.settings);
      return;
    }

    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
    this.addChild(new Spacer(1));
    this.addChild(
      new Text(theme.fg("accent", theme.bold(`Customize: ${key}`)), 1, 0),
    );
    this.addChild(new Spacer(1));

    let options: SelectItem[];
    if (key === "execution") {
      options = [
        { value: "parallel", label: "parallel", description: "Run tasks in parallel waves" },
        { value: "sequential", label: "sequential", description: "Run tasks one at a time" },
      ];
    } else {
      options = [
        { value: "on", label: "on", description: "Enabled" },
        { value: "off", label: "off", description: "Disabled" },
      ];
    }

    const selectList = new SelectList(options, options.length, makeSelectListTheme(theme));
    this.activeSelectList = selectList;

    selectList.onSelect = (item) => {
      if (key === "execution") {
        this.settings.execution = item.value as "parallel" | "sequential";
      } else {
        const enabled = item.value === "on";
        (this.settings as unknown as Record<string, unknown>)[key] = enabled;

        // If integration test just enabled and no test command, ask for command
        if (key === "integrationTest" && enabled && !this.settings.testCommand) {
          this.awaitingInput = true;
          this.buildTestCommandInputView();
          return;
        }
      }
      this.customizeIndex += 1;
      this.buildCustomizeView();
    };

    selectList.onCancel = () => {
      // Skip this setting
      this.customizeIndex += 1;
      this.buildCustomizeView();
    };

    this.addChild(selectList);
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("dim", "Enter to select  •  Esc to skip"), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

    this.tui.requestRender();
  }

  private buildTestCommandInputView(): void {
    this.clear();
    const theme = this.theme;

    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
    this.addChild(new Spacer(1));
    this.addChild(
      new Text(theme.fg("accent", theme.bold("Enter test command:")), 1, 0),
    );
    this.addChild(new Spacer(1));

    const input = new Input();
    input.focused = true;
    this.activeInput = input;

    input.onSubmit = (value) => {
      const trimmed = value.trim();
      if (trimmed) {
        this.settings.testCommand = trimmed;
      }
      this.awaitingInput = false;
      this.activeInput = null;
      this.customizeIndex += 1;
      this.buildCustomizeView();
    };

    input.onEscape = () => {
      this.awaitingInput = false;
      this.activeInput = null;
      this.customizeIndex += 1;
      this.buildCustomizeView();
    };

    this.addChild(input);
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("dim", "Enter to confirm  •  Esc to skip"), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

    this.tui.requestRender();
  }

  handleInput(keyData: string): void {
    if (this.mode === "customize" || this.awaitingInput) {
      if (this.activeInput) {
        this.activeInput.handleInput(keyData);
        return;
      }
      if (this.activeSelectList) {
        this.activeSelectList.handleInput(keyData);
        return;
      }
      return;
    }

    // Confirm mode
    if (keyData === "\r" || keyData === "\n") {
      this.done(this.settings);
      return;
    }
    if (keyData === "c" || keyData === "C") {
      this.mode = "customize";
      this.customizeIndex = 0;
      this.buildCustomizeView();
      return;
    }
    if (keyData === "\x1b") {
      this.done(null);
      return;
    }
  }

  override invalidate(): void {
    super.invalidate();
  }
}

// ── ResumePromptComponent ─────────────────────────────────────────────

/**
 * Shows plan name, progress, stored settings.
 * Three choices: Continue / Restart / Cancel.
 */
export class ResumePromptComponent extends Container {
  private selectList: SelectList;

  constructor(
    _tui: TUI,
    theme: Theme,
    _keybindings: KeybindingsManager,
    state: RunState,
    done: (result: "continue" | "restart" | "cancel") => void,
  ) {
    super();

    const display = formatResumeStatus(state);

    const options: SelectItem[] = [
      { value: "continue", label: "Continue", description: "Resume from where it stopped" },
      { value: "restart", label: "Restart", description: "Start over from the beginning" },
      { value: "cancel", label: "Cancel", description: "Do nothing" },
    ];

    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
    this.addChild(new Spacer(1));
    this.addChild(
      new Text(theme.fg("accent", theme.bold(`Plan: ${state.plan}`)), 1, 0),
    );
    this.addChild(new Text(theme.fg("text", display.statusLine), 1, 0));
    this.addChild(new Text(theme.fg("muted", display.progressLine), 1, 0));
    this.addChild(new Spacer(1));

    for (const line of display.settingsLines) {
      this.addChild(new Text(theme.fg("dim", `  ${line}`), 0, 0));
    }

    this.addChild(new Spacer(1));

    this.selectList = new SelectList(options, options.length, makeSelectListTheme(theme));
    this.selectList.onSelect = (item) => done(item.value as "continue" | "restart" | "cancel");
    this.selectList.onCancel = () => done("cancel");

    this.addChild(this.selectList);
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("dim", "Enter to confirm  •  Esc to cancel"), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
  }

  handleInput(keyData: string): void {
    this.selectList.handleInput(keyData);
  }

  override invalidate(): void {
    super.invalidate();
  }
}

// ── WorktreeSetupComponent ────────────────────────────────────────────

/**
 * Two options: create worktree (with editable branch name) or use current workspace.
 * Returns WorkspaceChoice.
 */
export class WorktreeSetupComponent extends Container {
  private selectList!: SelectList;
  private branchInput: Input | null = null;
  private awaitingBranchInput = false;
  private tui: TUI;
  private theme: Theme;
  private suggestedBranch: string;
  private done: (result: WorkspaceChoice) => void;

  constructor(
    tui: TUI,
    theme: Theme,
    _keybindings: KeybindingsManager,
    suggestedBranch: string,
    done: (result: WorkspaceChoice) => void,
  ) {
    super();
    this.tui = tui;
    this.theme = theme;
    this.suggestedBranch = suggestedBranch;
    this.done = done;

    this.buildMainView();
  }

  private buildMainView(): void {
    this.clear();
    const theme = this.theme;

    const options: SelectItem[] = [
      {
        value: "worktree",
        label: "(w) Create worktree",
        description: `New isolated workspace on branch: ${this.suggestedBranch}`,
      },
      {
        value: "current",
        label: "(c) Use current workspace",
        description: "Work directly in the current directory",
      },
    ];

    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
    this.addChild(new Spacer(1));
    this.addChild(
      new Text(theme.fg("accent", theme.bold("Workspace setup")), 1, 0),
    );
    this.addChild(new Spacer(1));

    this.selectList = new SelectList(options, options.length, makeSelectListTheme(theme));

    this.selectList.onSelect = (item) => {
      if (item.value === "worktree") {
        this.awaitingBranchInput = true;
        this.buildBranchInputView();
      } else {
        this.done({ type: "current" });
      }
    };

    this.selectList.onCancel = () => {
      // Default to current workspace on cancel
      this.done({ type: "current" });
    };

    this.addChild(this.selectList);
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("dim", "Enter to confirm  •  Esc to use current"), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
  }

  private buildBranchInputView(): void {
    this.clear();
    const theme = this.theme;

    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
    this.addChild(new Spacer(1));
    this.addChild(
      new Text(theme.fg("accent", theme.bold("Branch name for new worktree:")), 1, 0),
    );
    this.addChild(new Spacer(1));

    const input = new Input();
    input.setValue(this.suggestedBranch);
    input.focused = true;
    this.branchInput = input;

    input.onSubmit = (value) => {
      const branch = value.trim() || this.suggestedBranch;
      this.done({ type: "worktree", branch });
    };

    input.onEscape = () => {
      this.awaitingBranchInput = false;
      this.branchInput = null;
      this.buildMainView();
      this.tui.requestRender();
    };

    this.addChild(input);
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("dim", "Enter to confirm  •  Esc to go back"), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

    this.tui.requestRender();
  }

  handleInput(keyData: string): void {
    if (this.awaitingBranchInput && this.branchInput) {
      this.branchInput.handleInput(keyData);
      return;
    }
    this.selectList.handleInput(keyData);
  }

  override invalidate(): void {
    super.invalidate();
  }
}

// ── WaveProgressWidget ────────────────────────────────────────────────

/**
 * Shows wave N/M, task statuses. Updates via invalidate().
 */
export class WaveProgressWidget extends Container {
  private waveNumber: number;
  private totalWaves: number;
  private taskStatuses: Map<number, string>;
  private theme: Theme;
  private contentContainer: Container;

  constructor(
    _tui: TUI,
    theme: Theme,
    waveNumber: number,
    totalWaves: number,
    taskStatuses: Map<number, string>,
  ) {
    super();
    this.theme = theme;
    this.waveNumber = waveNumber;
    this.totalWaves = totalWaves;
    this.taskStatuses = taskStatuses;

    this.contentContainer = new Container();
    this.addChild(this.contentContainer);
    this.rebuildContent();
  }

  private rebuildContent(): void {
    this.contentContainer.clear();
    const progressText = formatWaveProgress(this.waveNumber, this.totalWaves, this.taskStatuses);

    for (const line of progressText.split("\n")) {
      this.contentContainer.addChild(
        new Text(line, 0, 0),
      );
    }
  }

  updateProgress(
    waveNumber: number,
    totalWaves: number,
    taskStatuses: Map<number, string>,
  ): void {
    this.waveNumber = waveNumber;
    this.totalWaves = totalWaves;
    this.taskStatuses = taskStatuses;
    this.rebuildContent();
  }

  override invalidate(): void {
    this.rebuildContent();
    super.invalidate();
  }
}

// ── FailureHandlerComponent ───────────────────────────────────────────

/**
 * Retry/skip/stop SelectList after a failure.
 */
export class FailureHandlerComponent extends Container {
  private selectList: SelectList;

  constructor(
    _tui: TUI,
    theme: Theme,
    _keybindings: KeybindingsManager,
    context: FailureContext,
    done: (result: "retry" | "skip" | "stop") => void,
  ) {
    super();

    const summary = formatFailureContext(context);

    const options: SelectItem[] = [
      { value: "retry", label: "Retry", description: "Try again" },
      { value: "skip", label: "Skip", description: "Skip this task and continue" },
      { value: "stop", label: "Stop", description: "Halt execution" },
    ];

    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
    this.addChild(new Spacer(1));
    this.addChild(
      new Text(theme.fg("warning", theme.bold("Task Failed")), 1, 0),
    );
    this.addChild(new Spacer(1));

    for (const line of summary.split("\n")) {
      this.addChild(new Text(theme.fg("text", line), 1, 0));
    }

    this.addChild(new Spacer(1));

    this.selectList = new SelectList(options, options.length, makeSelectListTheme(theme));
    this.selectList.onSelect = (item) => done(item.value as "retry" | "skip" | "stop");
    this.selectList.onCancel = () => done("stop");

    this.addChild(this.selectList);
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("dim", "Enter to confirm  •  Esc to stop"), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
  }

  handleInput(keyData: string): void {
    this.selectList.handleInput(keyData);
  }

  override invalidate(): void {
    super.invalidate();
  }
}

// ── CancellationSelectionComponent ────────────────────────────────────

/**
 * Two options: stop after wave or stop after task. Returns granularity.
 */
export class CancellationSelectionComponent extends Container {
  private selectList: SelectList;

  constructor(
    _tui: TUI,
    theme: Theme,
    _keybindings: KeybindingsManager,
    done: (result: "wave" | "task") => void,
  ) {
    super();

    const options: SelectItem[] = [
      {
        value: "wave",
        label: "(w) Stop after wave",
        description: "Finish the current wave, then stop",
      },
      {
        value: "task",
        label: "(t) Stop after task",
        description: "Finish the current task, then stop",
      },
    ];

    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
    this.addChild(new Spacer(1));
    this.addChild(
      new Text(theme.fg("accent", theme.bold("When should execution stop?")), 1, 0),
    );
    this.addChild(new Spacer(1));

    this.selectList = new SelectList(options, options.length, makeSelectListTheme(theme));
    this.selectList.onSelect = (item) => done(item.value as "wave" | "task");
    this.selectList.onCancel = () => done("wave");

    this.addChild(this.selectList);
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("dim", "Enter to confirm  •  Esc to stop after wave"), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
  }

  handleInput(keyData: string): void {
    this.selectList.handleInput(keyData);
  }

  override invalidate(): void {
    super.invalidate();
  }
}

// ── MainBranchWarningComponent ────────────────────────────────────────

/**
 * Confirm dialog for committing to main. Returns boolean.
 */
export class MainBranchWarningComponent extends Container {
  private selectList: SelectList;

  constructor(
    _tui: TUI,
    theme: Theme,
    _keybindings: KeybindingsManager,
    branch: string,
    done: (confirmed: boolean) => void,
  ) {
    super();

    const options: SelectItem[] = [
      { value: "yes", label: "Yes, proceed", description: "Continue on the current branch" },
      { value: "no", label: "No, cancel", description: "Go back" },
    ];

    this.addChild(new DynamicBorder((s) => theme.fg("warning", s)));
    this.addChild(new Spacer(1));
    this.addChild(
      new Text(theme.fg("warning", theme.bold(`Warning: you are on branch "${branch}"`)), 1, 0),
    );
    this.addChild(
      new Text(
        theme.fg("text", "This is a protected branch. Proceeding will commit directly to it."),
        1,
        0,
      ),
    );
    this.addChild(new Spacer(1));

    this.selectList = new SelectList(options, options.length, makeSelectListTheme(theme));
    this.selectList.onSelect = (item) => done(item.value === "yes");
    this.selectList.onCancel = () => done(false);

    this.addChild(this.selectList);
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("dim", "Enter to confirm  •  Esc to cancel"), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((s) => theme.fg("warning", s)));
  }

  handleInput(keyData: string): void {
    this.selectList.handleInput(keyData);
  }

  override invalidate(): void {
    super.invalidate();
  }
}

// ── ReviewSummaryComponent ────────────────────────────────────────────

/**
 * Displays a formatted CodeReviewSummary.
 * User dismisses with Enter or Esc.
 */
export class ReviewSummaryComponent extends Container {
  constructor(
    _tui: TUI,
    theme: Theme,
    _keybindings: KeybindingsManager,
    review: CodeReviewSummary,
    done: (result: void) => void,
  ) {
    super();

    const markdown = formatCodeReviewSummary(review);

    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
    this.addChild(new Spacer(1));
    this.addChild(
      new Text(theme.fg("accent", theme.bold("Code Review")), 1, 0),
    );
    this.addChild(new Spacer(1));
    this.addChild(new Markdown(markdown, 1, 0, getMarkdownTheme()));
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("dim", "Enter or Esc to dismiss"), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

    // Capture done for handleInput — store as a closure
    this._done = done;
  }

  private _done: (result: void) => void;

  handleInput(keyData: string): void {
    if (keyData === "\r" || keyData === "\n" || keyData === "\x1b") {
      this._done(undefined);
    }
  }

  override invalidate(): void {
    super.invalidate();
  }
}

// ── TestCommandInputComponent ─────────────────────────────────────────

/**
 * Simple Input with "Enter test command:" prompt.
 * Returns the entered string, or null if cancelled.
 */
export class TestCommandInputComponent extends Container {
  private input: Input;

  constructor(
    _tui: TUI,
    theme: Theme,
    _keybindings: KeybindingsManager,
    done: (result: string | null) => void,
  ) {
    super();

    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
    this.addChild(new Spacer(1));
    this.addChild(
      new Text(theme.fg("accent", theme.bold("Enter test command:")), 1, 0),
    );
    this.addChild(new Spacer(1));

    this.input = new Input();
    this.input.focused = true;

    this.input.onSubmit = (value) => {
      const trimmed = value.trim();
      done(trimmed.length > 0 ? trimmed : null);
    };

    this.input.onEscape = () => {
      done(null);
    };

    this.addChild(this.input);
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("dim", "Enter to confirm  •  Esc to skip"), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
  }

  handleInput(keyData: string): void {
    this.input.handleInput(keyData);
  }

  override invalidate(): void {
    super.invalidate();
  }
}
