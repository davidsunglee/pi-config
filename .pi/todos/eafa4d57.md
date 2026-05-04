{
  "id": "eafa4d57",
  "title": "Change repo skills to write artifacts under docs instead of .pi",
  "tags": [
    "skills",
    "docs"
  ],
  "status": "open",
  "created_at": "2026-05-03T21:47:07.747Z"
}

Update this repository's skills so any generated artifacts are written under the repo's `docs/` folder instead of `.pi/`.

Acceptance criteria:
- Audit repo-local skills for hardcoded artifact paths under `.pi/` (for example specs, plans, review outputs, or generated docs).
- Replace artifact destinations with appropriate paths under `docs/`.
- Preserve references to Pi configuration/runtime files that genuinely must remain under `.pi/`.
- Update skill instructions, examples, and any tests/fixtures that mention the old artifact locations.
- Run relevant validation or tests and document the commands/results.
