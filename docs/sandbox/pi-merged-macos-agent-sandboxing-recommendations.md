# Merged Pi Sandboxing Recommendations for Apple Silicon macOS

Date: 2026-05-12

## Executive summary

There is no single sandbox that fits this workflow. The right answer is a **tiered stack**:

1. **Daily iOS/macOS work:** run Pi locally on macOS under a dedicated agent user and a Safehouse/Seatbelt filesystem sandbox.
2. **Trusted full-stack/web work:** use OrbStack as the default Docker/Compose runtime.
3. **Risky private Linux-compatible work:** use Gondolin to run Pi tools inside a local Linux microVM.
4. **Risky native iOS/macOS work:** use a Tart macOS VM.
5. **Cloud-safe risky work:** use E2B, Vercel/Sandcastle, Daytona, or similar cloud sandboxes.
6. **Automation/orchestration:** use Sandcastle only as an orchestration layer, not as the sandbox boundary itself.

The short version:

- **Safehouse + dedicated macOS user** is the practical default for local Pi.
- **OrbStack** is excellent dev infrastructure, but not a hostile-code sandbox.
- **Gondolin** is now the most interesting Pi-specific local microVM option for private, Linux-compatible, higher-risk work.
- In the recommended Gondolin setup, **Pi itself still runs on macOS**; Gondolin runs Pi's file/shell tool operations in the VM. Subscription auth stays host-side.
- **Tart** is the strongest practical option for isolated iOS/Xcode work.
- **Sandcastle** is useful for AFK branch/review workflows, but security depends on its sandbox provider.

## Threat model

The main risks are:

- Prompt injection causing Pi to run unwanted commands.
- Accidental destructive commands outside the repo.
- Supply-chain attacks from package install scripts.
- Secret exfiltration from `~/.ssh`, cloud credentials, `.env`, keychains, browser profiles, and Pi auth files.
- Agent writes to persistence points such as shell startup files, git hooks, editor config, or agent config.
- Over-broad Docker access, especially Docker socket access.
- Network exfiltration to arbitrary hosts.

Different projects need different defenses. Some only need practical damage reduction; others need allow-by-default containment.

## Core recommendation by workload

### 1. Daily iOS/macOS development

Use this for Xcode, Swift, SwiftUI, Simulator, signing, and native Apple tooling.

Recommended stack:

1. Dedicated macOS user account, e.g. `pi-agent`.
2. Pi installed and authenticated under that user.
3. Git worktrees or disposable branches.
4. Safehouse wrapping Pi.
5. Optional host egress control via LuLu, Little Snitch, or `pf`.
6. Tart VM for higher-risk or unattended iOS work.

Why:

- Xcode and Simulator are macOS-only and do not fit Linux microVM/container sandboxes.
- A separate macOS user gives strong practical separation from your main user's keychain, browser data, SSH keys, and personal files.
- Safehouse constrains the Pi process itself, including Pi's direct file tools, not just bash subprocesses.
- Tart gives a real macOS VM boundary when native iOS work needs stronger isolation.

Example daily invocation:

```bash
safehouse --workdir="$PWD" --enable=xcode -- pi
```

Only add debugger support when needed:

```bash
safehouse --workdir="$PWD" --enable=xcode,lldb -- pi
```

Avoid enabling broad integrations by default. In particular, do not enable Docker, cloud credentials, SSH, clipboard, keychain, or wide-read unless the task explicitly requires them.

For high-risk iOS work, use Tart with a clean macOS image containing Xcode. This costs disk space and setup time, but it is the strongest realistic isolation that still supports Xcode and Simulator.

### 2. Trusted full-stack/web development

Use OrbStack as the default Docker/Compose runtime.

Recommended stack:

1. OrbStack for Docker/Compose, local DBs, Redis, queues, and dev services.
2. Devcontainers where useful.
3. Pi on the host or inside the container depending on project needs.
4. Git worktrees for agent work.
5. Avoid broad host mounts and Docker socket access in agent-controlled containers.

OrbStack is recommended here because it is fast, light, Apple Silicon-friendly, supports Docker Compose, has good networking, and handles x86 Linux images well via Rosetta.

But classify OrbStack as **development infrastructure**, not as a strong hostile-code sandbox. Its integration features are exactly what make it productive and exactly why it should not be treated like a per-agent security boundary.

Do not rely on OrbStack alone for:

- Unknown repos.
- Autonomous agent execution of untrusted scripts.
- Strict secret-exfiltration prevention.
- Workloads where Pi has unrestricted Docker control.

### 3. Risky private Linux-compatible development

Use Gondolin first.

Gondolin is particularly relevant because it has a Pi extension example that overrides Pi's `read`, `write`, `edit`, and `bash` tools so they execute inside a local Linux microVM with the project mounted at `/workspace`.

This addresses a key Pi-specific issue: sandboxing only bash is insufficient if Pi's direct file tools still run on the host. Gondolin can move the core `read`, `write`, and `edit` paths into the VM boundary too.

Use Gondolin for:

- Private repos that should stay local.
- Unknown or semi-trusted web/backend repos.
- Dependency installs and generated scripts that you do not want on the host.
- Agent runs where Pi should only see a specific worktree.
- Tasks where programmable HTTP/TLS egress and secret placeholder injection matter.

Example shape, using host Node 24 until the Node 26/Gondolin readiness issue is fixed:

```bash
npx -y -p node@24 node "$(which pi)" \
  --no-extensions \
  -e .gondolin/pi-gondolin.ts \
  --tools read,write,edit,bash
```

Use `--no-extensions` for risky sessions because ordinary Pi extensions run in the host Pi process, not in the Gondolin VM. Then explicitly load only the trusted Gondolin extension.

Gondolin strengths:

- Local Linux microVMs.
- Programmable network policy.
- Host-side HTTP/TLS mediation.
- Secret placeholders: real secrets need not enter the guest.
- Programmable VFS mounts.
- Pi tool override example.
- Good fit for short-lived agent tasks.

Gondolin caveats:

- Not for iOS/Xcode.
- Early project.
- Default image is intentionally minimal; richer stacks need custom images.
- Current image builder is Alpine-focused.
- HTTP/2, HTTP/3, QUIC, and WebRTC are not supported in the default network model.
- Allowed hosts can still receive data the guest can read.
- VM isolation ultimately trusts QEMU or the selected backend.
- The current Pi example overrides `read`, `write`, `edit`, and `bash`; do not enable `grep`, `find`, or `ls` until they are also overridden or guarded.
- Pi's model loop and extensions run on the host. Gondolin does not automatically sandbox arbitrary host-side extensions or provider/auth code.
- The Gondolin tool override is process-local. It does not automatically apply to subagents launched by `pi-interactive-subagent`, because Pi-backed subagents are separate child `pi` processes and Claude-backed subagents are separate `claude` processes.
- Do not mount live `~/.pi` into the guest unless using a filtered/sanitized view. The guest does not need Pi subscription credentials.

Recommendation: pilot Gondolin on one non-iOS private full-stack repo. If it works well, make it the default for private higher-risk Pi tasks.

#### Gondolin operational notes from the pi-config pilot

Observed on Apple Silicon macOS with QEMU 11.0.0, Pi 0.74.0, host Node v26, and `@earendil-works/gondolin` 0.9.1:

- A plain Gondolin run under host Node v26 booted the VM but timed out waiting for guest readiness. Debug logs showed `sandboxd` receiving a malformed 1-byte exec frame.
- Running Gondolin through host Node 24 succeeded. Until the compatibility issue is fixed in the released Gondolin/Node combination, use Node 24 for Gondolin and Gondolin-backed Pi.
- Smoke-test pattern:

  ```bash
  npx -y -p node@24 -p @earendil-works/gondolin gondolin exec \
    --mount-hostfs "$PWD:/workspace:ro" \
    --cwd /workspace \
    -- /bin/bash -lc 'pwd; ls -la; node --version; npm --version'
  ```

- Launch Pi through Node 24 too, because the installed `pi` launcher currently uses Homebrew's Node 26 shebang:

  ```bash
  npx -y -p node@24 node "$(which pi)" \
    --no-extensions \
    -e .gondolin/pi-gondolin.ts \
    --tools read,write,edit,bash
  ```

- Host Pi reads `~/.pi/agent/auth.json` for Claude/Codex subscription auth. The Gondolin guest does not need that file because the guest is only executing tools.
- Mount the project/worktree that tools should operate on, not Pi's live config directory. For this repo, prefer `/Users/david/Code/pi-config` mounted as `/workspace`.
- If you intentionally need to edit live `~/.pi`, use a sanitized staging copy or a filtered VFS mount that excludes `agent/auth.json`, `agent/sessions/`, `agent/run-history.jsonl`, and other secrets.
- `pi-interactive-subagent` currently launches Pi-backed subagents as child `pi` processes with its own `subagent-done.ts` extension, and Claude-backed subagents as child `claude` processes. A parent Pi session that loaded `pi-gondolin.ts` does not automatically pass that tool override into those children.
- Therefore a reusable Gondolin workflow must either propagate the Gondolin extension and launch constraints into Pi-backed subagents, or fail closed / mark subagents unsupported in strict mode. Claude-backed subagents need separate treatment; the Pi extension cannot sandbox Claude Code's native tool execution.
- The existing `pi-config` agent definitions use `grep`, `find`, and `ls` heavily. The upstream Gondolin example only overrides `read`, `write`, `edit`, and `bash`, so subagent support likely requires VM-backed `grep`, `find`, and `ls` implementations or agent/tool profiles that avoid those tools.

### 4. High-risk Docker-heavy agent work

If the agent needs full Docker/Compose autonomy, avoid giving it access to your normal OrbStack/Docker daemon.

Better options:

1. Docker Sandboxes, if available.
2. A disposable VM with its own Docker daemon.
3. Gondolin custom image if Docker-in-guest support is sufficient for the task.
4. Cloud microVMs when code can leave the machine.

The key rule: **do not mount the host Docker socket into an agent-controlled environment unless you fully trust the code and task**.

### 5. Cloud-safe risky work

For projects where cloud execution is acceptable:

- **E2B**: best fit for ephemeral AI-agent code execution.
- **Vercel sandbox via Sandcastle**: useful if you like Sandcastle's branch/orchestration model.
- **Daytona**: better for longer-lived persistent cloud sandboxes.
- **Coder/Gitpod**: better as full cloud development environments than as narrowly scoped hostile-code sandboxes.

Avoid cloud sandboxes for private/proprietary repos unless the data policy and vendor trust model are acceptable.

## Tool-by-tool positioning

| Tool / approach | Recommendation | Use for | Do not use for |
|---|---|---|---|
| Dedicated macOS user | Core default | Separating agent from personal secrets and TCC-protected data | Strong network control by itself |
| Safehouse | Core default for local Pi | macOS filesystem containment around the whole Pi process | High-assurance VM isolation |
| Pi `@anthropic-ai/sandbox-runtime` extension | Useful supplement | Sandboxing bash/subprocesses with filesystem/network policy | Complete Pi protection unless file tools are also guarded |
| Tart | Core for risky iOS | Isolated macOS/Xcode/Simulator work | Lightweight everyday web tasks |
| OrbStack | Core dev runtime | Trusted Docker/Compose/devcontainers | Hostile-code sandboxing |
| Gondolin | Core for risky private Linux-compatible Pi work | Local microVM Pi tool execution with controlled I/O | Xcode/iOS, broad Docker-heavy stacks without custom setup |
| Sandcastle | Optional orchestration | AFK agents, worktrees, review pipelines, branch automation | Security boundary by itself |
| E2B | Cloud option | Ephemeral cloud AI-agent sandboxes | Private repos that must stay local |
| Daytona | Cloud option | Persistent cloud workspaces/sandboxes | Local-only private work |
| microsandbox | Worth watching/trying | Local microVM isolation on Apple Silicon/Linux | iOS/Xcode |
| Apple `container` | Watchlist | Per-container lightweight VM isolation on macOS 26+ | Current default on older/stable macOS setups |
| Docker/Podman plain containers | Trusted dev only | Reproducible full-stack environments | Hostile code with secrets nearby |
| WebContainers/V8/Cloudflare Workers | Skip for this workflow | Narrow JS/edge use cases | General Pi/iOS/full-stack dev |
| gVisor/nsjail/Kata directly | Usually skip | Infrastructure-specific setups | Day-to-day Pi workflow |

## Pi-specific guidance

Pi has multiple classes of tools:

- Direct file tools: `read`, `write`, `edit`, `grep`, `find`, `ls`.
- Shell execution: `bash`.
- Extensions, custom tools, subagents, and other workflow tools depending on configuration.

This matters because sandboxing bash alone does not constrain direct file tools. Use one of these patterns:

1. **Wrap the entire Pi process** with Safehouse or another OS-level sandbox. This constrains Pi's direct Node filesystem calls too.
2. **Use Gondolin's Pi extension** for Linux-compatible work. This redirects Pi's `read`, `write`, `edit`, and `bash` tools into a microVM.
3. **Use a Pi tool-guard extension** if only selected paths should be allowed/denied.
4. **Use read-only tool mode** for review tasks when mutation is unnecessary.

For Gondolin specifically, keep the host/guest split clear:

- Host Pi reads settings, skills, agents, subscription auth, and model/provider config from `~/.pi/agent`.
- The Gondolin guest only needs the workspace that `read`, `write`, `edit`, and `bash` operate on.
- Do not mount `~/.pi` merely to make Claude/Codex subscription auth work; host Pi already handles auth before tool execution reaches the guest.
- If the workspace itself is a Pi config repo, mount the repo copy, not the live `~/.pi` directory.
- If live `~/.pi` must be edited, expose only selected safe subtrees or use a sanitized staging copy.
- Treat subagent orchestration as a separate propagation problem: the parent `subagent_run_*` tool is a host-side control-plane operation, while each child Pi/Claude process has its own tool surface. Do not assume child tools inherit the parent's Gondolin boundary.

Protect these paths by default:

- `~/.ssh`
- `~/.aws`
- `~/.gnupg`
- `~/.config/gcloud`
- `~/.pi/agent/auth.json`
- shell startup files
- browser profiles and cookies
- keychains
- iCloud/Photos/Contacts/Documents outside the project
- `.env`, `.env.*`, `*.pem`, `*.key`
- `.git/hooks`, `.git/config`, agent extension/config directories unless intentionally editing them

## Network and secrets guidance

Filesystem isolation is not enough if allowed network destinations can receive sensitive project data. Network policy should be chosen by risk level.

### Low-risk/trusted projects

- Normal internet access is acceptable.
- Rely on code review, git diff, and worktrees.
- Avoid unnecessary secret exposure.

### Medium-risk local projects

- Use Safehouse for filesystem containment.
- Add LuLu/Little Snitch/pf for outbound visibility/control.
- Avoid full environment pass-through.
- Pass only the API keys needed for the agent.

### High-risk local projects

- Prefer Gondolin.
- Use exact allowed hosts, not broad wildcards.
- Do not mount `.env`, cloud config, SSH keys, home directories, or Pi auth files.
- Keep Pi provider/subscription auth on the host; the guest does not need `~/.pi/agent/auth.json`.
- Use Gondolin secret placeholders for app/project credentials that guest commands legitimately need, rather than placing real secrets in the VM.
- Treat any host you allow as a possible exfiltration destination for any data the guest can read.

### Cloud projects

- Use short-lived, least-privilege tokens.
- Prefer provider-side secret injection if available.
- Avoid shipping private repos or credentials unless policy permits it.

## Docker and OrbStack rules

OrbStack should be your default Docker runtime for trusted development, but agent-controlled Docker is dangerous.

Rules:

- Do not expose the Docker engine over TCP.
- Do not mount `/var/run/docker.sock` into untrusted containers.
- Do not let Pi run arbitrary Docker commands in strict projects.
- Avoid `--privileged`, broad bind mounts, and `--net=host` for agent-controlled containers.
- Prefer starting required services yourself, then let Pi edit source code.
- Use isolated Docker daemons for autonomous agent work.

## Sandcastle positioning

Sandcastle is best understood as an **agent orchestration framework**.

Use it if you want:

- AFK agent runs.
- Worktree/branch management.
- Parallel implementation and review workflows.
- A programmable TypeScript API around agents.
- A provider model that can target Docker, Podman, Vercel, or custom sandboxes.
- Pi provider support for non-interactive runs.

Do not treat Sandcastle as the sandbox itself. Its security is only as strong as the provider:

- Docker/Podman provider: useful, but bind-mounted container isolation.
- Vercel provider: stronger cloud Firecracker-style isolation.
- Custom provider: could be strong if backed by Gondolin, microsandbox, or another microVM.

Recommendation: introduce Sandcastle later if you want automated branch/review workflows. It is not needed for the base security posture.

## Suggested phased setup

### Phase 1: Practical baseline

Do this first:

1. Create a `pi-agent` macOS user.
2. Install Pi for that user.
3. Install Safehouse.
4. Use git worktrees for agent work.
5. Install OrbStack for Docker/Compose.
6. Keep Pi away from unrestricted Docker access by default.

This gives immediate reduction in personal-data exposure and accidental host damage.

### Phase 2: Local high-risk Linux sandbox

Pilot Gondolin:

1. Install Gondolin prerequisites and use host Node 24 for Gondolin-backed runs until the Node 26 compatibility issue is fixed.
2. Smoke-test `gondolin exec` against a read-only project mount.
3. Add a project-local or reusable `pi-gondolin.ts` and launch Pi with `--no-extensions -e <gondolin-extension> --tools read,write,edit,bash` for the first parent-only pilot.
4. Mount only the project/worktree that the tools should operate on. Keep Pi subscription auth and live `~/.pi/agent/auth.json` host-side.
5. Test package installs, test commands, web dev servers, and file edits.
6. Add explicit allowed hosts and secret placeholder flows for real tasks.
7. Add a subagent-aware phase before using Gondolin with `pi-config`'s normal workflow: propagate the Gondolin extension to Pi-backed children, decide how to handle Claude-backed children, and either implement or intentionally restrict `grep`, `find`, and `ls`.
8. Decide whether Gondolin becomes the default for private high-risk work.

### Phase 3: Strong iOS isolation

Set up Tart:

1. Build or clone a macOS image with Xcode installed.
2. Keep no personal credentials in the VM.
3. Use it for risky or unsupervised native Apple development.

### Phase 4: Workflow automation

Only after the security layers are comfortable:

1. Try Sandcastle for AFK branch workflows.
2. Use Docker/Podman provider only for trusted repos.
3. Use Vercel/cloud provider for cloud-safe stronger isolation.
4. Consider writing a Gondolin-backed Sandcastle provider if the workflow is valuable.

## Default decisions

If choosing defaults today:

- **Default Docker runtime:** OrbStack.
- **Default local Pi wrapper:** Safehouse under a dedicated `pi-agent` macOS user.
- **Default risky private Linux sandbox:** Gondolin.
- **Default risky iOS sandbox:** Tart.
- **Default cloud ephemeral sandbox:** E2B.
- **Default orchestration layer:** none initially; Sandcastle if AFK branch automation becomes important.

## What to skip or deprioritize

- Hand-written `sandbox-exec` profiles from scratch. Use Safehouse instead.
- Treating OrbStack as a hostile-code sandbox.
- Mounting Docker sockets into agent-controlled containers.
- Moving iOS/Xcode development into Linux containers or Linux microVMs.
- Using WebContainers/V8 isolates as a general Pi development solution.
- Using gVisor/nsjail/Kata directly unless you are building infrastructure around them.

## Final recommendation

Use a layered, risk-based workflow:

1. **Everyday local work:** `pi-agent` macOS user + Safehouse + worktrees.
2. **Everyday Docker/full-stack:** OrbStack, with Pi constrained and Docker access intentional.
3. **Private risky Linux-compatible work:** Gondolin + Pi extension.
4. **Risky iOS/macOS work:** Tart macOS VM.
5. **Cloud-safe risky work:** E2B or Vercel/Sandcastle; Daytona if persistence matters.
6. **AFK multi-branch automation:** Sandcastle, but only with a provider appropriate to the risk.

This preserves the native macOS/iOS workflow while adding real isolation where it matters most.

## References

- Awesome Sandbox: https://github.com/restyler/awesome-sandbox
- OrbStack docs: https://docs.orbstack.dev
- Agent Safehouse: https://agent-safehouse.dev/docs/
- Tart: https://github.com/cirruslabs/tart
- Gondolin: https://github.com/earendil-works/gondolin
- Sandcastle: https://github.com/mattpocock/sandcastle
- E2B: https://e2b.dev/docs
- Daytona: https://www.daytona.io/docs/
- microsandbox: https://docs.microsandbox.dev/
- Apple container: https://github.com/apple/container
- Anthropic Sandbox Runtime: https://github.com/anthropic-experimental/sandbox-runtime
