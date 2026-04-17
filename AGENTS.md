# Project Instructions

## Model/provider resolution

- When I mention a bare model name like `gpt-5.4` or `gpt-5.4-mini`, resolve it against the providers actually configured in my pi setup.
- Prefer configured providers over unconfigured ones.
- In this environment, prefer:
  - `openai-codex/gpt-5.4`
  - `openai-codex/gpt-5.4-mini`
- Do not infer Azure / Azure OpenAI from a bare `gpt-*` model name unless I explicitly say `azure`, `azure-openai`, or provide an Azure-qualified model/provider string.
- For subagent dispatch, use the configured provider-qualified model string instead of guessing from the model family name.
- If the requested model/provider is unavailable, do not silently switch to a different provider. Ask before falling back, unless I explicitly requested a fallback strategy.
- If provider choice is still ambiguous, ask before dispatching.
