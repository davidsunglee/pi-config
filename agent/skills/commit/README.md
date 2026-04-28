# Commit skill

Create a focused git commit from the current working tree using a concise Conventional Commits-style subject.

## When to use

Use this skill whenever the user asks the agent to commit changes. It is intentionally narrow: it stages only the intended files, creates one commit, and does not push.

## What it does

1. Interprets any caller-provided paths, globs, or commit-message guidance.
2. Reviews `git status` and `git diff` so the commit reflects the actual change set.
3. Optionally checks recent commit subjects to match local scope conventions.
4. Asks for clarification when unrelated or ambiguous files are present.
5. Stages only the intended files.
6. Runs `git commit` with a Conventional Commits-style message.

## Commit message shape

```text
<type>(<scope>): <summary>
```

- `type` is required. Common values are `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, and `perf`.
- `scope` is optional and should be a short noun for the affected area.
- `summary` is required, imperative, at most 72 characters, and has no trailing period.
- A body is optional when extra context is useful.
- Breaking-change footers and sign-offs are intentionally not used.

## Guardrails

- Commit only; never push.
- If paths are provided, stage only those paths unless the user explicitly says otherwise.
- If the working tree includes unrelated changes, ask before including them.
- Treat freeform arguments as message guidance, path arguments as staging constraints, and mixed arguments as both.

## Files

- `SKILL.md` — the executable procedure read by the agent before committing.
