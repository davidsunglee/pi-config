# Web Browser skill

Use Chrome or Chromium through the Chrome DevTools Protocol (CDP) for interactive web exploration, screenshots, DOM inspection, and simple page automation.

## When to use

Use when the agent needs to inspect or interact with web pages: navigate sites, click controls, fill forms, capture screenshots, inspect DOM state, dismiss cookie banners, or observe console/network activity.

## Browser setup

Run from the skill directory:

```bash
./scripts/start.js              # fresh temporary profile
./scripts/start.js --profile    # copy the user's profile for cookies/logins
```

Chrome starts with remote debugging on port `9222`. If Chrome is not in a standard location, set `BROWSER_BIN=/path/to/chrome`.

## Common commands

```bash
./scripts/nav.js https://example.com        # navigate active tab
./scripts/nav.js https://example.com --new  # open a new tab
./scripts/eval.js 'document.title'          # evaluate JavaScript in the active tab
./scripts/screenshot.js                     # capture current viewport
./scripts/pick.js "Click the submit button" # interactively select elements
./scripts/dismiss-cookies.js                # accept cookie dialogs where possible
./scripts/dismiss-cookies.js --reject       # reject cookie dialogs where possible
```

## Logging and network inspection

`start.js` starts background logging automatically. Logs are JSONL files under:

```text
~/.cache/agent-web/logs/YYYY-MM-DD/<targetId>.jsonl
```

Useful helpers:

```bash
./scripts/watch.js
./scripts/logs-tail.js
./scripts/logs-tail.js --follow
./scripts/net-summary.js
```

## Script inventory

- `cdp.js` — shared CDP connection helper.
- `start.js` — launch Chrome/Chromium with remote debugging.
- `nav.js` — navigate active tab or open a new one.
- `eval.js` — evaluate JavaScript in the active page.
- `screenshot.js` — capture the current viewport.
- `pick.js` — interactive element picker.
- `dismiss-cookies.js` — handle common cookie consent dialogs.
- `watch.js` — collect console/error/network logs.
- `logs-tail.js` — inspect current logs.
- `net-summary.js` — summarize network responses.
- `package.json` / `package-lock.json` — script dependencies.

## Notes

JavaScript snippets passed to `eval.js` run in an async context. Prefer single quotes around shell arguments to reduce escaping problems.

## Files

- `SKILL.md` — concise command reference for the browser workflow.
- `scripts/` — CDP helper scripts and package metadata.
