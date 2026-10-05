# AppMetrica MCP — Yandex App Metrica MCP server for Claude and AI agents

[![AgentHub 已收录：appmetrica-mcp](https://myagenthub.cn/badge/io.github.pavellunev/appmetrica-mcp)](https://myagenthub.cn/p/io.github.pavellunev/appmetrica-mcp)
[![npm version](https://img.shields.io/npm/v/appmetrica-mcp)](https://www.npmjs.com/package/appmetrica-mcp)
[![license](https://img.shields.io/npm/l/appmetrica-mcp)](LICENSE)

![AppMetrica MCP](assets/preview.png)

MCP server for [AppMetrica](https://appmetrica.yandex.com) — Yandex's mobile analytics platform. Gives Claude direct access to your app's analytics: reports, funnels, dashboards, raw event logs, crash data, and push notification campaigns — and can create funnels and segments in AppMetrica itself.

> **Update 0.3.0 (October 2026).** The server now *builds* analytics in AppMetrica, not only reads it: saved funnels and segments through the Management API, and real workspaces/dashboards through an experimental logged-in Chrome session (`web_*` tools, one-time `npx appmetrica-mcp login`). Also new: time series (`get_report_bytime`), a docs-derived catalogue of 197 metrics, all 13 Logs API tables, `audit_events` and the `analytics_setup` workflow prompt. Full list in [CHANGELOG.md](CHANGELOG.md).

## Why

AppMetrica keeps mobile product analytics (users, sessions, events, funnels, retention, revenue, crashes) behind a web UI and several HTTP APIs. This MCP server puts all of it behind one set of tools, so an AI agent such as Claude can answer and act on questions like:

- "How did DAU, new users and crash-free sessions change this week?"
- "Build a funnel from first launch to purchase and save it in AppMetrica."
- "Which events does the app send, which ones are dead, and what is missing for a registration funnel?"
- "Create a workspace with audience, revenue and funnel widgets for the marketing team."
- "Export raw purchase events for September and compare countries."

It works with Claude Code, Claude Desktop and any other MCP client, and is listed in the [official MCP Registry](https://registry.modelcontextprotocol.io) as `io.github.pavellunev/appmetrica-mcp`.

## Features

- **Reporting API** — aggregated metrics (users, sessions, revenue, crashes, events, ...) with dimension breakdowns, time series (`bytime`), filters, sorting and sampling control
- **Funnels** — step-by-step funnel reports for saved web-UI funnels or ad-hoc steps, with absolute/relative conversion; create, update and delete saved funnels
- **Dashboards & Workspaces** — preset or custom widget sets computed from the Reporting API; named widget sets saved locally as workspaces
- **Web session (experimental)** — create and manage real AppMetrica workspaces (dashboards) and widgets through a logged-in headless Chrome session (`web_*` tools; the public API cannot do this)
- **Segments** — list saved segments and apply them to any report via `segment_id`; create, update and delete segments
- **Event audit** — `audit_events` compares registered events with real volumes and reports instrumentation gaps
- **Workflow prompt** — `analytics_setup` walks an agent through analysing an app, building funnels/segments/dashboards and listing instrumentation gaps
- **Logs API** — raw exports for all 13 tables (events, crashes, errors, installations, sessions, deeplinks, postbacks, clicks, push tokens, profiles, revenue, e-commerce, ad revenue)
- **Management API** — applications, event names, conversions, Logs API status
- **Push API** — view campaigns and statistics; create campaigns when write mode is enabled
- **Safe by default** — write operations (push campaigns, funnels, segments) are disabled unless you explicitly opt in

## Requirements

- Node.js 22+
- An AppMetrica account with at least one application
- A Yandex OAuth token (see below)
- Optional, only for the experimental `web_*` tools: Google Chrome and a one-time `npx appmetrica-mcp login` (see Web session)

## Getting an OAuth Token

### Option A — one command (recommended)

```bash
npx appmetrica-mcp auth
```

The wizard opens a Chrome window on the Yandex consent page (the same Chrome profile the web-session tools use, so after the first time you are already logged in), you click **Разрешить**, and the wizard takes the confirmation code from the page URL itself — nothing to copy. The token is saved to `~/.config/appmetrica-mcp/credentials.json` (mode 0600; Yandex tokens live about a year, after that just run `auth` again) and the server picks it up automatically — no `APPMETRICA_OAUTH_TOKEN` needed. At the end the wizard offers to log in to the AppMetrica **web session** as well (only needed for the `web_*` workspace tools).

Details:
- Standard OAuth 2.0 authorization-code flow with PKCE against the bundled public `appmetrica-mcp` OAuth app; no client secret is involved.
- Needs Google Chrome (or `APPMETRICA_BROWSER_PATH` / `APPMETRICA_BROWSER_CHANNEL`). Without it, or over SSH, use `npx appmetrica-mcp auth --manual`: your default browser opens the same page, Yandex shows the code and you paste it into the terminal.
- Your own Yandex OAuth app instead of the bundled one: set `APPMETRICA_OAUTH_CLIENT_ID` (Redirect URI `https://oauth.yandex.ru/verification_code`, AppMetrica read/write access). If that app also registers `http://127.0.0.1:8742/callback`, `--loopback` runs a local callback server instead of Chrome (`APPMETRICA_OAUTH_PORT` changes the port).
- The MCP server itself never opens a browser: if no token is found, tools answer with a short "run `npx appmetrica-mcp auth`" message.

### Option B — paste a token yourself

Use the **Russian OAuth portal** (`oauth.yandex.ru`) — the international version (`oauth.yandex.com`) does not expose AppMetrica scopes in its UI.

1. Go to [oauth.yandex.ru/client/new](https://oauth.yandex.ru/client/new), name the app, choose **Web services** and set the Callback URI to `https://oauth.yandex.ru/verification_code`.
2. Under **Доступы (Access)** → **AppMetrica** enable `Чтение данных AppMetrica` (required) and `Запись данных AppMetrica` (optional, for write tools). Copy the **ClientID**.
3. Open `https://oauth.yandex.ru/authorize?response_type=token&client_id=CLIENT_ID`, log in, authorize, copy `access_token` from the redirect URL and pass it as `APPMETRICA_OAUTH_TOKEN`.

> Tokens do not expire by default; revoke them anytime at [passport.yandex.ru/profile/access](https://passport.yandex.ru/profile/access). An env token always wins over the saved credentials file.

## Installation

### Claude Code (recommended)

```bash
claude mcp add appmetrica -- npx -y appmetrica-mcp
npx appmetrica-mcp auth   # one-time browser login (or pass -e APPMETRICA_OAUTH_TOKEN=... instead)
```

To enable write operations (push campaigns, creating/updating/deleting funnels and segments):

```bash
claude mcp add appmetrica \
  -e APPMETRICA_ALLOW_WRITE=true \
  -- npx -y appmetrica-mcp
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "appmetrica": {
      "command": "npx",
      "args": ["-y", "appmetrica-mcp"],
      "env": {
        "APPMETRICA_ALLOW_WRITE": "true"
      }
    }
  }
}
```

### Building from source

```bash
git clone https://github.com/pavellunev99/app_metrica_mcp
cd app_metrica_mcp
npm install
npm run build
```

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `APPMETRICA_OAUTH_TOKEN` | No | — | Yandex OAuth token; optional when `npx appmetrica-mcp auth` saved one (env wins) |
| `APPMETRICA_CREDENTIALS_FILE` | No | `~/.config/appmetrica-mcp/credentials.json` | Where `auth` stores the token |
| `APPMETRICA_OAUTH_CLIENT_ID` | No | bundled public app | Your own Yandex OAuth app ClientID for `auth` |
| `APPMETRICA_OAUTH_PORT` | No | `8742` | Port of the `auth --loopback` callback server (ignored by the default Chrome flow) |
| `APPMETRICA_ALLOW_WRITE` | No | `false` | Set to `true` to enable write tools: push campaign creation, funnel and segment create/update/delete |
| `APPMETRICA_WORKSPACES_FILE` | No | `~/.config/appmetrica-mcp/workspaces.json` | JSON file where local workspaces (saved dashboard widget sets) are stored |
| `APPMETRICA_BROWSER_PROFILE` | No | `~/.config/appmetrica-mcp/chrome-profile` | Chrome profile directory that holds the Yandex login for the experimental `web_*` tools |
| `APPMETRICA_BROWSER_PATH` | No | — | Path to a Chrome/Chromium executable (overrides the channel) |
| `APPMETRICA_BROWSER_CHANNEL` | No | `chrome` | Browser channel for the web session: `chrome`, `chromium`, `msedge`, ... |
| `APPMETRICA_BROWSER_IDLE_MS` | No | `120000` | Idle time after which the headless web session closes Chrome and frees the profile (so `login` can run) |

## Available Tools

### Management

| Tool | Description |
|---|---|
| `list_applications` | List all AppMetrica applications in your account |
| `get_application` | Get details for a specific application by ID |
| `list_events` | List client event names of an application (use them as funnel steps) |
| `list_conversions` | List configured conversions (attributed events) |
| `get_logs_api_status` | Check whether the Logs API is enabled for the account |

### Reporting

| Tool | Description |
|---|---|
| `get_report` | Aggregated metrics for a date range, with `filters`, `sort`, `segment_id`, `currency`, `accuracy`, `include_undefined`, `lang`, `offset` |
| `get_report_bytime` | The same as a time series (`group`: day / week / month / hour / all). One namespace prefix per call |
| `get_drilldown` | Drill down into a dimension value for detailed breakdown |
| `list_metrics` | Metric/dimension catalogue (197 metrics, 188 dimensions): compact overview, or `search` / `namespace` / `kind` / `limit` for entries |
| `audit_events` | Event instrumentation audit for a period: registered vs active vs zero-volume events, optional `expected_events`, plain-language findings (read-only) |

### Segments

| Tool | Description |
|---|---|
| `list_segments` | List saved segments (id, name, expression) |
| `get_segment` | Get one segment with all fields |

### Funnels

| Tool | Description |
|---|---|
| `list_funnels` | List saved funnels with decoded steps and options |
| `get_funnel_report` | Per-step devices and conversion for a saved funnel (`funnel_id`) or ad-hoc `steps` |

### Dashboards & Workspaces

| Tool | Description |
|---|---|
| `get_dashboard` | Run preset widgets (`widgets`) or a saved workspace (`workspace`) for a date range |
| `list_dashboard_presets` | List preset widgets with their metrics |
| `list_workspaces` | List locally saved workspaces |
| `get_workspace` | Get a workspace with its widget specs |
| `save_workspace` | Create or update a local workspace (local file only) |
| `delete_workspace` | Delete a local workspace (local file only) |

### Web session (experimental)

Unofficial tools that drive the AppMetrica web UI's internal API through a logged-in headless Chrome — see [Web session](#web-session-experimental-workspaces--dashboards-in-appmetrica). Every tool needs `npx appmetrica-mcp login` once; tools marked Write also need `APPMETRICA_ALLOW_WRITE=true`.

| Tool | Access | Description |
|---|---|---|
| `web_session_status` | Read | Check the web session: logged in, Yandex login, profile directory |
| `web_list_workspaces` | Read | List the app's AppMetrica workspaces (system + custom) |
| `web_get_workspace` | Read | One workspace: groups, headers and widgets with names, metrics, dimensions |
| `web_list_widget_presets` | Read | Web preset widgets (`widget_id` = `preset` value), optional `category` |
| `web_list_report_namespaces` | Read | Report namespaces with their Reporting API prefix; with `namespace_id` the valid metrics and dimensions |
| `web_create_workspace` | Write | Create a workspace with `groups` (`{header?, widgets?}`) in one call |
| `web_add_widgets` | Write | Add a row of widgets to a workspace (`position` optional) |
| `web_add_header` | Write | Add a section header row |
| `web_rename_workspace` | Write | Rename a workspace |
| `web_remove_widget` | Write | Remove a widget by `dashboard_widget_id` |
| `web_delete_workspace` | Write | Delete a custom workspace (system `<appId>/…` dashboards are refused) |
| `web_push_workspace` | Write | Create an AppMetrica workspace from a local one (`workspace`, optional `name`) |

### Logs

| Tool | Description |
|---|---|
| `export_events` | Export raw custom event logs |
| `export_crashes` | Export raw crash logs |
| `export_installations` | Export raw installation logs |
| `export_logs` | Export any Logs API table (13 tables), with field validation; `push_tokens` needs no dates |

### Push Notifications

| Tool | Access | Description |
|---|---|---|
| `list_push_campaigns` | Read | List push notification campaigns with optional status filter |
| `get_push_stats` | Read | Get delivery statistics for a campaign |
| `create_push_campaign` | Write | Create a push campaign (requires `APPMETRICA_ALLOW_WRITE=true`) |

### Write operations

All of these require `APPMETRICA_ALLOW_WRITE=true` (and an OAuth token with write access); otherwise they return an error and send no request.

| Tool | Description |
|---|---|
| `create_funnel` | Create a saved funnel (`name`, `steps`, `comment`, `foreground_only`, `single_session`, `events_between_steps`) |
| `update_funnel` | Rename / re-comment a funnel, or rebuild its steps and options (the rest of the saved funnel is kept) |
| `delete_funnel` | Delete a saved funnel |
| `create_segment` | Create a segment from `events` (users who did all of them) |
| `update_segment` | Change a segment's `name` and/or `events` |
| `delete_segment` | Delete a segment |
| `create_push_campaign` | Create a push campaign (see Push Notifications) |
| `web_create_workspace`, `web_add_widgets`, `web_add_header`, `web_rename_workspace`, `web_remove_widget`, `web_delete_workspace`, `web_push_workspace` | Experimental web-session tools (see Web session); they use the Chrome login, not the OAuth token |

**What can and cannot be created.** Funnels and segments are created through the Management API and show up in the AppMetrica web UI. Dashboards and workspaces are **not** creatable through the public API: the web UI keeps them behind an internal GraphQL endpoint that needs a cookie session and CSRF token, which an OAuth token cannot use. The experimental `web_*` tools work around this with a logged-in Chrome session (see Web session); otherwise use the local workspaces and presets (see Dashboards & workspaces); the `analytics_setup` prompt also outputs a "web dashboard blueprint" you can build by hand.

Saved funnels support only what the web funnel editor can show: client-event steps (several events per step = any of them, at most one event parameter `key`/`value` per step, applied to every event of the step) and `install` steps. Other step kinds (`crash`, `purchase`, `session_start`, ...) and several parameters per step are rejected — run those ad hoc with `get_funnel_report`. Segments are created from `events` only (users who did all of them): the API derives the segment expression from the web editor's filter JSON, so other condition types (device, geo, version, profile…) have to be created in the web UI. For ad-hoc filtering use the `filters` parameter of the report tools.

### Prompts

| Prompt | Arguments | Description |
|---|---|---|
| `analytics_setup` | `app_id`, `project_path` (optional), `goal` (optional) | End-to-end workflow: audit the app's events (last 28 days), scan the source code for AppMetrica event calls, design and verify 3-6 funnels (saved with `create_funnel` when write mode is on, otherwise printed), create segments, build a dashboard (`get_dashboard` + `save_workspace`, then `web_push_workspace` into AppMetrica when the web session is logged in, else a web dashboard blueprint) and finish with an "Instrumentation gaps" section |

## Funnels

`get_funnel_report` mirrors the web "Funnels" report. It reads the per-step metrics `ym:uf:devicesInStep1..N` (`ym:sf:` for single-session funnels) from the Reporting API: the number of devices that completed each step in sequence. Absolute conversion is relative to step 1, relative conversion to the previous step.

- **Saved funnel** — `list_funnels` shows funnels created in the web UI; pass `funnel_id` and the saved pattern is used as-is (for funnels saved with "events between steps" off the restriction is rebuilt from the editor steps, as the web UI does). Funnel options below are ignored in this mode.
- **Ad-hoc funnel** — pass `steps`. A step is a list of client `events` (any of them), optional `event_params` (`key` == `value`), or another `kind`: `install`, `session_start`, `crash`, `error`, `purchase`, `ad_revenue`, `deeplink`, `any_event`. Use `list_events` to find event names.
- **Options** (ad-hoc): `foreground_only` (default `true`), `single_session` (default `false`), `events_between_steps` (default `true`; `false` joins steps with `next` and sends `funnel_restriction`), `window_seconds`.
- **Breakdowns** — `dimensions` (full keys or bare suffixes like `date`, `appVersion`, `operatingSystemInfo`, `regionCountry`), `filters`, `segment_id`, `group` (`day`/`week`/`month`, adds one `bytime` request for a series).

Ad-hoc example:

```json
{
  "app_id": 12345,
  "date_from": "2026-09-01",
  "date_to": "2026-09-30",
  "steps": [
    { "title": "Open", "events": ["app_open"] },
    { "title": "Paywall", "events": ["paywall_shown"] },
    { "title": "Purchase", "kind": "purchase" }
  ],
  "dimensions": ["operatingSystemInfo"]
}
```

## Dashboards & workspaces

AppMetrica's web workspaces and the "Обзор" dashboards are served by an internal, cookie-authenticated endpoint that the public API (OAuth token) cannot reach. This MCP therefore builds dashboards itself (to manage the real web workspaces use the experimental [Web session](#web-session-experimental-workspaces--dashboards-in-appmetrica) tools; `web_push_workspace` copies a local workspace there):

- **Presets** — `get_dashboard` runs named widgets computed from the Reporting API: `audience`, `installs`, `installs_by_country`, `engagement`, `app_versions`, `events`, `crashes`, `errors`, `anr`, `revenue`, `ad_revenue`, `ad_revenue_by_type`, `conversions`, `traffic`, `push`, `funnels` (every saved funnel) and `retention` (not available in the public API — returns an `unavailable` note). Default set: `audience`, `installs`, `engagement`, `crashes`, `events`. `list_dashboard_presets` shows the metrics of each.
- **One request per widget**, run sequentially and never mixing namespaces; a failing widget returns `{name, error}` instead of failing the whole dashboard. Keep the quota in mind (30 requests/second, 5000/day). `group` turns widgets without breakdown into time series, `currency` (default `USD`) applies to revenue widgets, `segment_id` restricts every widget to a saved segment.
- **Workspaces** — `save_workspace` stores a named widget set in a local JSON file (default `~/.config/appmetrica-mcp/workspaces.json`, override with `APPMETRICA_WORKSPACES_FILE`); `get_dashboard(workspace=...)` runs it. A widget has a `name` and exactly one of `preset`, `metrics` (custom, single namespace; optional `dimensions`, `filters`, `segment_id`, `limit`) or `funnel_id`. A workspace may define a default `app_id`. Workspace tools only touch the local file — they are not gated by `APPMETRICA_ALLOW_WRITE` and never write to AppMetrica.

## Web session (experimental): workspaces & dashboards in AppMetrica

**What it does.** The `web_*` tools list, create, edit and delete the real AppMetrica workspaces (dashboards) and their widgets — the part of the product the public API cannot manage. The web UI talks to an internal GraphQL endpoint (`POST https://appmetrica.yandex.ru/api`) that accepts only a Yandex cookie session plus a CSRF token embedded in the page; an OAuth token is rejected. The MCP therefore drives that endpoint through a real Google Chrome (`playwright-core`, persistent profile) and reuses your login.

**Login (once).**

```bash
npx appmetrica-mcp login          # opens Chrome; log in to Yandex, the window closes by itself
npx appmetrica-mcp session-status # prints {"logged_in": true, "login": "...", ...}
```

After that every `web_*` call reuses the saved profile **headlessly** (the first call starts Chrome, about 7 seconds; the session is shared by all calls and closed when the server exits). Yandex renews the session on every visit and the CSRF token is refreshed automatically, so a re-login is only needed when Yandex invalidates the session — the tools then answer with a "not logged in" error that tells you to run `npx appmetrica-mcp login`. A Chrome profile can be opened by one Chrome at a time, so the headless session closes Chrome after 2 minutes without `web_*` calls (`APPMETRICA_BROWSER_IDLE_MS`) and as soon as it finds itself logged out — run `login` whenever the tools are idle; if Chrome reports the profile is in use, wait a couple of minutes or stop the server.

**Security note.** The profile holds a full Yandex session for that account (not a scoped token) and Chrome stores it with a basic keychain, so treat the profile directory like a credential: keep it on your own machine and prefer a dedicated Yandex account that only has access to the AppMetrica apps you need. `web_session_status` reports the account name (`yandex_login`); no other cookie or token value is ever returned.

**Environment variables.** `APPMETRICA_BROWSER_PROFILE` (profile directory, default `~/.config/appmetrica-mcp/chrome-profile`), `APPMETRICA_BROWSER_PATH` (Chrome/Chromium executable) and `APPMETRICA_BROWSER_CHANNEL` (`chrome` by default; `chromium`, `msedge`, ...). Requirement: Google Chrome installed (or a browser given by `APPMETRICA_BROWSER_PATH`).

**Widgets.** Every tool that takes widgets accepts the same `WidgetInput`, exactly one of:

- `{ "preset": "AudienceMulti" }` — a web preset widget (ids from `web_list_widget_presets`, e.g. `Installs`, `Audience`, `Crashes`, `CrashFreeSessions`, `Revenue`, `AppVersion`, `PushSent`); optional `view_kind`.
- `{ "funnel_id": 267628 }` — a saved funnel (`list_funnels`) as a `Funnels` widget (default view `FunnelFirstStep`).
- `{ "name": "...", "metrics": ["ym:u:users"], "dimensions": ["ym:u:appVersion"], "segment_id": 5, "view_kind": "Table" }` — a custom widget. The report namespace is derived from the first metric's prefix (`ym:u:` → `Audience`, `ym:r2:` → `Revenue`, `ym:ce2:` → `Events`, ...; for prefixes shared by several namespaces `Cohort` is used for `ym:i:` and `UserAcquisition` for `ym:ts:`) or given explicitly with `namespace` (`web_list_report_namespaces`). Metric and dimension ids are validated against the namespace; an unknown id fails with a list of similar ones.

`view_kind` values: `Timeline` (default), `TimeColumn`, `Table`, `Pie`, `MultiTimeColumn`, `FunnelFirstStep`; other strings are passed through unchanged. A group is `{ "header": "text", "widgets": [...] }`; a group with both becomes a header row followed by a widgets row. AppMetrica limits a workspace to 20 widgets and 40 groups, an app to 20 dashboards.

```json
{
  "app_id": 12345,
  "name": "Product overview",
  "groups": [
    { "header": "Audience" },
    { "widgets": [{ "preset": "AudienceMulti" }, { "preset": "NewUsers" }] },
    { "header": "Funnels" },
    { "widgets": [{ "funnel_id": 267628 }] },
    { "widgets": [{ "name": "Users by version", "metrics": ["ym:u:users"], "dimensions": ["ym:u:appVersion"], "view_kind": "Table" }] }
  ]
}
```

`web_create_workspace` creates the whole workspace with one request and returns `{dashboard_id, name, url, groups}`.

**Local workspace → AppMetrica.** `web_push_workspace(app_id, workspace, name?)` takes a workspace saved with `save_workspace` and creates it in AppMetrica: one header row (the widget name) plus a row of web widgets per local widget. Local presets map to web presets where there is a clear counterpart — `audience` → `AudienceMulti`, `installs` → `Installs`, `engagement` → `UserTimeSpent` + `AvgSessionTime` + `UserSessionsCount`, `app_versions` → `AppVersion`, `crashes` → `CrashFreeSessions` + `Crashes`, `errors` → `ErrorLogsIos` + `ErrorLogsAndroid`, `revenue` → `RevenueTotal` + `RevenuePurchases`, `ad_revenue` → `AdRevenue` + `AdRevenueARPU` + `AdRevenueECPM`, `traffic` → `Clicks` + `Installs` + `InstallConversion`, `push` → `PushSent` + `PushReceived` + `PushOpened`, `retention` → `RetentionDynamics`, `funnels` → one `Funnels` widget per saved funnel. `installs_by_country`, `events`, `conversions`, `anr`, `ad_revenue_by_type` and local custom `metrics` widgets become custom widgets; local `funnel_id` widgets become `Funnels` widgets. Widgets that cannot be created (unknown metric ids, no saved funnels) are skipped and listed in `skipped`; `notes` lists what could not be carried over (`filters`, `segment_id` on preset widgets).

**Limitations.**

- This is an **unofficial, internal API** used by the web client: it may change without notice and break the tools. The GraphQL documents are kept in `src/web/operations.ts`; to refresh them record real traffic with `node scripts/record-graphql.mjs` (after `npm run build`; it opens Chrome with the logged-in profile and records everything you do) and update the fragments/operations in `src/web/operations.ts` accordingly.
- Needs Google Chrome and a Yandex login on the machine running the MCP server.
- Mutations require `APPMETRICA_ALLOW_WRITE=true`. System dashboards (`<appId>/General`, ...) cannot be deleted by `web_delete_workspace`.
- Yandex may rate-limit the web endpoint (HTTP 429): wait a minute and retry.

## API coverage

- **Reporting API** — `data`, `data/bytime`, `data/drilldown`; filters, sorting, segments (`segment_id`), currency and sampling parameters; funnel step metrics via `funnel_pattern`.
- **Logs API** — all 13 tables: `events`, `crashes`, `errors`, `installations`, `sessions_starts`, `deeplinks`, `postbacks`, `clicks`, `push_tokens`, `profiles_v2`, `revenue_events`, `ecommerce_events`, `ad_revenue_events`.
- **Management API** — applications, events list, conversions, segments and saved funnels (read, and create/update/delete in write mode), Logs API status.
- The metric/dimension catalogue and the Logs API field lists come from the official docs and are stored in `src/catalog.generated.ts`. Regenerate it with `node scripts/update-catalog.mjs`.

## Usage Examples

Once connected, you can ask Claude things like:

- *"List my AppMetrica applications"*
- *"Show DAU and sessions for app 12345 over the last 7 days"*
- *"Export crash logs for app 12345 from 2024-01-01 to 2024-01-07"*
- *"What push campaigns are currently active for app 12345?"*
- *"Show me new user counts broken down by app version"*
- *"Show the conversion of my saved funnels for app 12345 last month"*
- *"Build a funnel app_open -> paywall_shown -> purchase for iOS users in September"*
- *"Give me an overview dashboard for app 12345 for the last 14 days, weekly"*
- *"Save a workspace 'weekly' with audience, crashes and revenue widgets"*
- *"Audit the events of app 12345 for the last month and tell me which ones are dead"*
- *"Create a funnel app_open -> paywall_shown -> purchase_completed and a segment of users who saw the paywall"* (needs `APPMETRICA_ALLOW_WRITE=true`)
- *"Run the analytics_setup prompt for app 12345 on ~/Projects/MyApp"*
- *"Create an AppMetrica workspace 'Product overview' for app 12345 with audience, crash-free sessions and my paywall funnel"* (experimental web session; needs `APPMETRICA_ALLOW_WRITE=true`)

## Rate Limits

AppMetrica enforces the following limits on all API requests:

- **30 requests / second** per OAuth token
- **5,000 requests / day** per OAuth token

The client retries automatically on `429` and `5xx` responses with exponential backoff (1s → 2s → 4s, up to 3 attempts).

## License

MIT
