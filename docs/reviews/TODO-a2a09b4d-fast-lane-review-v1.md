**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Approved

**Reasoning:** The Safehouse wrappers, profile templates, README guidance, and smoke tests satisfy the requested daily-driver/Xcode sandbox scope, and the actual smoke suite passed locally. I did not find Critical or Important production-readiness issues in the reviewed diff.

### Strengths

- `safehouse/bin/pi-safe:20-41`, `safehouse/bin/pi-ios:20-40`, and `safehouse/bin/pi-ios-debug:20-40` keep the wrapper behavior small and predictable: current directory is the workdir, local overrides are appended only when present, and the intended Xcode/LLDB feature differences are explicit.
- `safehouse/README.md:93-159` clearly documents wrapper selection, default-deny/opt-in feature posture, network caveats, and escalation paths to Gondolin/Tart.
- `safehouse/README.md:161-197` gives concrete safe examples for read-only context paths, temporary writable paths, and selective environment passing while warning against full environment inheritance.
- `safehouse/profiles/pi-local-overrides.example.sb:1-35` provides a practical copyable override template, and `safehouse/profiles/pi-strict-deny.example.sb:1-51` gives a useful stricter starting point for sensitive paths.
- `safehouse/smoke/pi-safehouse-smoke.sh:35-133` covers prerequisites, wrapper executability, Pi launch under Safehouse, workdir read/write, outside-workdir denial, Xcode enablement, and delegates argv assembly checks; I ran it successfully with 10 passed / 0 failed / 0 skipped.
- `safehouse/smoke/pi-wrapper-argv-test.sh:81-199` uses isolated stubs to verify wrapper argument routing for all three wrappers; I ran it successfully with 11 passed / 0 failed.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

_None._

#### Minor (Nice to Have)

_None._

### Recommendations

- Consider adding a future convenience install/bootstrap script only if these wrappers need to be deployed beyond this dotfiles repo; keeping them tracked under `safehouse/` is appropriate for the current scope.
