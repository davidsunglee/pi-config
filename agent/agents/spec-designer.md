---
name: spec-designer
description: Interactive spec-design subagent. Receives the spec-design procedure as an appended system prompt at dispatch time and conducts the Q&A directly with the user in its own multiplexer pane. Writes the spec to docs/specs/ and ends its turn with a SPEC_WRITTEN: <absolute path> line.
tools: read, write, grep, find, ls
thinking: xhigh
session-mode: lineage-only
system-prompt: append
spawning: false
auto-exit: false
---
