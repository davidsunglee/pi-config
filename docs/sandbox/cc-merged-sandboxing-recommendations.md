# Sandboxing pi on macOS — merged recommendation

Date: 2026-05-12

Synthesis of two prior analyses
([cc-macos-agent-sandboxing-recommendations.md](./cc-macos-agent-sandboxing-recommendations.md),
[pi-macos-agent-sandboxing-recommendations.md](./pi-macos-agent-sandboxing-recommendations.md))
plus follow-up evaluation of
[agent-safehouse](https://github.com/eugene1g/agent-safehouse),
[gondolin](https://github.com/earendil-works/gondolin), and
[sandcastle](https://github.com/mattpocock/sandcastle).

Intended audience: the user of this repo running
[pi-mono](https://github.com/badlogic/pi-mono) on Apple Silicon for iOS, web,
and full-stack development.

## Constraints and threat model

- **Platform:** Apple Silicon Mac. Comfortable with VMs.
- **Workloads:** iOS (Xcode + Simulator), web, full-stack.
- **Agent:** pi-mono, mixed autonomy — supervised for risky work, unsupervised
  for routine refactors and test runs.
- **Repository sensitivity:** some private/proprietary (must stay local), some
  cloud-safe.
- **Threats to defend against — all four:**
  1. Accidental destruction (stray `rm -rf`, wrong `git push`, dotfile
     trashing).
  2. Prompt injection / supply chain (hostile instructions hidden in npm
     packages, scraped pages, MCP tool output).
  3. Network / data exfiltration (agent reaching arbitrary hosts).
  4. Secrets containment (`~/.ssh`, `~/.aws`, keychain, browser cookies,
     iCloud, signing keys).

## Three insights that drive everything else

These came out of merging both drafts and the follow-up tool evaluation. They
are the load-bearing claims; the rest of the document follows from them.

### 1. iOS forces a hard split

Xcode and the iOS Simulator are macOS-only and don't run inside Linux
containers, Firecracker, gVisor, E2B-style cloud sandboxes, or Gondolin (which
runs Linux guests). For iOS work the only isolation options are macOS-native:
dedicated user account, `sandbox-exec` profiles (via safehouse), or macOS VMs
(Tart on Apple Silicon).

Everything else can use stronger Linux-based isolation.

### 2. Pi has direct file tools that bypass any bash-level sandbox

Pi's tool surface includes `read`, `edit`, `write`, `grep`, `find`, and `ls`
in addition to bash. A sandbox that wraps only bash (e.g., the Anthropic
`@anthropic-ai/sandbox-runtime` pattern) does **not** constrain those direct
file tools.

Implication: any serious sandbox for pi must either

- run pi *itself* inside the boundary (devcontainer / Tart VM / Gondolin
  guest), so the file tools operate inside the sandboxed view of the
  filesystem, **or**
- gate pi's file tools at the agent layer via an extension that enforces a
  canonical deny list.

Wrapping just bash leaves the file tools as a hole.

### 3. Trust level cross-cuts workload type

The same iOS project can be your own trusted app vs. a downloaded sample with
unknown dependencies; the same web project can be a familiar codebase vs. a
hostile-looking repo you want the agent to investigate. So the right axes are
**workload × trust**, not just workload.

## The 2D recommendation

|                              | **Trusted**                                                                          | **High-risk / unknown**                                                                              |
| ---                          | ---                                                                                  | ---                                                                                                  |
| **iOS / macOS native**       | pi locally + tool-layer deny rules + safehouse `pi.sb` profile + git worktree        | Tart VM with its own Apple ID; pfctl or gateway-VM egress; clone repo *inside* the VM                |
| **Web / full-stack**         | OrbStack devcontainer; pi works on source only, you start services manually          | **Gondolin** microVM with egress allowlist + placeholder secrets + Pi extension; pi runs in guest    |
| **Untrusted code execution** | —                                                                                    | Gondolin locally as default; E2B when off-machine compute is specifically wanted                     |

Three baseline layers underneath every cell:

1. **Dedicated macOS user account** (`pi-agent`). Cheap one-time setup. Floor
   for TCC, login keychain, browser cookies, iCloud, Photos/Contacts, iMessage
   DB. Switch to it for any pi session.
2. **Pi tool-layer deny rules** for `read` / `edit` / `write` / `grep` /
   `find` / `ls` — enforces the canonical secret-path list below regardless
   of what bash can or can't do. Implement as a pi extension or via config.
3. **Host egress firewall**
   ([Little Snitch](https://www.obdev.at/products/littlesnitch/) or
   [LuLu](https://objective-see.org/products/lulu.html)). Covers the network
   axis on macOS-native cells where safehouse can't, and acts as a backstop
   anywhere a sandboxed egress policy could be misconfigured.

## Canonical deny-path list

To enforce at the pi tool-layer and inside any per-cell sandbox profile.

- `~/.ssh`
- `~/.aws`
- `~/.gnupg`
- `~/.config/gcloud`
- `~/.pi/agent/auth.json`
- `~/.claude/`, `~/.codex/`, `~/.openai/`, similar agent credential dirs
- Shell startup files: `.zshrc`, `.bashrc`, `.zprofile`, `.profile`, `.zshenv`
- `.env`, `.env.*`
- `*.pem`, `*.key`, `*.mobileprovision`, `*.p12`, signing material
- `~/Library/Keychains/`
- `~/Library/Cookies/`
- `~/Library/Application Support/Mail/`, `Messages/`, `iCloud Drive/`
- Unrelated repos and personal folders outside the active worktree

## Per-cell concrete setup

### iOS / macOS native — trusted

```text
1. Switch to the pi-agent macOS user.
2. git worktree add ../<project>-agent <branch>
3. cd ../<project>-agent
4. safehouse <pi-profile> -- pi
```

- The `<pi-profile>` is a custom safehouse profile (see "Tooling assessments"
  below). Largely copy-pasted from safehouse's Claude Code profile, since the
  shape is similar (TUI agent calling bash + direct file tools). Authoring it
  is a one-time cost.
- Worktree gives near-free rollback (`git worktree remove`).
- Pi tool-layer deny rules still apply on top.
- Little Snitch / LuLu running on the host catches anything safehouse can't
  block on the network side.

### iOS / macOS native — high-risk / unknown

```text
1. Launch a Tart macOS guest with its own Apple ID and Xcode preinstalled.
2. Clone the suspect repo inside the guest.
3. Run pi from inside the guest.
4. Apply a host firewall rule restricting the VM's egress to an allowlist.
```

- ~50 GB disk per guest with Xcode. Treat as durable infrastructure (one
  reusable "iOS untrusted" guest, snapshotted clean), not per-repo.
- Don't share host paths with the guest; copy code in, copy patches out.

### Web / full-stack — trusted

```text
1. From the pi-agent user, in a worktree:
2. orbstack open <project>     # or `docker compose up` against OrbStack
3. Pi works on source files inside the project directory.
4. You start and stop the service stack manually. Pi never runs `docker`.
```

- Use a `.devcontainer/devcontainer.json` if you want the agent inside the
  container; bind-mount only the project, never `~/.aws` / `~/.ssh`.
- Pi tool-layer deny rules still apply.
- **Do not mount the host Docker socket into agent-controlled containers.**

### Web / full-stack — high-risk / unknown

```text
1. Use the Pi + Gondolin extension.
2. Configure egress allowlist (e.g., npm, GitHub, the specific API the
   project legitimately calls).
3. Configure secret placeholders: real credentials live on the host,
   placeholders flow into the guest.
4. Launch pi inside the Gondolin guest.
```

- microVM-grade isolation; FS, network, and secrets all explicitly modelled.
- Snapshots / resumption for long sessions.
- Linux guest, so this does not help with iOS workloads.
- **Egress is open by default — you must opt in to enforcement.** Without
  `--allow-host` (CLI) or `httpHooks` (SDK), the guest can reach any host on
  the internet. The MITM proxy only enforces the allowlist when one is
  configured. Operationally: every Gondolin invocation for pi-config should
  pass an explicit allowlist; treat "no allowlist" as an unsafe default.

### Untrusted code execution (any workload)

```text
1. Default: Gondolin locally — same setup as above.
2. When off-machine compute matters (laptop fan, scaling, "I want this on
   someone else's hardware"): a pi extension that routes a Bash invocation
   to an E2B sandbox.
```

## Tooling assessments — keep / consider / skip

### Keep — load-bearing

| Tool                          | Role                                                                                                              |
| ---                           | ---                                                                                                               |
| **Dedicated macOS user**      | Baseline TCC / keychain / cookie wall. Cheap, one-time.                                                           |
| **agent-safehouse**           | macOS sandbox-exec profiles for iOS-trusted cell. Needs a custom `pi.sb` profile (no built-in pi support).        |
| **Tart**                      | macOS VM for iOS untrusted cell. The only way to fully isolate Xcode workflows.                                   |
| **OrbStack** (with devcontainers) | Default Docker/Compose runtime for trusted web/full-stack. Fast on Apple Silicon. Not a hostile-code sandbox. |
| **Gondolin**                  | Primary microVM for high-risk web/full-stack. Has a first-class Pi extension, egress allowlists, secret placeholders. Egress defaults to *open* — always pass an allowlist. |
| **Little Snitch / LuLu**      | Host-level egress firewall. Backstop for everything else.                                                         |
| **Git worktrees**             | Near-free per-task rollback. Already part of pi-config's `.worktrees/` pattern.                                   |
| **Pi extension(s)**           | Tool-layer deny rules for direct file tools; optional E2B/Gondolin routing for risky bash.                        |

### Consider — situational

| Tool                          | When to reach for it                                                                                              |
| ---                           | ---                                                                                                               |
| **E2B**                       | When you specifically want execution off your machine (untrusted external code, scaling, "not on my laptop").     |
| **Apple `container` CLI** (macOS 15+) | Forward-looking replacement for OrbStack devcontainers once mature; first-party VM-per-container.         |
| **Sandcastle**                | If you start *scripting* unattended pi batches. It's an orchestration layer, not a sandbox; isolation is whatever the provider gives. Adds nothing if you're using pi interactively. |
| **Daytona**                   | Persistent cloud workspace as an alternative to a laptop — different shape than the local-first stack here.       |
| **microsandbox** ([superradcompany/microsandbox](https://github.com/superradcompany/microsandbox)) | Native libkrun on Apple Silicon (no nested Linux host VM), <100 ms boot, OCI image support, MCP-server integration. **No pi integration ready** and **public docs don't surface an egress allowlist or host-side secret-substitution API** equivalent to Gondolin's `createHttpHooks`. Not a like-for-like Gondolin replacement until/unless those land. Worth reaching for when OCI image support or an MCP-driven sandbox-as-a-tool pattern (via your `pi-mcp-adapter`) is first-order. |
| **Hand-authored sandbox-exec profiles** | Only if safehouse fundamentally won't fit. Otherwise let safehouse maintain the SBPL.                   |

### Skip — wrong fit for this workflow

| Tool / category               | Why not                                                                                                            |
| ---                           | ---                                                                                                                |
| **Docker Desktop**            | OrbStack is faster, lighter, better integrated on Apple Silicon.                                                   |
| **Codespaces / Gitpod / Coder** | Full hosted IDEs. Overkill — pi already provides the editor locally.                                             |
| **WebContainers / Cloudflare Workers / V8 Isolates** | Language-runtime isolation; wrong shape for general-purpose dev needing filesystem, shell, arbitrary binaries. |
| **gVisor / nsjail / Kata directly** | Infrastructure primitives, not daily-use tools.                                                              |

## Implementation checklist

### Baseline for all projects

- [ ] Run pi from the `pi-agent` macOS user account, not your main account.
- [ ] Use a git worktree per non-trivial pi run.
- [ ] Enforce the canonical deny-path list at the pi tool layer.
- [ ] Install Little Snitch or LuLu on the host and configure deny-by-default
      for the pi-agent user.
- [ ] Keep secrets out of repo files; never pass full host env into agent
      processes.

### iOS-specific

- [ ] Write a safehouse `pi.sb` profile (start from the Claude Code profile)
      that allows Xcode, Simulator, CoreSimulator, and project paths while
      denying the canonical deny list.
- [ ] Maintain one reusable Tart guest with Xcode preinstalled for untrusted
      iOS work; snapshot it clean.
- [ ] Use a separate Apple ID for the Tart guest if you'll run external
      sample projects.

### Web / full-stack

- [ ] Per-project `.devcontainer/devcontainer.json` for trusted work; mount
      only the project; never mount `~/.aws`, `~/.ssh`, or the Docker socket.
- [ ] Install the Pi + Gondolin extension for high-risk work.
- [ ] Configure default Gondolin egress allowlist (npm registry, GitHub,
      common package CDNs); extend per project as needed.
- [ ] Configure Gondolin secret placeholders for any credential pi legitimately
      needs.

### Docker socket discipline

- [ ] Do not grant pi unrestricted `docker` access in strict projects.
- [ ] If pi must drive Docker for a task, prefer a microVM-isolated daemon
      (inside Gondolin) over the host OrbStack socket.
- [ ] You start Compose services manually; pi edits source.

## Gondolin operational notes (verified 2026-05-12)

Smoke-tested against this machine (Apple Silicon, macOS 26.4.1, QEMU 11.0.0,
Node v26, Gondolin `main` at commit `f2daf49`). Findings:

- **VM boot works** under `-accel hvf -cpu host` using the cached
  `alpine-base:latest` image (~108 MB after fetch). No host configuration
  changes were needed beyond `brew install qemu node` — both were already
  present.
- **Filesystem isolation is strong by default.** Inside the guest,
  `~/.ssh` / `~/.aws` / `/Users` simply don't exist. Nothing from the host
  is shared unless explicitly mounted via `--mount-hostfs`.
- **Egress defaults to open.** Without `--allow-host`, the guest can reach
  arbitrary internet hosts (verified by `curl example.com` returning 200).
  With `--allow-host api.github.com`, an unlisted host returns HTTP 403 from
  Gondolin's MITM proxy. **Always pass an allowlist for real use.**
- **Node v26 + Gondolin v0.9.1 (latest released) is broken.** Issue
  [#108](https://github.com/earendil-works/gondolin/issues/108) — `cbor.encode()`
  truncates output to 1 byte on Node v26, causing every VM to time out on
  guest readiness after 120 s. The fix (`cbor` → `cbor2`) landed on `main`
  as `f2daf49` on 2026-05-11 but is not yet in a release. Until v0.9.2 ships:
  build from `main` (`cd ~/Code/gondolin && pnpm install` — repo already
  uses dev-mode TS via `node bin/gondolin.ts`, no compile step required).
- **Invoke `node bin/gondolin.ts` directly** rather than `pnpm gondolin --`
  for any command containing multi-line bash or shell escapes — pnpm's
  argument forwarding mangles embedded newlines and re-escapes quotes.

## Pi authentication inside the Gondolin sandbox (verified 2026-05-12)

Goal: let pi running inside the Gondolin guest reach the model APIs using your
Claude and Codex *subscription* tokens, without ever exposing your refresh
tokens — or, if possible, your access tokens — to the guest.

### Pi's auth shape

`~/.pi/agent/auth.json` (mode 0600) stores credentials per provider:

```json
{
  "anthropic":    { "type": "oauth", "access": "...", "refresh": "...", "expires": <ms> },
  "openai-codex": { "type": "oauth", "access": "...", "refresh": "...", "expires": <ms>,
                    "accountId": "<UUID>" }
}
```

The `AuthStorage` class in `@earendil-works/pi-coding-agent/core/auth-storage.js`
exposes `AuthStorage.create()` and `await getApiKey(providerId)`, which loads,
checks expiry, transparently refreshes via the per-provider OAuth helpers
(`pi-ai/utils/oauth/{anthropic,openai-codex}.js`), and returns the current
access token. Concurrency is handled with `proper-lockfile`. **Reuse this on
the host side** — do not reimplement the OAuth refresh dance.

### Per-provider endpoints

| Provider | Refresh URL (host-only) | Inference host (guest needs allow) | Auth headers |
| --- | --- | --- | --- |
| `anthropic` | `platform.claude.com/v1/oauth/token` | `api.anthropic.com` | `Authorization: Bearer <access>` + Claude Code identity headers |
| `openai-codex` | `auth.openai.com/oauth/token` | `chatgpt.com/backend-api` (HTTP SSE **and** WebSocket) | `Authorization: Bearer <access>` + `chatgpt-account-id: <id>` + `originator: pi` |

The Codex provider extracts `accountId` from the JWT payload claim
`"https://api.openai.com/auth".chatgpt_account_id` on **every** request, not
from the credential record. The placeholder for codex must therefore be a
JWT-shaped string with the real `accountId` in that claim. The signature can
be any base64url string; pi does not appear to verify it.

### Gondolin's secret API (relevant facts)

`createHttpHooks({ allowedHosts, secrets })` returns `{ httpHooks, env,
secretManager }`. Key shape:

```ts
type SecretDefinition = {
  hosts: string[];                          // host patterns this secret may be sent to
  value: string;                            // real value (static at registration)
  placeholder?: string | (() => string);    // guest-visible token (generator called once)
};

secretManager.updateSecret(name, { value?, hosts? });   // runtime value rotation
secretManager.deleteSecret(name);
```

Substitution covers Authorization headers, request bodies, and Basic-auth
base64. A `revokedValues` list keeps prior values and the proxy refuses to
forward them — defense-in-depth against the agent learning a value through
any out-of-band channel.

`secret.value` is static at registration but **`secretManager.updateSecret`
supports runtime value rotation**, which is the pivot point for host-managed
refresh.

### Recommended architecture: host-managed refresh + runtime secret updates

1. Host extension uses pi's `AuthStorage` against the real
   `~/.pi/agent/auth.json` to fetch the current access tokens at VM start.
2. Build `createHttpHooks({ allowedHosts, secrets: { ANTHROPIC_OAUTH_TOKEN,
   OPENAI_CODEX_TOKEN } })` with the fresh values and generated placeholders.
   Pass `httpHooks` and `env` into `VM.create()` alongside the workspace VFS.
3. After VM ready, the host writes a synthetic `~/.pi/agent/auth.json` *inside
   the guest* via `vm.exec`. Synthetic entries use:
   - `access`: the placeholder
   - `refresh`: a garbage string (never used)
   - `expires`: far future (e.g., year 9999) so guest pi never attempts refresh
   - `accountId` (codex only): the real UUID, copied from host auth.json
4. Set a periodic timer on the host (e.g., every 10 min) that re-fetches the
   provider tokens via `authStorage.getApiKey()` (triggers refresh under pi's
   own locking) and calls `secretManager.updateSecret(name, { value: fresh })`
   when the value rotates.
5. Allowlist: inference hosts (`api.anthropic.com`, `chatgpt.com`) plus the
   minimum needed for the task (e.g., `registry.npmjs.org`, `github.com`,
   `api.github.com`). **Do not allow** the refresh hosts
   (`platform.claude.com`, `auth.openai.com`) — guest pi never refreshes;
   refresh happens host-side.
6. Workspace mount stays the project directory. `~/.pi/agent` is *not*
   mounted from the host; the synthetic auth.json lives only in the guest.

### Two-pass implementation order

**Pass 1 — Anthropic only.** Single HTTPS endpoint, no JWT, no WebSocket.
Validates the architecture (placeholder substitution in `Authorization`
header, runtime refresh via `updateSecret`, guest pi reading synthetic
auth.json) without fighting wrinkles.

**Pass 2 — Add Codex.** Adds the JWT-decoy placeholder and the WebSocket
path. If WebSocket substitution is not supported (see open question below),
fall back to placing the real (host-refreshed) access token in the guest for
codex only — refresh token still stays on host.

### Substitution coverage — what we verified empirically (2026-05-12)

A standalone test (`/tmp/gondolin-ws-test/server.mjs` — small Node HTTP
server logging incoming headers) plus reading Gondolin's qemu HTTP
implementation pinned down the substitution boundary.

| Scenario                                            | Substitution applies? | Evidence |
| ---                                                 | ---                   | --- |
| HTTPS request, any header (`Authorization`, body)   | ✅ Yes                | curl from guest → httpbin.org/headers; `httpbin` received `Authorization: Bearer REAL_VALUE_xyz123456789` (real), not the placeholder. |
| HTTPS WebSocket upgrade, `Authorization` in upgrade | ✅ Yes                | `qemu/http.ts:1723` — `handleWebSocketUpgrade` calls `applyRequestHooks`, which invokes `applySecretsToRequest`. WS-specific stripping (`stripHopByHopHeadersForWebSocket`) preserves `Authorization`. |
| WebSocket frames *after* upgrade                    | ❌ No                 | `qemu/http.ts:632` — "upgraded connections become opaque tunnels." Irrelevant for codex: auth is in the upgrade request, not in frames. |
| Plain HTTP request                                  | ❌ No                 | Same curl test against a local plain-HTTP server through `--tcp-map`: the host server received the placeholder verbatim. The MITM only intercepts HTTPS (CONNECT-tunneled); plain HTTP appears to be relayed raw. |

So **anthropic's HTTPS endpoint and codex's HTTPS WebSocket transport are
both covered** by placeholder substitution. The architecture works.

Operational implication: if any provider were ever to fall back to plain HTTP
for any reason, substitution would silently fail. Stick to providers that
mandate HTTPS (both anthropic and openai-codex do).

### Open question still to verify

- **Pi's JWT extraction strictness.** Source looks like plain base64url
  decode + JSON parse with no signature validation, so a fake JWT with the
  real `accountId` should work. Worth a five-minute confirmatory read of
  `openai-codex-responses.js` `extractAccountId` before depending on it.

### Threat model recap

- ✅ Refresh tokens never enter the guest.
- ✅ For Anthropic: access tokens are placeholders; guest never holds the
  real value.
- ✅ For Codex: WebSocket upgrade headers also get substitution (verified
  empirically + by code reading). Access token never enters guest in
  cleartext when the JWT-decoy placeholder approach is used.
- ✅ Egress is constrained to a small allowlist; arbitrary exfiltration
  blocked.
- ⚠️ Quota burn: the agent can still spend your subscription against
  allowed endpoints. Same as raw API key sandboxing. Bound by usage limits,
  not by this setup.
- ⚠️ Subscription ToS: routing personal tokens through a local VM is in
  spirit personal use, but device fingerprinting could surface as auth
  failures. No reports of this for similar workflows (Claude Code in
  Docker, etc.), but not zero risk.

## Claims to verify before relying on

A few details from prior analyses and secondary sources look plausible but
were not directly confirmed. Verify before treating as fact.

- **Pi's "example sandbox extension based on `@anthropic-ai/sandbox-runtime`":**
  `sandbox-runtime` is part of Claude Code's ecosystem; whether a pi extension
  exposes it isn't confirmed. Check `agent/extensions/` and pi-mono upstream
  before assuming it exists.
- **safehouse CLI shape (`--enable=xcode -- pi`):** The README I read uses
  `safehouse [agent-name] [options]` with `--add-dirs-ro` / `--append-profile`.
  The `--enable=...` flag form may be inaccurate; check current safehouse docs
  before scripting.
- **`agent-safehouse.dev/docs/` URL:** The project is at
  `github.com/eugene1g/agent-safehouse`. The separate docs domain may not
  exist; rely on the GitHub README until confirmed.
- **"Docker Sandboxes" as a named product:** Ambiguous reference. If choosing
  it, pin down which specific Docker Inc. or community offering is meant.

## Bottom line

For this workflow:

- **Trusted iOS / macOS:** pi on a dedicated user account + safehouse + git
  worktree + pi tool-layer deny rules + host egress firewall.
- **Untrusted iOS:** Tart VM with its own Apple ID, clone-inside.
- **Trusted web / full-stack:** OrbStack devcontainer, pi on source only, you
  drive Docker.
- **Untrusted or high-risk web / full-stack:** **Gondolin** — first-class pi
  integration, microVM isolation, programmable egress + secret placeholders.
- **Off-machine compute when wanted:** E2B via a pi extension.
- **Skip:** Sandcastle (orchestration, not isolation), Docker Desktop
  (replaced by OrbStack), microsandbox on Mac, hosted IDEs.

The single most important addition over the original drafts is **Gondolin**,
which closes the network-egress and secret-placeholder gaps that safehouse
and OrbStack-only setups leave open, and which already ships with a pi
extension. The single most important correction is enforcing the **canonical
deny-path list at pi's tool layer**, not just at the bash layer — Pi's direct
file tools bypass any bash-only sandbox.

## Sources

- [awesome-sandbox README (restyler)](https://github.com/restyler/awesome-sandbox)
- [agent-safehouse (eugene1g)](https://github.com/eugene1g/agent-safehouse)
- [gondolin (earendil-works)](https://github.com/earendil-works/gondolin)
- [sandcastle (mattpocock)](https://github.com/mattpocock/sandcastle)
- [Tart — macOS/Linux VMs on Apple Silicon](https://github.com/cirruslabs/tart)
- [OrbStack](https://orbstack.dev/)
- [Apple `container` CLI](https://github.com/apple/container)
- [E2B](https://e2b.dev)
- [Daytona](https://www.daytona.io)
- [Little Snitch](https://www.obdev.at/products/littlesnitch/) /
  [LuLu](https://objective-see.org/products/lulu.html)
- [pi-mono](https://github.com/badlogic/pi-mono)
