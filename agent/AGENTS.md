# Agent Notes

## Model/provider resolution

- never assume a provider from a bare model name
- when the user requests a model without naming a provider, first discover available matches by running `pi --list-models "<requested-model>"`
- treat `pi --list-models` as the source of truth for which models/providers are available in the current session, including subscription-backed providers authenticated via `/login`
- if exactly one provider matches, use the fully-qualified model reference `provider/model` for subagent dispatches
- if multiple providers match, prefer an exact authenticated match; if still ambiguous, ask the user
- when spawning subagents, pass the fully-qualified model string returned by discovery instead of the bare model name
- if no match is returned, explain that the requested model is not currently available in this session and ask whether to log in or choose another model
