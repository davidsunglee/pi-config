{
  "id": "fcdeae6c",
  "title": "Update execute-plan config dialog prompt",
  "tags": [
    "skill",
    "execute-plan",
    "ux"
  ],
  "status": "done",
  "created_at": "2026-04-07T13:45:50.390Z"
}

## Change

Update the Step 3 confirmation prompt in `~/.pi/agent/skills/execute-plan/SKILL.md`.

**Before:**
```
Start? (enter / c to customize)
```

**After:**
```
Ready to execute: (s)tart / (c)ustomize / (q)uit
```

## Behavior

- **`s`** — accept all defaults, proceed to Step 4
- **`c`** — enter per-setting customization flow (existing behavior)
- **`q`** — print `"Plan execution cancelled."` and stop. No cleanup needed since nothing has started.

## Why

- `enter` doesn't work in the TUI (treated as empty prompt, nothing happens)
- No cancel option existed — user had no way to back out
- Statement + action keys is more ergonomic than question + y/n

## Scope

Update all references in SKILL.md:
- The prompt itself in the settings block (Step 3)
- The `**If enter:**` / `**If c:**` behavior descriptions below it
- Any other references to the old prompt format

## Completed

Implemented in `~/.pi/agent/skills/execute-plan/SKILL.md` and verified that the old prompt / `If enter` references are gone.
