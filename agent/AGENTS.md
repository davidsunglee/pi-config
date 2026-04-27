# Agent Notes

These are global defaults. They yield to:

1. Explicit user instructions in the current conversation
2. Project-local guidance (e.g., a repo's `CLAUDE.md`, `AGENTS.md`)
3. Established conventions in existing code

Apply them to real engineering work. For prototypes, exploration, and throwaway scripts, lean toward smaller and simpler — most of these rules assume code that will be read again.

## Operating mode

- Match scope to the request. A bug fix is a bug fix; don't refactor adjacent code unless asked.
- Ask once before doing the work when scope or approach is unclear, not after.
- In existing code, follow established patterns unless there's a concrete reason to break from them.
- State assumptions explicitly when proceeding without confirmation.

## Software design

- **Don't split prematurely.** Three similar lines is fine; an abstraction is a commitment. Generalize from real, repeated pain — not anticipated pain.
  - Anti-example: extracting `formatUserName(u)` for a single caller because it "might be reused."
- **Avoid shallow wrappers.** A function, class, or module should hide more complexity than it exposes.
  - Anti-example: `class UserService { getUser(id) { return db.users.findById(id); } }` — a method that just forwards adds indirection without reducing caller burden.
- **Design interfaces around domain concepts**, not storage details, framework mechanics, or incidental control flow. The caller should think in the problem domain.
- **Validate at boundaries, not internally.** User input, external API responses, and public-API entry points get checked. Internal calls between trusted modules don't need defensive validation for states that can't occur.
- **Document non-obvious invariants at module boundaries.** If correctness depends on something the caller can't see, say so.

## Testing strategy

- **Verify observable behavior through public interfaces.** Assert on returned values, persisted state, emitted events, API responses, UI behavior — not internal call sequences.
- **Avoid mocks for internal collaborators.** Use real dependencies in controlled environments. Mocks belong at external boundaries that are slow, costly, flaky, nondeterministic, unsafe, or unavailable.
- **For any non-trivial bug, write a failing regression test first**, then fix. The test should reproduce the real failure path, not a sanitized version of it.
- **Keep tests deterministic.** Control time and randomness, seed data explicitly, isolate state, no uncontrolled network calls.
- **Pick the lowest-cost test that gives real confidence.** Unit-test what's unit-shaped; reserve integration and end-to-end coverage for flows that only fail at the seams.

## Tool and model resolution

When the user names a model or tool without naming a provider, don't guess.

- Discover matches before dispatch. For models in the `pi` environment: `pi --list-models "<name>"`. Treat its output as the source of truth for what's available in the current session, including subscription-backed providers authenticated via `/login`.
- One match → use the fully-qualified `provider/model` reference.
- Multiple matches → prefer an authenticated provider; if still ambiguous, ask.
- No match → say so plainly; offer to log in or pick another option.
- Pass fully-qualified identifiers to subagents, never bare names.
