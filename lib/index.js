/**
 * dsh-share host half: ChatGPT/Claude-style session sharing for the DSH Web UI.
 *
 * Authenticated extraction routes (browser session auth, via connection.fetch):
 *   GET    /api/session.share.content?sessionId=  ordered message JSON
 *   GET    /api/session.share.media?attachmentId=…  exact stored image bytes
 *   POST   /api/session.share.create               {title, html} -> {path:"/share/<token>"}
 *   DELETE /api/session.share?token=               revoke one snapshot
 *
 * Public route (named webServer route, beats the SPA fallback, no session auth;
 * the token is the capability):
 *   GET|HEAD /share/<token>  the self-contained snapshot page
 *
 * Every wrong answer is plain text and never echoes internal errors.
 * The browser half ships via exports["./client"].
 */

import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'dsh-share'

/** webServer owns the public page route; connection owns the authenticated API routes. */
export const inject = ['webServer', 'connection']

/** Snapshot token shape: base64url of 18 random bytes (24 chars, no padding). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24}$/

/** Real image attachment ids are `sha256:` plus the lowercase hex digest. */
const ATTACHMENT_ID_PATTERN = /^sha256:[a-f0-9]{64}$/

/** Raster media types the attachment store serves back. */
const IMAGE_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/** Message count bound for one share payload. */
const MAX_MESSAGES = 200

/**
 * Total text bound (UTF-8 bytes) for one share payload. Reasoning-heavy
 * sessions blow past 1MB quickly; 2MB still rasterizes safely (the PNG
 * pipeline shrinks scale to fit the canvas budget and only bails far
 * beyond this size).
 */
const MAX_TEXT_BYTES = 2 * 1024 * 1024

/** Request body bound for one snapshot create. */
const MAX_CREATE_BYTES = 5 * 1024 * 1024

const PLAIN_HEADERS = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

const fail = (status, text) => new Response(text, { status, headers: PLAIN_HEADERS })

/** UTF-8 byte length of one string. */
const byteLength = text => Buffer.byteLength(text, 'utf8')

/**
 * Truncate one string to a UTF-8 byte budget without splitting code points.
 * @param text - source text.
 * @param budget - maximum UTF-8 bytes to keep.
 * @returns the kept prefix and whether anything was cut.
 */
function truncateTextToBytes(text, budget) {
  if (byteLength(text) <= budget) return { text, cut: false }
  let bytes = 0
  let end = 0
  for (const char of text) {
    const size = byteLength(char)
    // Reserve room for the ellipsis so a cut never ends mid-word silently.
    if (bytes + size > budget - 3) break
    bytes += size
    end += char.length
  }
  return { text: text.slice(0, end) + '…', cut: true }
}

/** Truncate by code points for display metadata (the share title). */
function truncateTitle(text) {
  const chars = Array.from(text)
  return chars.length > 60 ? `${chars.slice(0, 60).join('')}…` : text
}

/**
 * Normalize one raw content block array into share blocks, keeping only what
 * the share document can render (text, image, file); unknown blocks drop out.
 * @param content - a message content array from a session event.
 * @returns the ordered share blocks.
 */
function shareBlocksOf(content) {
  if (!Array.isArray(content)) return []
  const blocks = []
  for (const raw of content) {
    if (typeof raw !== 'object' || raw === null) continue
    if (raw.type === 'text' && typeof raw.text === 'string') {
      blocks.push({ type: 'text', text: raw.text })
      continue
    }
    const attachment = typeof raw.attachment === 'object' && raw.attachment !== null
      ? raw.attachment
      : undefined
    if (attachment === undefined) continue
    const attachmentId = String(attachment.attachmentId ?? '')
    if (raw.type === 'image' && ATTACHMENT_ID_PATTERN.test(attachmentId)) {
      blocks.push({
        type: 'image',
        attachmentId,
        mediaType: String(attachment.mediaType ?? ''),
        bytes: Number(attachment.bytes ?? 0),
        width: Number(attachment.width ?? 0),
        height: Number(attachment.height ?? 0),
        ...(typeof attachment.name === 'string' ? { name: attachment.name } : {}),
      })
      continue
    }
    if (raw.type === 'file' && attachmentId !== '') {
      blocks.push({
        type: 'file',
        name: String(raw.name ?? attachment.name ?? 'file'),
        attachmentId,
        ...(typeof attachment.mediaType === 'string' ? { mediaType: attachment.mediaType } : {}),
        ...(typeof attachment.bytes === 'number' ? { bytes: attachment.bytes } : {}),
      })
    }
  }
  return blocks
}

/**
 * Fold one session observation into the ordered share payload. Only
 * `surfaceOp === 'append'` events count (`replace` events are shadow copies);
 * a user message's turn is the most recent `turn/start` turn. Only real
 * human input is shared: a `user/message` whose `source.kind` is anything
 * other than `'user'` (runtime-context snapshots, time-context headers,
 * skill catalogs, approval-policy notices, injected agent instructions, …)
 * is harness context injection, not something the human wrote, and is
 * dropped; a missing `source` (pre-source logs) counts as human.
 * @param events - the observation's immutable events in seq order.
 * @returns the share payload with bounds applied and `truncated` set.
 */
/** Per-message thinking bound (one round can think a lot). */
const THINKING_MAX_CHARS = 20_000

/** Per-tool result summary bound inside the share payload. */
const TOOL_SUMMARY_CHARS = 400

/** Maximum tool calls recorded per assistant message; the rest are counted. */
const TOOLS_PER_MESSAGE = 24

/**
 * All reasoning blocks of one content array, joined for the share view.
 * @param content - a message content array from a session event.
 * @returns the full thinking text (bounded), or null when nothing was thought.
 */
function thinkingPreviewOf(content) {
  if (!Array.isArray(content)) return null
  const parts = []
  for (const raw of content) {
    if (typeof raw !== 'object' || raw === null) continue
    if (raw.type === 'reasoning' && typeof raw.text === 'string' && raw.text.trim() !== '') {
      parts.push(raw.text.trim())
    }
  }
  if (parts.length === 0) return null
  const text = parts.join('\n\n')
  const chars = Array.from(text)
  return chars.length > THINKING_MAX_CHARS
    ? `${chars.slice(0, THINKING_MAX_CHARS).join('')}…`
    : text
}

/**
 * Fold the tool calls between one assistant message and the next into a
 * display list: name from `tool/call`, result summary from `tool/result`,
 * paired by callId. Unfinished calls surface as not-ok rows.
 * @param events - the observation's immutable events in seq order.
 * @param from - event index right after the assistant message.
 * @param to - event index of the next message (or the log end).
 * @returns the tool rows and how many calls the cap dropped.
 */
function toolDetailsOf(events, from, to) {
  const calls = new Map()
  const rows = []
  let dropped = 0
  for (let k = from; k < to; k += 1) {
    const event = events[k]
    if (event === null || typeof event !== 'object') continue
    if (event.type === 'tool/call') {
      const data = event.data ?? {}
      calls.set(String(data.callId ?? ''), {
        name: typeof data.name === 'string' && data.name !== '' ? data.name : 'tool',
        ok: false,
        summary: '',
      })
      continue
    }
    if (event.type !== 'tool/result') continue
    const data = event.data ?? {}
    const callId = String(data.toolCallId ?? data.message?.toolCallId ?? '')
    const call = calls.get(callId)
    let summary = ''
    const blocks = data.message?.content
    if (Array.isArray(blocks)) {
      for (const block of blocks) {
        if (block !== null && typeof block === 'object' && block.type === 'text'
          && typeof block.text === 'string') {
          summary = block.text
          break
        }
      }
    }
    const chars = Array.from(summary.trim())
    if (chars.length > TOOL_SUMMARY_CHARS) summary = `${chars.slice(0, TOOL_SUMMARY_CHARS).join('')}…`
    if (call !== undefined) {
      call.ok = true
      call.summary = summary
    } else if (rows.length + calls.size < TOOLS_PER_MESSAGE) {
      calls.set(callId, { name: 'tool', ok: true, summary })
    }
  }
  for (const row of calls.values()) {
    if (rows.length >= TOOLS_PER_MESSAGE) {
      dropped += 1
      continue
    }
    rows.push(row)
  }
  return { rows, dropped }
}

/**
 * Fold one session observation into the ordered share payload. Only
 * `surfaceOp === 'append'` events count (`replace` events are shadow copies);
 * a user message's turn is the most recent `turn/start` turn. Only real
 * human input is shared: a `user/message` whose `source.kind` is anything
 * other than `'user'` (runtime-context snapshots, time-context headers,
 * skill catalogs, approval-policy notices, injected agent instructions, …)
 * is harness context injection, not something the human wrote, and is
 * dropped; a missing `source` (pre-source logs) counts as human. Each
 * assistant message also carries `activity` — the tool results that followed
 * it before the next message (so the client can annotate intermediate
 * rounds) and its own thinking preview.
 * @param events - the observation's immutable events in seq order.
 * @returns the share payload with bounds applied and `truncated` set.
 */
function sharePayloadOf(events) {
  const collected = []
  let currentTurn = null
  for (const [eventIndex, event] of events.entries()) {
    if (event === null || typeof event !== 'object') continue
    if (event.type === 'turn/start') {
      currentTurn = typeof event.data?.turn === 'number' ? event.data.turn : null
      continue
    }
    if (event.surfaceOp !== 'append') continue
    let role = null
    let turn = currentTurn
    let content = null
    if (event.type === 'user/message') {
      const source = event.data?.source
      const kind = source !== null && typeof source === 'object' ? source.kind : undefined
      if (kind !== undefined && kind !== 'user') continue
      role = 'user'
      content = event.data?.content
    } else if (event.type === 'assistant/message') {
      role = 'assistant'
      turn = typeof event.data?.turn === 'number' ? event.data.turn : currentTurn
      content = event.data?.message?.content
    }
    if (role === null) continue
    const blocks = shareBlocksOf(content)
    const thinking = role === 'assistant' ? thinkingPreviewOf(content) : null
    // User messages need at least one renderable block; assistant messages
    // stay even with empty visible content — a tool-only round still earns
    // its "调用工具 N 次" step annotation downstream.
    if (blocks.length === 0 && role === 'user') continue
    collected.push({
      role,
      turn,
      time: typeof event.time === 'number' ? event.time : 0,
      blocks,
      eventIndex,
      thinking,
    })
  }

  // Annotate every assistant message with the work that happened right after
  // it: full thinking text, plus the tool calls until the next message
  // (names, done status, bounded result summaries) for the share view.
  for (let i = 0; i < collected.length; i += 1) {
    const message = collected[i]
    if (message.role !== 'assistant') continue
    const limit = i + 1 < collected.length ? collected[i + 1].eventIndex : events.length
    const { rows, dropped } = toolDetailsOf(events, message.eventIndex + 1, limit)
    message.thoughts = message.thinking
    message.tools = rows
    message.activity = {
      tools: rows.length + dropped,
      thinking: message.thinking,
    }
    delete message.thinking
    delete message.eventIndex
  }
  for (const message of collected) {
    delete message.eventIndex
    delete message.thinking
  }
  // Drop assistant messages that carried neither visible content, nor
  // thinking, nor any following tool work — nothing meaningful to annotate.
  const meaningful = collected.filter(message => message.role !== 'assistant'
    || message.blocks.length > 0
    || message.activity.thinking !== null
    || message.activity.tools > 0)
  collected.length = 0
  collected.push(...meaningful)

  let truncated = false
  // The message bound counts human-visible units (user messages and
  // text-bearing assistant replies); reasoning-only steps are annotations,
  // not messages, and must not eat the budget.
  const countable = []
  collected.forEach((message, index) => {
    if (message.role === 'user' || message.blocks.some(block => block.type === 'text')) countable.push(index)
  })
  let messages = collected
  if (countable.length > MAX_MESSAGES) {
    truncated = true
    const cut = countable[countable.length - MAX_MESSAGES]
    let start = cut
    while (start > 0 && collected[start - 1].role !== 'user') start -= 1
    messages = collected.slice(start)
  }

  let totalTextBytes = 0
  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.type === 'text') totalTextBytes += byteLength(block.text)
    }
    if (typeof message.thoughts === 'string') totalTextBytes += byteLength(message.thoughts)
  }
  if (totalTextBytes > MAX_TEXT_BYTES) {
    truncated = true
    // Trim the oldest text first so the newest messages stay complete.
    for (const message of messages) {
      if (totalTextBytes <= MAX_TEXT_BYTES) break
      if (typeof message.thoughts === 'string') {
        const budget = Math.max(0, MAX_TEXT_BYTES - (totalTextBytes - byteLength(message.thoughts)))
        const result = truncateTextToBytes(message.thoughts, budget)
        totalTextBytes -= byteLength(message.thoughts) - byteLength(result.text)
        message.thoughts = result.text === '' ? null : result.text
      }
      for (const block of message.blocks) {
        if (block.type !== 'text' || totalTextBytes <= MAX_TEXT_BYTES) continue
        const budget = Math.max(0, MAX_TEXT_BYTES - (totalTextBytes - byteLength(block.text)))
        const result = truncateTextToBytes(block.text, budget)
        totalTextBytes -= byteLength(block.text) - byteLength(result.text)
        block.text = result.text
      }
    }
  }

  let title = '会话分享'
  const firstUser = messages.find(message => message.role === 'user')
  const firstText = firstUser?.blocks.find(block => block.type === 'text')
  if (firstText !== undefined && firstText.text.trim() !== '') {
    title = truncateTitle(firstText.text.trim())
  }

  return { title, truncated, messages }
}

/**
 * Register the share plugin: four authenticated API routes plus the public
 * /share/<token> page route under `config.root`.
 * @param ctx - plugin context carrying webServer and connection.
 * @param config - `{ root }`: the snapshot directory (created on activation).
 */
export function apply(ctx, config = {}) {
  const root = typeof config?.root === 'string' && config.root !== ''
    ? config.root
    : join(homedir(), '.dsh', 'shares')
  // Optional public base for share URLs (e.g. an internet-facing reverse
  // proxy); when set, create answers with a ready-to-copy absolute URL.
  const publicOrigin = typeof config?.publicOrigin === 'string'
    && /^https?:\/\//.test(config.publicOrigin)
    ? config.publicOrigin.replace(/\/+$/, '')
    : null
  let rootReady = false
  const ready = mkdir(root, { recursive: true })
    .then(() => { rootReady = true })
    .catch((error) => {
      ctx.logger.error(`dsh-share: cannot create share root: ${error instanceof Error ? error.message : String(error)}`)
    })

  /** Wait for the share root; answers false when the directory never became ready. */
  const ensureRoot = async () => {
    await ready
    return rootReady
  }

  /** Snapshots are small; read one whole file defensively. */
  const readSnapshot = async (token) => {
    const size = (await readFile(join(root, `${token}.html`))).byteLength
    return size
  }

  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/session.share.content',
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    fetch: async (request) => {
      if (request.method !== 'GET') return new Response(null, { status: 200, headers: JSON_HEADERS })
      const sessionId = new URL(request.url).searchParams.get('sessionId')
      if (sessionId === null || sessionId === '') return fail(400, 'missing sessionId')
      const sessionQuery = ctx.get('sessionQuery')
      if (sessionQuery === undefined) return fail(500, 'session query unavailable')
      let observed
      try {
        observed = await sessionQuery.observeSession(sessionId, { signal: request.signal })
      } catch {
        return fail(404, 'session not found')
      }
      try {
        const payload = sharePayloadOf(observed.events)
        // The browser uploads the snapshot to this public relay (CORS-open)
        // so share links work for every plugin user, not only the owner.
        const body = publicOrigin === null ? payload : { ...payload, publicOrigin }
        return new Response(JSON.stringify(body), { status: 200, headers: JSON_HEADERS })
      } catch {
        return fail(500, 'failed to build share content')
      } finally {
        try {
          if (typeof observed[Symbol.dispose] === 'function') observed[Symbol.dispose]()
          else if (typeof observed.dispose === 'function') observed.dispose()
        } catch { /* disposal best-effort */ }
      }
    },
  }), 'dsh-share: content route')

  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/session.share.media',
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const params = new URL(request.url).searchParams
      const attachmentId = params.get('attachmentId') ?? ''
      const mediaType = params.get('mediaType') ?? ''
      const bytes = Number(params.get('bytes'))
      const width = Number(params.get('width'))
      const height = Number(params.get('height'))
      if (!ATTACHMENT_ID_PATTERN.test(attachmentId)
        || !IMAGE_MEDIA_TYPES.has(mediaType)
        || !Number.isSafeInteger(bytes) || bytes <= 0
        || !Number.isSafeInteger(width) || width <= 0
        || !Number.isSafeInteger(height) || height <= 0) {
        return fail(400, 'invalid attachment reference')
      }
      const attachments = ctx.get('attachments')
      if (attachments === undefined) return fail(500, 'attachments unavailable')
      try {
        const stored = await attachments.readImage({ attachmentId, mediaType, bytes, width, height }, request.signal)
        return new Response(stored.data.slice(), {
          status: 200,
          headers: { 'content-type': mediaType, 'cache-control': 'private, no-store' },
        })
      } catch {
        return fail(404, 'attachment not found')
      }
    },
  }), 'dsh-share: media route')

  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/session.share.create',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      if (!(await ensureRoot())) return fail(500, 'share storage unavailable')
      let raw
      try {
        raw = await request.text()
      } catch {
        return fail(400, 'unreadable body')
      }
      if (byteLength(raw) > MAX_CREATE_BYTES) return fail(413, 'payload too large')
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch {
        return fail(400, 'invalid JSON')
      }
      const title = typeof parsed?.title === 'string' ? Array.from(parsed.title).slice(0, 200).join('') : ''
      const html = typeof parsed?.html === 'string' ? parsed.html : null
      if (html === null || html === '') return fail(400, 'missing html')
      let token = randomBytes(18).toString('base64url')
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await readSnapshot(token)
          token = randomBytes(18).toString('base64url')
        } catch {
          break
        }
      }
      const target = join(root, `${token}.html`)
      const staging = join(root, `.${token}.tmp`)
      try {
        await writeFile(staging, html, 'utf8')
        await rename(staging, target)
      } catch {
        await unlink(staging).catch(() => {})
        return fail(500, 'failed to store share')
      }
      return new Response(JSON.stringify({
        path: `/share/${token}`,
        ...(publicOrigin === null ? {} : { publicUrl: `${publicOrigin}/share/${token}` }),
      }), { status: 200, headers: JSON_HEADERS })
    },
  }), 'dsh-share: create route')

  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/session.share',
    methods: ['DELETE'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const token = new URL(request.url).searchParams.get('token') ?? ''
      if (!TOKEN_PATTERN.test(token)) return fail(400, 'invalid token')
      try {
        await unlink(join(root, `${token}.html`))
      } catch {
        return fail(404, 'share not found')
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: JSON_HEADERS })
    },
  }), 'dsh-share: delete route')

  // The public page: a named route wins over the SPA fallback and never goes
  // through browser-session authentication; the token is the capability.
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/share',
    handler: async (req, res) => {
      const answer = (status, headers = PLAIN_HEADERS, body = '') => {
        res.writeHead(status, headers)
        res.end(req.method === 'HEAD' ? undefined : body)
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        answer(405, { ...PLAIN_HEADERS, allow: 'GET, HEAD' }, 'method not allowed')
        return
      }
      let pathname
      try {
        pathname = new URL(req.url ?? '/', 'http://x').pathname
      } catch {
        answer(404)
        return
      }
      const token = pathname.slice('/share/'.length)
      if (!TOKEN_PATTERN.test(token) || token.includes('/')) {
        answer(404)
        return
      }
      await ready
      let body
      try {
        body = await readFile(join(root, `${token}.html`))
      } catch {
        answer(404)
        return
      }
      answer(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex',
        'content-security-policy': "sandbox allow-scripts; default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; form-action 'none'",
      }, body)
    },
  }), 'dsh-share: public page route')
}
