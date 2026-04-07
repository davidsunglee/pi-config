{
  "id": "cc8bc2c8",
  "title": "Harmonize interactive prompt conventions across skills",
  "tags": [
    "skill",
    "ux",
    "low-priority"
  ],
  "status": "open",
  "created_at": "2026-04-07T13:46:02.632Z"
}

## Problem

Interactive prompts use three different conventions across skills:

1. **`(letter) Description`** — execute-plan failure handling: `(r) Retry / (s) Skip / (x) Stop`
2. **Numbered lists** — finishing-a-development-branch: `1. Merge / 2. PR / 3. Keep / 4. Discard`
3. **Numbered lists** — using-git-worktrees: `1. .worktrees/ / 2. ~/.config/pi/worktrees/`

Plus execute-plan has a `Continue? (y/n)` for the main-branch commit warning (Step 7).

## Prompts to review

| Skill | Prompt | Current style |
|-------|--------|---------------|
| execute-plan | Config dialog (Step 3) | Being updated to `(s)tart / (c)ustomize / (q)uit` per TODO-fcdeae6c |
| execute-plan | Main-branch commit warning (Step 7) | `Continue? (y/n)` |
| execute-plan | Integration test failure (Step 9b) | `(r) Retry / (s) Skip / (x) Stop` |
| finishing-a-development-branch | Branch completion options | `1. / 2. / 3. / 4.` + `Which option?` |
| finishing-a-development-branch | Discard confirmation | `Type 'discard' to confirm.` |
| using-git-worktrees | Directory selection | `1. / 2.` + `Which would you prefer?` |

## Considerations

- TUI constraint: `enter` alone doesn't work (empty prompt)
- Letter mnemonics `(x)` are faster than numbers for small option sets
- Numbers may still be better for longer lists (4+ options)
- Destructive confirmations (type 'discard') are a separate pattern and probably fine as-is
- `y/n` questions need to work in TUI too — verify or replace
