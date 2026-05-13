# Pi + Agent Safehouse

Daily-driver sandbox configuration for running Pi on macOS under
[Agent Safehouse](https://agent-safehouse.dev/docs/). Safehouse is a
deny-by-default `sandbox-exec` policy composer that wraps the entire Pi
process — including Pi's direct `read`/`write`/`edit` tool calls, not just
its `bash` subprocesses.

This directory is tracked configuration only. It contains:

```
safehouse/
  README.md                                  # this file
  bin/
    pi-safe                                  # daily Pi under Safehouse
    pi-ios                                   # Pi + --enable=xcode
    pi-ios-debug                             # Pi + --enable=xcode,lldb (opt-in)
  profiles/
    pi-local-overrides.example.sb            # per-machine overlay template
    pi-strict-deny.example.sb                # stricter deny-oriented template
  smoke/
    pi-safehouse-smoke.sh                    # offline smoke checks
```

Machine-specific state lives outside the repo:

```
~/.config/agent-safehouse/pi-local-overrides.sb   # active overlay (optional)
~/.local/bin/pi-safe        -> .../safehouse/bin/pi-safe
~/.local/bin/pi-ios         -> .../safehouse/bin/pi-ios
~/.local/bin/pi-ios-debug   -> .../safehouse/bin/pi-ios-debug
```

This setup is intentionally kept inside `pi-config` rather than a dedicated
repo. If the configuration grows into reusable install/bootstrap tooling
needed outside `pi-config`, revisit that decision.

For the broader sandboxing context (Gondolin, Tart, OrbStack, cloud
sandboxes), see
[`../docs/sandbox/pi-merged-macos-agent-sandboxing-recommendations.md`](../docs/sandbox/pi-merged-macos-agent-sandboxing-recommendations.md).

## Install

1. Install Safehouse (Homebrew):

   ```bash
   brew install agent-safehouse
   safehouse --version
   ```

   Or follow the install instructions at <https://agent-safehouse.dev/docs/>.

2. Symlink the wrappers onto `PATH`. From this repo root:

   ```bash
   mkdir -p ~/.local/bin
   ln -sf "$PWD/safehouse/bin/pi-safe"       ~/.local/bin/pi-safe
   ln -sf "$PWD/safehouse/bin/pi-ios"        ~/.local/bin/pi-ios
   ln -sf "$PWD/safehouse/bin/pi-ios-debug"  ~/.local/bin/pi-ios-debug
   ```

   Confirm `~/.local/bin` is on `PATH` (most zsh setups already include it).

3. Optionally install the per-machine overlay template:

   ```bash
   mkdir -p ~/.config/agent-safehouse
   cp safehouse/profiles/pi-local-overrides.example.sb \
      ~/.config/agent-safehouse/pi-local-overrides.sb
   ```

   The wrappers detect this file automatically. If it does not exist, the
   wrappers skip `--append-profile` silently. The path can be overridden via
   the `PI_SAFEHOUSE_OVERRIDES` environment variable.

4. Run the smoke tests:

   ```bash
   ./safehouse/smoke/pi-safehouse-smoke.sh
   ```

## Dedicated macOS user (recommended)

Run Safehouse under a dedicated macOS user (e.g. `pi-agent`) for daily Pi
work. Safehouse's built-in Pi profile grants access to `~/.pi`, which
includes Pi auth/config/session state. A dedicated user reduces exposure to
the primary user's keychain, browser profiles, SSH keys, documents, and
personal cloud credentials *before* Safehouse policy is even consulted.

Without this separation, a compromise that bypasses or misuses Safehouse
falls back onto the primary user's full home directory.

## Wrappers

| Wrapper | Safehouse args | Use for |
| --- | --- | --- |
| `pi-safe` | `--workdir="$PWD"` | Everyday Pi work outside Xcode/iOS. |
| `pi-ios` | `--workdir="$PWD" --enable=xcode` | `xcodebuild`, Simulator, `simctl`, `devicectl`, SwiftPM cache state, Xcode developer roots. |
| `pi-ios-debug` | `--workdir="$PWD" --enable=xcode,lldb` | Only when debugger/task-port access is required. Implies process-control. |

All three wrappers append `~/.config/agent-safehouse/pi-local-overrides.sb`
if present. They forward every argument to `pi`.

### Choosing a wrapper

- Default to `pi-safe`.
- Switch to `pi-ios` when the task involves Xcode/Simulator/SwiftPM tooling.
- Reach for `pi-ios-debug` only for actual LLDB/task-port debugging, then
  go back to `pi-ios`. The `lldb` feature implies `process-control` and
  widens what host processes Pi can enumerate and signal.
- For high-risk native Apple work, escalate to a Tart macOS VM instead of
  relying on Safehouse alone.

## Default policy posture

Safehouse defaults are the baseline. The wrappers do not opt in to anything
beyond what's listed above. In particular, these features stay disabled by
default and must be passed explicitly when needed:

| Feature | Why it's off by default |
| --- | --- |
| `docker` | Docker socket access is broadly equivalent to root on the host. |
| `ssh` | SSH agent access enables arbitrary remote auth. |
| `cloud-credentials` | Allows reads from `~/.aws`, `~/.config/gcloud`, etc. |
| `keychain` | Allows the agent to read/write the user keychain. |
| `clipboard` | Pasteboard access is a side channel for secrets. |
| `wide-read` | Grants read-only visibility across `/`. |
| `process-control` / `lldb` | Enables host process enumeration/signalling. |
| `--trust-workdir-config` | Trusts in-repo `.safehouse` files; never enable in untrusted repos. |
| `--env` | Inherits the entire host environment, including secrets. |

### Default filesystem behavior

- The selected `--workdir` is read/write.
- Safehouse does not automatically widen a nested workdir to the enclosing
  Git repo. Broaden explicitly with `--add-dirs` or `--add-dirs-ro` when
  needed.
- Home-directory access is not recursive. Safehouse grants metadata/root
  traversal plus narrow config/cache discovery; arbitrary `~/Documents` or
  `~/Library` reads stay blocked.
- Existing linked worktrees launched from a worktree root are visible
  read-only.

### Network is not contained

Safehouse is filesystem and process hardening. **Network is open by
default.** Do not treat Safehouse as an egress boundary.

- For medium-risk local work that needs outbound visibility, pair Safehouse
  with LuLu, Little Snitch, or `pf`.
- For high-risk Linux-compatible work, use Gondolin (see
  [`pi-gondolin-sandbox`](https://github.com/badlogic/pi-gondolin-sandbox)
  if/when that repo lands; the broader threat model is in
  [`../docs/sandbox/pi-merged-macos-agent-sandboxing-recommendations.md`](../docs/sandbox/pi-merged-macos-agent-sandboxing-recommendations.md)).
- For high-risk native Apple work, use Tart.

## Common one-off flags

### Add a read-only context path

```bash
pi-safe --add-dirs-ro=/Users/david/Code/shared-lib
```

Use this when Pi needs to read a sibling repo or shared library while
staying scoped to the current workdir for writes.

### Add a temporary read/write path

```bash
pi-safe --add-dirs=/Users/david/Code/some-repo
```

Prefer this over launching from the repo root when only a nested directory
should normally be writable. Avoid blanket `--add-dirs=$HOME`.

### Pass selected environment variables

```bash
pi-safe --env-pass=ANTHROPIC_API_KEY,OPENAI_API_KEY
```

Always prefer `--env-pass` over `--env`. `--env` inherits the full host
environment, including secrets the current task should not see.

For a project-specific env file:

```bash
pi-safe --env=/path/to/project.env
```

`--env=FILE` sources the file with `/bin/bash`, so the file must be
trusted shell input — not arbitrary dotenv-style data.

## Local overrides

`~/.config/agent-safehouse/pi-local-overrides.sb` is appended to the
generated Safehouse policy via `--append-profile`. It uses sandbox-exec's
Scheme-like syntax. Common uses:

- Adding a stable read-only path that you do not want to pass on every
  invocation.
- Hard-denying a path that Safehouse's defaults would otherwise allow
  (`deny` rules placed after Safehouse's generated `allow` rules win,
  because sandbox-exec is last-match-wins).

See [`profiles/pi-local-overrides.example.sb`](profiles/pi-local-overrides.example.sb)
for templates. For a stricter ready-to-adapt deny set covering credentials,
shell init files, browser profiles, and Pi auth, see
[`profiles/pi-strict-deny.example.sb`](profiles/pi-strict-deny.example.sb).

Never enable `--trust-workdir-config` for untrusted repos; that flag tells
Safehouse to load a `.safehouse` file from the workdir itself.

## Why Safehouse is not a VM boundary

Safehouse is a `sandbox-exec` policy. It enforces filesystem and process
restrictions at the macOS kernel level for a single process tree, but:

- It does not isolate the kernel — kernel exploits cross the boundary.
- It does not contain network traffic.
- It does not protect against TCC/private-framework attacks against
  Apple's own surfaces.
- It shares the host filesystem; "denied" paths exist on the same volume.

For threats that need a real isolation boundary, escalate:

- **High-risk Linux-compatible work** → Gondolin (Linux microVM with
  programmable network policy and Pi tool overrides).
- **High-risk native Apple work** → Tart (macOS VM with a clean Xcode
  image; no personal credentials inside).
- **Cloud-acceptable risky work** → E2B/Vercel/Daytona; see the merged
  recommendations doc.

## Relationship to other sandbox work

- `pi-gondolin-sandbox` (separate repo) — Gondolin-backed Pi tool execution
  in a Linux microVM. Different boundary; different risk class.
- `claude-srt-launcher` (separate repo) — SRT-backed Claude Code launcher
  with its own policy surface.
- This `safehouse/` directory — daily-driver local Pi hardening on macOS.
  No dedicated repo unless and until it grows reusable install/bootstrap
  tooling.

## Smoke tests

`smoke/pi-safehouse-smoke.sh` verifies:

1. `safehouse` and `pi` are on `PATH`.
2. The three wrapper scripts exist and are executable.
3. `pi-safe --version` starts Pi under Safehouse and produces version
   output.
4. Read/write inside a temporary `--workdir` is allowed.
5. Reading a file in a separate temporary directory is denied.
6. `safehouse --enable=xcode` can run `xcodebuild -version` (skipped if
   Xcode command-line tools are not installed).

Run from anywhere:

```bash
./safehouse/smoke/pi-safehouse-smoke.sh
```

The script exits non-zero if any non-skipped check fails.
