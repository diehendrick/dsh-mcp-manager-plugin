# dsh-mcp-manager-plugin

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that manages
Model Context Protocol servers from the Web UI: add, edit, enable, disable, and remove
them, and the agent's tools update live.

## Install

```sh
dsh plugin --profile <your-profile> add github:diehendrick/dsh-mcp-manager-plugin
```

or from a local checkout of this repository:

```sh
dsh plugin --profile <your-profile> add /path/to/dsh-mcp-manager-plugin
```

Then reload the Harness page: **Settings → MCP servers** appears in the sidebar.

## What it does

- **Add server** is one card per connection field, mirroring the MCP connection
  shape: Name + Type (`STDIO` / `Streamable HTTP`), Command to launch,
  Arguments (one input per row), Environment variables (`Key` / `Value` rows),
  Working directory, Advanced (tool-call timeout).
- **Edit** expands the saved server's own row into the same fields
  (`Editing <name>`), so editing never looks like a second add flow.
- **Enable/disable** keeps the definition but unmounts the row, so its tools
  disappear from the agent without losing the configuration.
- **Remove** disposes the row and deletes it from the store.
- Each saved server shows its transport, connection state
  (`Connected` / `Starting…` / `Disabled` / `Not connected`), and how many
  `mcp__<server>__<tool>` tools it currently contributes.
- Adding, editing, enabling, and removing all take effect immediately; a
  server added from the page is callable by the agent in the same turn.

## Where servers are stored

One YAML file, owned by the plugin, beside the profile's `cordis.yml`:

```
~/.dsh/profiles/<profile>/mcp-servers.yml
```

It is a normal Loader include file: one `@deepseek-ai/dsh-mcp-client` row per
server, so the servers survive restarts and mount through the normal Loader
path.

```yaml
- id: mcp-github
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: github
    transport: stdio
    command: npx
    args: [-y, '@modelcontextprotocol/server-github']
    env:
      GITHUB_TOKEN: …
    failOnStartupError: true
```

## How it is wired

```
Settings → MCP servers  (client.js, settings.section id "mcp")
        │  fetch, loopback only, same origin
        ▼
POST/GET /mcp-manager/api/servers          (index.js, webServer prefix route)
        │  ctx.loader.create / update / remove
        ▼
cordis:include  "mcp-manager-servers"  →  <profile>/mcp-servers.yml
        │  one row per server, mounted by the normal Loader path
        ▼
@deepseek-ai/dsh-mcp-client  →  tools mcp__<server>__<tool> on ctx.tools
```

- `cordis.patch.yml` inserts one Host row, `@local/dsh-mcp-manager`.
- `index.js` (Host half) mounts a nested `cordis:include` row at Loader root
  for `mcp-servers.yml`, then creates, updates, and removes `dsh-mcp-client`
  rows in it through `ctx.loader`. The Loader writes the file on every change.
- `client.js` (Client half) registers a `settings.section` page and talks to
  the Host half over the loopback-only route `/mcp-manager/api`.
- Servers whose first connection fails are marked `Not connected`: the manager
  writes `failOnStartupError: true`, which app-boot tolerates as an optional
  row.

## Security notes

- The HTTP bridge accepts loopback sockets only and refuses cross-origin
  POSTs.
- `env` and `headers` values are stored in plain text in `mcp-servers.yml`.
  Do not put a secret there that you would not keep in a local config file.
- A stdio server is a program this page starts for you. Only add servers you
  trust.

## Known limits

- The Host half is plain JavaScript with no build step; the client half is a
  hand-written `__ModuleLoader__` artifact that imports only the React seed
  word and `--dsw-*` theme tokens, so a DSH upgrade cannot break it at import
  time.
- Editing the Host half requires a plugin reload (`dsh plugin` disable/enable,
  or an app restart) to load the new module generation; the client half
  reloads on page refresh.
- Resource subscriptions and MCP prompt templates are not supported
  (inherited from `dsh-mcp-client`).
- Deliberately not modeled: *environment variable passthrough*. The MCP client
  merges an explicit `env` map over an ambient environment that intentionally
  drops credential-shaped names; there is no passthrough field to set.
