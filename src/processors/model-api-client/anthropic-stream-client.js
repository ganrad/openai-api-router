/**
 * Name: Azure Anthropic (Claude) Messages API Streaming Client
 * Description: This class implements a streaming client for Azure Messages API.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 06-10-2026
 * Version (Introduced): v3.0.1
 *
 * Notes:
 * 
*/
'use strict';
const { HttpMethods } = require("../../utilities/app-gtwy-constants.js");

class AnthropicError extends Error {
  constructor(message, { status, type, body } = {}) {
    super(message);
    this.name = 'AnthropicError';
    this.status = status;
    this.type = type;
    this.body = body;
  }
}

class AnthropicClient {
  /**
   * @param {object} opts
   * @param {string} [opts.targetUrl]       - Target model deployment endpoint.
   * @param {object} [opts.headers]         - HTTP headers to send to the target endpoint.
   * @param {number} [opts.timeoutMs]       - Per-request timeout (default 60s).
   * @param {string[]} [opts.betaHeaders]   - Optional anthropic-beta feature flags.
   */
  constructor({
    targetUrl,
    headers,
    timeoutMs = 60_000,
    betaHeaders = [],
  } = {}) {

    this.baseUrl = targetUrl;
    this.headers = headers;
    if (betaHeaders.length) {
      this.headers['anthropic-beta'] = betaHeaders.join(',');
    };
    this.timeoutMs = timeoutMs;
  }

  /**
   * Internal: fire the HTTP request with a timeout via AbortController.
   */
  async _post(body, { signal } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    // Chain an externally-provided signal, if any.
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    };

    try {
      const res = await fetch(this.baseUrl, {
        method: HttpMethods.POST,
        headers: this.headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return res;
    }
    finally {
      clearTimeout(timer);
    };
  }

  async _raiseForError(res) {
    let payload;
    const text = await res.text();
    try {
      payload = JSON.parse(text);
    } 
    catch {
      payload = { raw: text };
    };

    const type = payload?.error?.type;
    const msg = payload?.error?.message || `HTTP ${res.status} ${res.statusText}`;
    throw new AnthropicError(msg, { status: res.status, type, body: payload });
  }

  // ---------------------------------------------------------------------------
  // NON-STREAMING
  // ---------------------------------------------------------------------------

  /**
   * Single-shot completion. Returns the full parsed Message object.
   * @param {object} params - { model, messages, max_tokens, system, temperature, ... }
   * @returns {Promise<object>}
   */
  async createMessage(params, { signal } = {}) {
    const body = { ...params, stream: false };
    const res = await this._post(body, { signal });

    if (!res.ok) await this._raiseForError(res);

    return res.json();
  }

  // ---------------------------------------------------------------------------
  // STREAMING (Server-Sent Events)
  // ---------------------------------------------------------------------------

  /**
   * Streaming completion. Async-iterates parsed SSE events:
   *   { event: 'content_block_delta', data: {...} }, etc.
   *
   * Usage:
   *   for await (const evt of client.streamMessage({...})) { ... }
   *
   * @param {object} params
   * @param {object}   [opts]
   * @param {AbortSignal} [opts.signal]      - Cancel the request/stream.
   * @param {object}      [opts.expressRes]  - Optional ExpressJS response; when
   *                                           provided, each event is piped to
   *                                           it as a properly-formatted SSE frame.
   * @returns {AsyncGenerator<{event: string, data: object}>}
   */
  async *streamMessage(params, { signal, expressRes } = {}) {
    const body = { ...params, stream: true };
    const res = await this._post(body, { signal });

    if (!res.ok) {
      // Surface the error to the Express client too, if one is attached.
      if (expressRes && !expressRes.headersSent) {
        try { await this._raiseForError(res); }
        catch (err) {
          expressRes.status(err.status || 500).json({
            error: { type: err.type, message: err.message },
          });
          return;
        }
      }
      await this._raiseForError(res);
    }
    if (!res.body) throw new AnthropicError('No response body for stream.');

    // Prepare the Express response as an SSE stream (only once).
    this._initSse(expressRes);

    // Abort upstream if the downstream client disconnects.
    if (expressRes) {
      expressRes.on('close', () => {
        if (signal && !signal.aborted) { /* caller owns signal */ }
      });
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      // res.body is a WHATWG ReadableStream; async-iterate its chunks.
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });

        // SSE events are delimited by a blank line (\n\n). Handle \r\n too.
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          const parsed = this._parseSseBlock(rawEvent);
          if (parsed) {
            this._writeSse(expressRes, parsed);
            yield parsed;
          }
        }
      }

      // Flush any trailing event without a final blank line.
      const tail = buffer.trim();
      if (tail) {
        const parsed = this._parseSseBlock(tail);
        if (parsed) {
          this._writeSse(expressRes, parsed);
          yield parsed;
        }
      }
    } finally {
      // Close the Express SSE stream when the upstream is done/aborted.
      if (expressRes && !expressRes.writableEnded) expressRes.end();
    }
  }

  /** Initialize SSE headers on the Express response (idempotent). */
  _initSse(expressRes) {
    if (!expressRes || expressRes.headersSent) return;
    expressRes.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable proxy buffering (e.g. nginx)
    });
    if (typeof expressRes.flushHeaders === 'function') expressRes.flushHeaders();
  }

  /** Write one parsed event to the Express response as an SSE frame. */
  _writeSse(expressRes, parsed) {
    if (!expressRes || expressRes.writableEnded) return;
    const frame =
      `event: ${parsed.event}\n` +
      `data: ${JSON.stringify(parsed.data)}\n\n`;
    expressRes.write(frame);
  }

  /**
   * Parse one SSE block into { event, data }.
   * A block looks like:
   *   event: content_block_delta
   *   data: {"type":"content_block_delta", ...}
   */
  _parseSseBlock(block) {
    let eventName = 'message';
    const dataLines = [];

    for (const line of block.split('\n')) {
      const trimmed = line.replace(/\r$/, '');
      if (!trimmed || trimmed.startsWith(':')) continue; // comment / keep-alive
      if (trimmed.startsWith('event:')) {
        eventName = trimmed.slice(6).trim();
      } else if (trimmed.startsWith('data:')) {
        dataLines.push(trimmed.slice(5).trim());
      }
    }

    if (!dataLines.length) return null;

    const dataStr = dataLines.join('\n');
    if (dataStr === '[DONE]') return { event: eventName, data: { done: true } };

    let data;
    try {
      data = JSON.parse(dataStr);
    } 
    catch {
      data = { raw: dataStr };
    };
    return { event: eventName, data };
  }

  /**
   * Convenience helper: stream and assemble the final text.
   * Optionally invoke onDelta(textChunk) for live output.
   * Optionally pipe SSE frames to an ExpressJS response via expressRes.
   *
   * Also captures token usage across the stream:
   *   - input / cache-read / cache-write  -> from `message_start`
   *   - output (cumulative)               -> updated from `message_delta`
   *
   * @returns {Promise<{ text: string, message: object|null, usage: object }>}
   */
  async streamToText(params, { signal, onDelta, expressRes } = {}) {
    let text = '';
    let finalMessage = null;
    let stopReason = null;
    let stopSequence = null;

    // Normalized usage accumulator.
    const usage = {
      input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
    };

    const mergeUsage = (u) => {
      if (!u) return;
      if (typeof u.input_tokens === 'number') usage.input_tokens = u.input_tokens;
      if (typeof u.cache_read_input_tokens === 'number')
        usage.cache_read_input_tokens = u.cache_read_input_tokens;
      if (typeof u.cache_creation_input_tokens === 'number')
        usage.cache_creation_input_tokens = u.cache_creation_input_tokens;
      // output_tokens is cumulative; later events carry the latest total.
      if (typeof u.output_tokens === 'number') usage.output_tokens = u.output_tokens;
    };

    for await (const { event, data } of this.streamMessage(params, { signal, expressRes })) {
      switch (event) {
        case 'message_start':
          finalMessage = data.message ?? null;
          // Initial usage: input + cache counts (output is typically 1 here).
          mergeUsage(data.message?.usage);
          break;
        case 'content_block_delta':
          if (data?.delta?.type === 'text_delta' && data.delta.text) {
            text += data.delta.text;
            if (onDelta) onDelta(data.delta.text);
          }
          break;
        case 'message_delta':
          // Carries the cumulative output_tokens (and sometimes refreshed input).
          mergeUsage(data.usage);
          break;
        case 'error':
          throw new AnthropicError(
            data?.error?.message || 'Stream error',
            { type: data?.error?.type, body: data }
          );
        default:
          break; // content_block_start/stop, message_stop, ping, etc.
      }
    }

    // Convenience totals.
    usage.total_input_tokens =
      usage.input_tokens +
      usage.cache_read_input_tokens +
      usage.cache_creation_input_tokens;
    usage.total_tokens = usage.total_input_tokens + usage.output_tokens;

    return { text, message: finalMessage, usage };
  }
}

module.exports = { AnthropicClient, AnthropicError };