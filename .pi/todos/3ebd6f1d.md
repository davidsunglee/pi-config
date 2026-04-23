{
  "id": "3ebd6f1d",
  "title": "Update working-indicator extension to persist selection and remove footer status notification",
  "tags": [
    "extension",
    "working-indicator",
    "ui",
    "persistence"
  ],
  "status": "closed",
  "created_at": "2026-04-22T21:55:14.268Z"
}

## Summary

Refine the `agent/extensions/working-indicator.ts` extension so the selected working indicator persists globally across pi sessions, the footer status entry is removed/cleared, and the behavior stays simple for both users and code.

## Requirements

### Persistence scope and storage

- Persist the working-indicator preference globally across all pi sessions.
- Store the preference in the user-scoped file `~/.pi/agent/working.json` (expand `~` to the user home directory; this is not a project-local path).
- Treat `~/.pi/agent/working.json` as a shared JSON file that may contain settings for other extensions.
- Store this extension's preference under:

```json
{
  "workingIndicator": {
    "mode": "<mode>"
  }
}
```

- Preserve all unrelated top-level keys in `working.json`.
- Preserve sibling keys inside `workingIndicator`; only update `workingIndicator.mode`.
- Create the parent directory `~/.pi/agent/` if needed when saving.

### Supported modes and command surface

- Keep the existing user command surface unchanged:
  - `/working-indicator`
  - `/working-indicator dot`
  - `/working-indicator pulse`
  - `/working-indicator none`
  - `/working-indicator spinner`
  - `/working-indicator reset`
- Do not add `/working-indicator default` as a user command.
- Keep the existing indicator visuals and mode set unchanged apart from persistence/default/reset behavior.
- The no-argument command should report only the active indicator for the current session.

### Default and reset behavior

- Change the unsaved/default behavior from the current custom spinner to pi's default spinner.
- If there is no saved mode, use pi's default spinner.
- `/working-indicator reset` should:
  - immediately restore pi's default spinner for the current session
  - persist `"default"` to `workingIndicator.mode`
- If `working.json` does not exist and the user runs `/working-indicator reset`, create it and persist the default mode.
- Persist valid saved modes immediately when the command succeeds.
- Treat `"default"` as a valid persisted mode when reading from disk.

### Session application behavior

- Apply the persisted preference on every `session_start`, including startup, reload, `/new`, `/resume`, and `/fork`.
- Startup/session restore should be silent; do not show notifications when restoring a saved mode or falling back to default.
- Startup should be read-only: do not auto-repair or rewrite the file during `session_start`.

### Footer and notifications

- Remove the working-indicator footer status usage.
- Actively clear any stale `working-indicator` footer status so no old footer entry lingers.
- Keep toast notifications for explicit command usage.
- If a command changes the current-session indicator successfully but persistence fails, show only the persistence error toast (not an additional success toast).

### Invalid or incompatible persisted data

On startup / `session_start`:
- If `working.json` is missing, unreadable, malformed, unparseable, has a non-object top level, or contains an invalid/incompatible `workingIndicator` value, silently fall back to pi's default spinner.
- Do not notify and do not rewrite the file during startup.

On explicit `/working-indicator ...` commands:
- If `working.json` is malformed/unparseable or has a non-object top level, apply the requested mode for the current session only, do not save it, and show an error toast.
- If `working.json` is a valid top-level object but `workingIndicator` has an incompatible shape, normalize only the `workingIndicator` section as needed and save successfully.
- If `workingIndicator.mode` is invalid but the surrounding JSON is otherwise usable, overwrite just that mode with the requested value on explicit command.
- For non-JSON persistence failures (permissions, write failure, disk error, etc.), apply the requested mode for the current session only and show an error toast.

### Documentation / help text

- Update the extension's user-facing help text/comments in `agent/extensions/working-indicator.ts` so they match the new persistence and reset/default behavior.

### Tests

- Add automated tests.
- Include both:
  - focused unit tests for persistence/load/reset behavior
  - behavioral extension tests for command/session behavior

## Constraints

- Prioritize simplicity of UX and code.
- Keep the feature purely cosmetic; avoid adding extra UI or command surface beyond what is needed.
- Do not require the user to manage settings manually beyond using the existing command.

## Acceptance criteria

- Selecting `dot`, `pulse`, `none`, or `spinner` updates the active indicator immediately and persists it to `~/.pi/agent/working.json` under `workingIndicator.mode`.
- `reset` updates the active indicator immediately to pi's default spinner and persists `workingIndicator.mode = "default"`.
- On every `session_start`, the extension restores a valid saved mode; otherwise it silently uses pi's default spinner.
- The extension no longer shows the working-indicator footer status and clears any stale `working-indicator` status entry.
- Shared JSON data in `~/.pi/agent/working.json` is preserved when saving this extension's mode.
- Malformed/unusable shared settings never get overwritten implicitly at startup.
- When persistence is unusable for writes, the current session still reflects the user's explicit command and the user receives an error toast.
- The command help/comments match the shipped behavior.
- Automated tests cover the persistence edge cases and the command/session behavior above.

## Non-goals

- Changing the existing indicator visuals.
- Adding new working-indicator modes.
- Adding a new `default` command alias.
- Expanding this into a broader settings system.
