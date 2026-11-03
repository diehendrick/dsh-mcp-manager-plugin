/**
 * Host half of the MCP Manager bundle.
 *
 * The manager persists nothing on its own. It mounts one nested `cordis:include`
 * row at the Loader root, pointing at `<profile>/mcp-servers.yml`, and every
 * configured MCP server is one `@deepseek-ai/dsh-mcp-client` row inside that
 * Include. The Loader writes the Include file whenever a row is added, updated,
 * or removed, so servers survive an app restart and mount through the normal
 * Loader path — the same mechanism a hand-written `cordis.patch.yml` uses.
 *
 * The Web UI reaches this module over one loopback HTTP prefix route. Remote
 * namespaces (`ctx.remote.*`) are compiled into `@deepseek-ai/dsh-api-remotes`
 * and cannot be minted by a workspace bundle, and this file is plain JavaScript
 * with no build step, so a raw route is the supported seam.
 *
 * @module @local/dsh-mcp-manager
 */

import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Loader id of the Include row that owns the server list. */
const GROUP = 'mcp-manager-servers'

/** Package mounted once per configured MCP server. */
const MCP_CLIENT_PLUGIN = '@deepseek-ai/dsh-mcp-client'

/** Prefix the Web UI calls. Never under `/api`, which the API gateway owns. */
const API_PREFIX = '/mcp-manager/api'

/** MCP tool names are `mcp__<serverName>__<rawName>`. */
const TOOL_PREFIX = 'mcp__'

/** `serverName` contract enforced by dsh-mcp-client. */
const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/

/** Upper bound on one request body (one server definition, not a document). */
const MAX_BODY_BYTES = 256 * 1024

/** Cordis fiber state for a fully active plugin. */
const FIBER_ACTIVE = 2

/** Raised for a caller mistake; becomes a 400 without a stack trace. */
class RequestError extends Error {
  constructor(message) {
    super(message)
    this.name = 'RequestError'
  }
}

/**
 * Write one JSON response and end the request.
 * @param res - the response to write.
 * @param status - HTTP status code.
 * @param body - JSON-serializable payload.
 */
function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

/**
 * Read a JSON request body.
 * @param req - the incoming request.
 * @returns the parsed body, or an empty object when there is none.
 */
async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new RequestError('Request body is too large')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new RequestError('Request body must be a JSON object')
    }
    return value
  } catch (error) {
    if (error instanceof RequestError) throw error
    throw new RequestError('Request body is not valid JSON')
  }
}

/** Read a non-empty string field, or fail the request. */
function requiredString(value, field) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text === '') throw new RequestError(`${field} is required`)
  return text
}

/** Trim a value to a string; non-strings become empty. */
function textOf(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Normalize a `NAME=value` or `Name: value` textarea into a string record.
 * @param value - array or newline-separated text supplied by the UI.
 * @param separator - the assignment separator for this field.
 * @returns the parsed record.
 */
function parseRecord(value, separator) {
  const lines = Array.isArray(value) ? value.map(String) : String(value ?? '').split('\n')
  const record = {}
  for (const raw of lines) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const at = line.indexOf(separator)
    if (at <= 0) throw new RequestError(`Expected NAME${separator}VALUE, got "${line}"`)
    record[line.slice(0, at).trim()] = line.slice(at + 1).trim()
  }
  return record
}

/**
 * Validate one server definition from the UI and turn it into dsh-mcp-client Config.
 * @param input - the raw server object from the request body.
 * @returns the Loader row config for one MCP server.
 */
function buildConfig(input) {
  const serverName = requiredString(input.serverName, 'Server name')
  if (!SERVER_NAME.test(serverName)) {
    throw new RequestError('Server name must be 1-32 characters of A-Z, a-z, 0-9, "_" or "-"')
  }
  const transport = input.transport
  if (transport !== 'stdio' && transport !== 'streamable-http') {
    throw new RequestError('Transport must be "stdio" or "streamable-http"')
  }
  const config = {
    serverName,
    transport,
    // A row whose first connection fails reports `failed` instead of looking
    // connected with zero tools; app-boot tolerates a failing optional row.
    failOnStartupError: true,
  }
  if (transport === 'stdio') {
    config.command = requiredString(input.command, 'Command')
    const args = Array.isArray(input.args) ? input.args.map(String).filter((arg) => arg !== '') : []
    if (args.length > 0) config.args = args
    const env = input.env === undefined ? {} : parseRecord(input.env, '=')
    if (Object.keys(env).length > 0) config.env = env
    const cwd = textOf(input.cwd)
    if (cwd !== '') config.cwd = cwd
  } else {
    const url = requiredString(input.url, 'URL')
    if (!/^https?:\/\//i.test(url)) throw new RequestError('URL must start with http:// or https://')
    config.url = url
    const headers = input.headers === undefined ? {} : parseRecord(input.headers, ':')
    if (Object.keys(headers).length > 0) config.headers = headers
  }
  if (input.toolCallTimeoutMs !== undefined && input.toolCallTimeoutMs !== null && input.toolCallTimeoutMs !== '') {
    const timeout = Number(input.toolCallTimeoutMs)
    if (!Number.isInteger(timeout) || timeout < 1) throw new RequestError('Tool timeout must be a positive integer')
    config.toolCallTimeoutMs = timeout
  }
  return config
}

/**
 * Whether a socket address is the local machine.
 * @param address - the socket's remote address.
 * @returns true for loopback and Unix-socket peer forms.
 */
function isLoopback(address) {
  return (
    address === undefined ||
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1'
  )
}

/**
 * Resolve `<profile>/mcp-servers.yml`, the Include file that holds the rows.
 * The file must live inside the profile directory: App-boot routes bare package
 * names it finds there to the installation, which is how the stored rows keep
 * resolving `@deepseek-ai/dsh-mcp-client` after an upgrade.
 * @param ctx - this plugin's Cordis context.
 * @returns the absolute file path, or undefined when no profile directory is known.
 */
function resolveStoreFile(ctx) {
  const profileContext = ctx.get('profileContext')
  const dir = profileContext?.dir
  if (typeof dir === 'string' && dir !== '') return join(dir, 'mcp-servers.yml')
  try {
    return join(fileURLToPath(new URL('.', ctx.baseUrl)), 'mcp-servers.yml')
  } catch {
    return undefined
  }
}

/**
 * Build the Host half.
 * @param ctx - this plugin's Cordis context.
 */
export function apply(ctx) {
  const loader = ctx.loader
  const storeFile = resolveStoreFile(ctx)

  /** Why the server store could not be mounted, surfaced to the page. */
  let mountError

  /** Serialize mutations so two UI actions cannot interleave Include writes. */
  let queue = Promise.resolve()

  /**
   * Run one mutation after every earlier one settled.
   * @param operation - the mutation to run.
   * @returns its result.
   */
  function serialized(operation) {
    const run = queue.then(operation, operation)
    queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  /**
   * The live Include group that owns the server rows, when it is mounted.
   * @returns the entry group, or undefined.
   */
  function serverGroup() {
    try {
      return loader.resolve(GROUP).subgroup
    } catch {
      return undefined
    }
  }

  /**
   * Tool names currently registered for one MCP server.
   * @param serverName - the configured namespace.
   * @returns the model-facing tool names, sorted.
   */
  function toolsOf(serverName) {
    const tools = ctx.get('tools')
    if (tools === undefined || typeof tools.schemas !== 'function') return []
    const prefix = `${TOOL_PREFIX}${serverName}__`
    try {
      return tools
        .schemas()
        .map((schema) => schema.name)
        .filter((name) => typeof name === 'string' && name.startsWith(prefix))
        .sort()
    } catch {
      return []
    }
  }

  /**
   * Project one persisted row plus its live fiber onto the UI's server view.
   * @param options - the persisted Loader row options.
   * @param group - the owning Include group.
   * @returns one server row for the manager page.
   */
  function viewOf(options, group) {
    const entry = group.tree.store[options.id]
    const fiber = entry?.fiber
    const disabled = options.disabled === true
    const config = options.config ?? {}
    const serverName = typeof config.serverName === 'string' ? config.serverName : String(options.id)
    let state = 'failed'
    if (disabled) state = 'disabled'
    else if (fiber !== undefined && fiber.state === FIBER_ACTIVE) state = 'active'
    else if (fiber !== undefined && (fiber.state === 0 || fiber.state === 1)) state = 'starting'
    return {
      id: String(options.id),
      serverName,
      transport: config.transport,
      enabled: !disabled,
      state,
      tools: disabled ? [] : toolsOf(serverName),
      config,
    }
  }

  /** Read the full server list in the shape the page consumes. */
  function listServers() {
    const group = serverGroup()
    if (group === undefined) {
      return { ok: true, mounted: false, file: storeFile, error: mountError, servers: [] }
    }
    const servers = group.data
      .filter((options) => options !== undefined && options.id !== undefined)
      .map((options) => viewOf(options, group))
      .sort((left, right) => left.serverName.localeCompare(right.serverName))
    return { ok: true, mounted: true, file: storeFile, error: mountError, servers }
  }

  /**
   * Add a server, or replace the definition of an existing one.
   * @param input - the server object from the UI.
   * @returns the list after the change.
   */
  async function upsertServer(input) {
    if (serverGroup() === undefined) {
      throw new RequestError('The MCP server store is not mounted yet; retry in a moment')
    }
    const config = buildConfig(input)
    const localId = `mcp-${config.serverName}`
    const nestedId = `${GROUP}:${localId}`
    let existing = false
    try {
      loader.resolve(nestedId)
      existing = true
    } catch {
      existing = false
    }
    if (existing) {
      await loader.update(nestedId, { config, disabled: input.enabled === false ? true : undefined })
    } else {
      const options = { id: localId, name: MCP_CLIENT_PLUGIN, config }
      if (input.enabled === false) options.disabled = true
      await loader.create(options, GROUP)
    }
    return listServers()
  }

  /**
   * Remove one server row.
   * @param serverName - the configured namespace.
   * @returns the list after the change.
   */
  function removeServer(serverName) {
    const name = requiredString(serverName, 'Server name')
    const group = serverGroup()
    if (group === undefined) {
      throw new RequestError('The MCP server store is not mounted yet; retry in a moment')
    }
    const localId = `mcp-${name}`
    if (group.tree.store[localId] === undefined) throw new RequestError(`No server named "${name}"`)
    // Remove through the owning Include tree: `loader.remove(nestedId)` resolves
    // the nested id but hands it to the parent group, which keys its store by
    // the local id and therefore silently ignores it.
    group.tree.remove(localId)
    return listServers()
  }

  /**
   * Enable or disable one server row without losing its definition.
   * @param serverName - the configured namespace.
   * @param enabled - whether the row should run.
   * @returns the list after the change.
   */
  async function setEnabled(serverName, enabled) {
    const name = requiredString(serverName, 'Server name')
    const nestedId = `${GROUP}:mcp-${name}`
    try {
      loader.resolve(nestedId)
    } catch {
      throw new RequestError(`No server named "${name}"`)
    }
    await loader.update(nestedId, { disabled: !enabled })
    return listServers()
  }

  /**
   * Answer one UI request.
   * @param req - the incoming request.
   * @param res - the response to write.
   */
  async function handle(req, res) {
    try {
      if (!isLoopback(req.socket?.remoteAddress)) {
        return sendJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'MCP manager is local-only' } })
      }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const route = url.pathname.slice(API_PREFIX.length).replace(/\/+$/, '')
      const method = req.method ?? 'GET'
      if (route === '/ping' && method === 'GET') return sendJson(res, 200, { ok: true, file: storeFile })
      if (route === '/servers' && method === 'GET') return sendJson(res, 200, listServers())
      if (method === 'POST') {
        // Browsers send Origin on same-origin POSTs; a cross-site page cannot forge it.
        const origin = req.headers.origin
        if (typeof origin === 'string') {
          let expected
          try {
            expected = ctx.webServer.getOrigin()
          } catch {
            expected = undefined
          }
          let actual
          try {
            actual = new URL(origin).origin
          } catch {
            actual = undefined
          }
          if (expected !== undefined && actual !== expected) {
            return sendJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'Cross-origin request refused' } })
          }
        }
        if (route === '/servers') {
          const body = await readJson(req)
          return sendJson(res, 200, { ...(await serialized(() => upsertServer(body.server ?? {}))) })
        }
        if (route === '/servers/remove') {
          const body = await readJson(req)
          return sendJson(res, 200, { ...(await serialized(() => removeServer(body.serverName))) })
        }
        if (route === '/servers/enabled') {
          const body = await readJson(req)
          return sendJson(res, 200, {
            ...(await serialized(() => setEnabled(body.serverName, body.enabled === true))),
          })
        }
      }
      return sendJson(res, 404, {
        ok: false,
        error: { code: 'not-found', message: `No route ${method} ${url.pathname}` },
      })
    } catch (error) {
      if (error instanceof RequestError) {
        return sendJson(res, 400, { ok: false, error: { code: 'bad-request', message: error.message } })
      }
      ctx.logger.warn(error)
      const message = error instanceof Error ? error.message : String(error)
      return sendJson(res, 500, { ok: false, error: { code: 'internal', message } })
    }
  }

  if (storeFile === undefined) {
    ctx.logger.warn('mcp-manager: no profile directory; the MCP server store is unavailable')
    return
  }

  // Mount the Include that owns the server rows. It lives at the Loader root,
  // never inside the profile's composed root Include, whose write() would dump
  // the whole composed tree back into the profile config.
  async function mountStore() {
    try {
      let mounted = false
      try {
        mounted = loader.resolve(GROUP).subgroup !== undefined
      } catch {
        mounted = false
      }
      if (mounted) return
      await loader.create(
        {
          id: GROUP,
          name: 'cordis:include',
          config: { path: pathToFileURL(storeFile).href, initial: [] },
        },
        null,
      )
      mountError = undefined
    } catch (error) {
      mountError = error instanceof Error ? error.message : String(error)
      ctx.logger.error(error)
    }
  }

  void mountStore()

  ctx.effect(
    () => () => {
      try {
        loader.remove(GROUP)
      } catch {
        // The row is already gone (shutdown, or a failed mount).
      }
    },
    'mcp-manager: server store',
  )

  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler: handle }),
    'mcp-manager: HTTP bridge',
  )
}

/** The browser carrier this manager answers on. */
export const inject = ['loader', 'webServer']
