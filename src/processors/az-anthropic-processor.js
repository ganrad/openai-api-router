/**
 * Name: Azure Anthropic (Claude) Messages API processor
 * Description: This class implements a processor for executing A\ on Azure Messages API requests.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 06-04-2026
 * Version (Introduced): v3.0.1
 *
 * Notes:
 * 
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger.js');

const CacheDao = require("../utilities/cache-dao.js");
const cachedb = require("../services/cp-pg.js");
const { TblNames, PersistDao } = require("../utilities/persist-dao.js");
const persistdb = require("../services/pp-pg.js");
const UserMemDao = require("../utilities/user-mem-dao.js");

const {
  generateGUID,
  HttpMethods,
  CustomRequestHeaders,
  EndpointRouterTypes,
  OpenAIChatCompletionMsgRoleTypes,
  EndpointMiscConstants,
  AiGatewayInboundReqApiType,
  A2AProtocolAttributes,
  A2AErrorCodes
} = require("../utilities/app-gtwy-constants.js");

const { AiApiError } = require("../utilities/helper-classes.js");

const { getExtractionPrompt, updateSystemMessage, storeUserFacts } = require("../lib/lt-mem-manager.js");
const { getOpenAICallMetadata, callAiAppEndpoint, retrieveUniqueURI } = require("../utilities/helper-funcs.js");
const { streamA2AResponse } = require("../utilities/a2a-helper-funcs.js");
const { processBatch, processStream } = require("../lib/payload-normalizer-v2.js");
const { RemoteServerTools } = require("../remote-servers/remote-server-tools.js");
const { ToolPlannerExecutor } = require("../remote-servers/tool-planner-executor.js");
const { sendStatus, sendTrace, sendError, sendDone } = require("../lib/sse-event-broker.js");
const SecurityEngine = require('../security/security-engine.js'); 

class AzAnthropicProcessor {

  constructor() {
    this.request = null;  // Initialize request
  }

  #checkAndPruneCtxMsgs(count, msgs) {
    let aCount = count * 2;

    let mLength = msgs.length;

    if (mLength > aCount)
      msgs.splice(2, 2); // 1) Keep the original 2 messages => role = user and assistant & 2) Delete the next 2 messages (role=user + assistant)

    return (msgs)
  }

  /**
   * Internal: fire the HTTP request with a timeout via AbortController.
   */
  async _post(modelTargetUri, headers, body, { signal } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000); // CHECK

    // Chain an externally-provided signal, if any.
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    };

    try {
      const res = await fetch(modelTargetUri, {
        method: HttpMethods.POST,
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      return res;
    }
    finally {
      clearTimeout(timer);
    };
  }

  // ---------------------------------------------------------------------------
  // STREAMING (Server-Sent Events)
  // ---------------------------------------------------------------------------

  /**
   * Streaming completion. Async-iterates parsed SSE events:
   *   { event: 'content_block_delta', data: {...} }, etc.
   *
   * Usage:
   *   for await (const evt of _streamMessage({...})) { ... }
   *
   * @param {string}   requestid             - Request ID
   * @param {string}   threadid              - Thread ID
   * @param {object}   res                   - Response object
   * @param {object}   [opts]
   * @param {AbortSignal} [opts.signal]      - Cancel the request/stream.
   * @param {object}      [opts.expressRes]  - Optional ExpressJS response; when
   *                                           provided, each event is piped to
   *                                           it as a properly-formatted SSE frame.
   * @returns {AsyncGenerator<{event: string, data: object}>}
   */
  async * _streamMessage(requestid, threadid, res, { signal, expressRes } = {}) {

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
      };

      await this._raiseForError(res);
    };

    if (!res.body) throw new AiApiError('No response body for stream.', AiGatewayInboundReqApiType.Anthropic);

    // Prepare the Express response as an SSE stream (only once).
    this._initSse(requestid, threadid, expressRes);

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
          };
        };
      };

      // Flush any trailing event without a final blank line.
      const tail = buffer.trim();
      if (tail) {
        const parsed = this._parseSseBlock(tail);
        if (parsed) {
          this._writeSse(expressRes, parsed);
          yield parsed;
        };
      };
    }
    finally {
      // Close the Express SSE stream when the upstream is done/aborted.
      // if (expressRes && !expressRes.writableEnded) expressRes.end();
      // expressRes will be closed by the apirouter!
    };
  }

  /** Initialize SSE headers on the Express response (idempotent). */
  _initSse(requestid, threadid, expressRes) {
    if (!expressRes || expressRes.headersSent) return;

    // Send 200 response status and headers
    let res_hdrs = CustomRequestHeaders.RequestId;
    expressRes.setHeader('Content-Type', 'text/event-stream');
    expressRes.setHeader('Cache-Control', 'no-cache, no-transform');
    expressRes.setHeader('Connection', 'keep-alive');
    expressRes.set(CustomRequestHeaders.RequestId, requestid);
    if (threadid) {
      res_hdrs += ', ' + CustomRequestHeaders.ThreadId;
      expressRes.set(CustomRequestHeaders.ThreadId, threadid);
    };
    expressRes.set("Access-Control-Expose-Headers", res_hdrs);
    expressRes.set("X-Accel-Buffering", "no"); // Tell Nginx servers (if present as reverse proxy) to not buffer SSE events

    /*
    expressRes.flushHeaders();
    expressRes.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable proxy buffering (e.g. nginx)
    }); */

    if (typeof expressRes.flushHeaders === 'function')
      expressRes.flushHeaders();
  }

  /** Write one parsed event to the Express response as an SSE frame. */
  _writeSse(expressRes, parsed) {
    if (!expressRes || expressRes.writableEnded) return;
    const frame =
      `event: ${parsed.event}\n` +
      `data: ${JSON.stringify(parsed.data)}\n\n`;

    // 0 - if (parsed.event === "message_delta")
      // console.log(`**** Event: ${frame} ****`);

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
   * Reassemble a non-streamed-shaped Message from streamed pieces.
   * Output matches the schema returned by Messages API response, so cached
   * responses can be served back identically to a fresh API call.
   *
   * @param {object} p
   * @param {string} p.text                 - Assembled text from the stream.
   * @param {object|null} p.message         - The message_start `message` skeleton.
   * @param {object} p.usage                - Accumulated usage counts.
   * @param {string|null} [p.stop_reason]
   * @param {string|null} [p.stop_sequence]
   * @returns {object} Non-streamed Message object.
   */
  #buildMessageFromStream({ text, message, usage = {}, stop_reason = null, stop_sequence = null }) {
    return {
      id: message?.id ?? null,
      type: message?.type ?? 'message',
      role: message?.role ?? 'assistant',
      model: message?.model ?? null,
      content: text ? [{ type: 'text', text }] : [],
      stop_reason,
      stop_sequence,
      // Use Anthropic's exact field names so it matches a fresh response 1:1.
      usage: {
        input_tokens: usage.input_tokens ?? 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0
      },
    };
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
     * @returns {Promise<{ text: string, message: object|null, usage: object, nonStreamResponse: object }>}
     */
  async #streamToText(requestid, threadid, appId, response, { signal, onDelta, expressRes } = {}) {
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

    if (this.request.inboundApiType === AiGatewayInboundReqApiType.Agent2Agent) {  // A2A API
      // Prepare the Express response as an SSE stream (only once).
      this._initSse(requestid, threadid, expressRes);

      const a2aRequest = {
        requestId,
        threadId,
        appId,
        inputMessage: this.request.a2aMessage,
        responseStream: expressRes,
        anthropicResponse: response,
        a2aReqId: this.request.a2aReqId
      };

      const a2aResponse = await streamA2AResponse(a2aRequest, false);
      text = a2aResponse.recv_data;
      finalMessage = a2aResponse.call_data;
      stopReason = finalMessage.stopReason;
      stopSequence = finalMessage.stopSequence;

      usage.input_tokens = finalMessage.usage.input_tokens;
      usage.cache_read_input_tokens = finalMessage.usage.cache_read_input_tokens ?? 0;
      usage.cache_creation_input_tokens = finalMessage.usage.cache_creation_input_tokens ?? 0;
      usage.output_tokens = finalMessage.usage.output_tokens;
    }
    else { // Anthropic Messages API

      for await (const { event, data } of this._streamMessage(requestid, threadid, response, { signal, expressRes })) {
        switch (event) {
          case 'message_start': // CHECK: Use constants?
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
            // Final stop fields arrive here, not in message_start.
            if (data.delta?.stop_reason !== undefined) stopReason = data.delta.stop_reason;
            if (data.delta?.stop_sequence !== undefined) stopSequence = data.delta.stop_sequence;

            break;
          case 'error':
            throw new AiApiError(
              data?.error?.message || 'Stream error',
              AiGatewayInboundReqApiType.Anthropic,
              { type: data?.error?.type, body: data }
            );
          default:
            break; // content_block_start/stop, message_stop, ping, etc.
        };
      };
    }; // end of if

    // Convenience totals.
    usage.total_input_tokens =
      usage.input_tokens +
      usage.cache_read_input_tokens +
      usage.cache_creation_input_tokens;
    usage.total_tokens = usage.total_input_tokens + usage.output_tokens;

    // Build the DB-ready, non-streamed-shaped Message.
    const nonStreamResponse = this.#buildMessageFromStream({
      text, message: finalMessage, usage, stop_reason: stopReason, stop_sequence: stopSequence
    });

    return { text, message: finalMessage, usage, nonStreamResponse };
  }

  /**
   * Replay a cached (non-streamed) Message as a full Anthropic SSE stream.
   * Emits the exact event sequence the Claude SDK expects, so clients can
   * consume a cache hit identically to a live streaming call.
   *
   * Event order:
   *   message_start
   *     -> [ content_block_start, content_block_delta..., content_block_stop ] per block
   *   message_delta (stop_reason/stop_sequence + final output usage)
   *   message_stop
   *
   * @param {string} requestid         - Request id
   * @param {string} threadid          - (optional) Thread id
   * @param {string} appid             - AI Application id
   * @param {object} cached            - A Message object (Messages API Response shape).
   * @param {object} [opts]
   * @param {object} [opts.expressRes] - ExpressJS response to pipe SSE frames to.
   * @param {function} [opts.onEvent]  - Optional callback({event, data}) per frame.
   * @param {number} [opts.chunkSize]  - Split text blocks into N-char deltas (0 = single delta).
   * @param {number} [opts.delayMs]    - Optional delay between deltas to simulate streaming.
   * @returns {Promise<void>}
   */
  async #streamCachedResponse(requestid, threadid, appid, cached, { expressRes, onEvent, chunkSize = 0, delayMs = 0 } = {}) {
    if (!cached || typeof cached !== 'object') {
      throw new AiApiError('streamCachedResponse: a cached Message object is required.', AiGatewayInboundReqApiType.Anthropic);
    };

    this._initSse(requestid, threadid, expressRes);

    if (this.request.inboundApiType === AiGatewayInboundReqApiType.Agent2Agent) {
      const a2aRequest = {
        requestId: requestid,
        threadId: threadid,
        appId: appid,
        inputMessage: this.request.a2aMessage,
        responseStream: expressRes,
        responsePayload: cached.content[0].text,
        a2aReqId: this.request.a2aReqId
      };

      await streamA2AResponse(a2aRequest, true);

      return {
        http_code: 200, // All ok. Serving completion from cache.
        cached: true
      };
    };

    const emit = async (event, data) => {
      const frame = { event, data: { type: event, ...data } };
      this._writeSse(expressRes, frame);
      if (onEvent) onEvent(frame);
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    };

    const usage = cached.usage || {};
    const content = Array.isArray(cached.content) ? cached.content : [];

    try {
      // 1) message_start — content is empty; output_tokens starts at 0.
      await emit('message_start', {
        message: {
          id: cached.id ?? null,
          type: cached.type ?? 'message',
          role: cached.role ?? 'assistant',
          model: cached.model ?? null,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: usage.input_tokens ?? 0,
            cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
            cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
            output_tokens: usage.output_tokens ?? 0,
          },
        },
      });

      // 2) One start/delta(s)/stop cycle per content block.
      for (let index = 0; index < content.length; index++) {
        const block = content[index];

        if (block.type === 'text') {
          await emit('content_block_start', {
            index,
            content_block: { type: 'text', text: '' },
          });

          const text = block.text ?? '';
          for (const piece of this._splitText(text, chunkSize)) {
            await emit('content_block_delta', {
              index,
              delta: { type: 'text_delta', text: piece },
            });
          }
        }
        else if (block.type === 'tool_use') {
          await emit('content_block_start', {
            index,
            content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} },
          });
          // tool_use input is streamed as partial JSON.
          await emit('content_block_delta', {
            index,
            delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input ?? {}) },
          });
        }
        else if (block.type === 'thinking') {
          await emit('content_block_start', {
            index,
            content_block: { type: 'thinking', thinking: '' },
          });
          await emit('content_block_delta', {
            index,
            delta: { type: 'thinking_delta', thinking: block.thinking ?? '' },
          });
          if (block.signature) {
            await emit('content_block_delta', {
              index,
              delta: { type: 'signature_delta', signature: block.signature },
            });
          }
        }
        else {
          // Unknown block type: emit start with the block as-is, no delta.
          await emit('content_block_start', { index, content_block: block });
        };

        await emit('content_block_stop', { index });
      }; // end of for loop

      // 3) message_delta — final stop fields + cumulative output usage.
      await emit('message_delta', {
        delta: {
          stop_reason: cached.stop_reason ?? 'end_turn',
          stop_sequence: cached.stop_sequence ?? null,
        },
        usage: { output_tokens: usage.output_tokens ?? 0 },
      });

      // 4) message_stop — terminal event.
      await emit('message_stop', {});
    }
    finally {
      // if (expressRes && !expressRes.writableEnded) expressRes.end();
    };

    return {
      http_code: 200, // All ok. Serving completion from cache.
      cached: true
    };
  }

  /** Split text into chunks of `size` chars (size <= 0 => single chunk). */
  _splitText(text, size) {
    if (!text) return [];
    if (!size || size <= 0) return [text];
    const out = [];
    for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
    return out;
  }

  async processRequest(
    req, // 0
    res, // 1
    config) { // 2

    let apps = req.targeturis; // Ai applications object
    let cacheConfig = req.cacheconfig; // global cache config
    let memoryConfig = arguments[3]; // AI application state management config ID05062024.n
    let appConnections = arguments[4]; // EP metrics obj for all apps
    let cacheMetrics = arguments[5]; // Cache hit metrics of Ai App
    const userMemConfig = arguments[6]; // ID05142025.n; AI App specific long term memory config
    const routerInstance = arguments[7]; // ID06162025.n; AI App specific endpoint router instance
    let manageState = (process.env.API_GATEWAY_STATE_MGMT === 'true') ? true : false
    let instanceName = (process.env.POD_NAME) ? apps.serverId + '-' + process.env.POD_NAME : apps.serverId; // Server instance name
    this.request = req; // Initialize the request object
    req.body_copy = req.body; // Save a copy of the request body

    // State management is only supported for Messages API!
    if (memoryConfig && (!req.body.messages)) // If the request is not of type == messages
      memoryConfig = null;

    // Long term memory management is only supported for messages API!
    if (userMemConfig && (!req.body.messages)) // If the request is not of type == messages
      userMemConfig = null;

    // 1. Get thread ID in request header.  Also, get the session id in request header if it's present
    // -----------------------------------
    let threadId = null;
    let sessionId = null;
    if (req.inboundApiType === AiGatewayInboundReqApiType.Anthropic) {
      threadId = req.get(CustomRequestHeaders.ThreadId);
      sessionId = req.get(CustomRequestHeaders.SessionId);
    }
    else {
      threadId = req.body.threadId;
      delete req.body.threadId;
    };

    if (sessionId) {
      sendStatus(sessionId, '🧠 Understanding request...');
      sendTrace(sessionId, `Processing Request ID: ${req.id} for AI App: ${config.appId}`);
    };

    let threadStarted = false;

    // Imp.: User: req.authInfo?.token.name, refers to the authenticated user's request!
    logger.log({ level: "info", message: "[%s] %s.processRequest(): Request ID: %s\n  API Type: %s\n  URL: %s\n  User: %s\n  Thread ID: %s\n  Application ID: %s\n  Type: %s\n  Request Payload:\n  %s", splat: [scriptName, this.constructor.name, req.id, req.inboundApiType, req.originalUrl, req.authInfo?.token.name, threadId, config.appId, config.appType, JSON.stringify(req.body, null, 2)] }); // ID07292024.n

    let respMessage = null; // IMPORTANT: Populate this var before returning!!

    // 2. Check prompt present in cache?
    // ---------------------------------
    // Has caching been disabled on the request using query param ~
    // 'use_cache=false' ?
    let useCache = config.useCache;
    if (useCache && req.query.use_cache)
      useCache = req.query.use_cache === 'false' ? false : useCache;

    let stTime;
    let vecEndpoints = null;
    let embeddedPrompt = null;
    let cacheDao = null;
    let memoryDao = null;
    let promptDao = null;
    let values = null;
    let err_msg = null;
    let uriIdx = 0;
    let endpointId = 0;
    let routerEndpointId;
    let routerIdTried = false;
    let userMessage = null;

    try {
      userMessage = req.body.messages.find(msg => msg.role === OpenAIChatCompletionMsgRoleTypes.UserMessage)?.content;
    }
    catch (error) {
      const emsg = `Invalid Payload. Error: ${error}`;

      err_msg = {
        error: {
          target: req.originalUrl,
          message: emsg,
          code: "invalidPayload"
        }
      };

      respMessage = {
        http_code: 400, // Bad request
        data: (req.inboundApiType === AiGatewayInboundReqApiType.Anthropic) ? err_msg :
          {
            jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
            id: req.a2aReqId,
            error: { code: -32602, message: emsg } // Invalid method parameters
          }
      };

      return (respMessage);
    };

    if (req.body.tools) { // Tool calling is not supported!
      const emsg = "Tool calling is not supported!";

      err_msg = {
        error: {
          target: req.originalUrl,
          message: emsg,
          code: "invalidPayload"
        }
      };

      respMessage = {
        http_code: 400, // Bad request
        data: (req.inboundApiType === AiGatewayInboundReqApiType.Anthropic) ? err_msg :
          {
            jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
            id: req.a2aReqId,
            error: { code: -32602, message: emsg } // Invalid method parameters
          }
      };

      return (respMessage);
    };

    let epdata = appConnections.getConnection(config.appId);

    if (!threadId) {
      if (cacheConfig.cacheResults && useCache) { // Is caching enabled?
        let appSecurityPolicies = null;

        for (const application of apps.applications) {
          if (application.appId === cacheConfig.embeddApp) {
            vecEndpoints = application.endpoints;
            appSecurityPolicies = application.securitySettings;

            break;
          };
        };

        if (sessionId)
          sendStatus(sessionId, '🔍 Searching semantic cache(s)...');

        stTime = Date.now();
        // Perform semantic search using input prompt
        cacheDao = new CacheDao(
          appConnections.getConnection(cacheConfig.embeddApp),
          vecEndpoints,
          config.srchType,
          config.srchDistance,
          config.srchContent,
          config.encryptionKey,
          cacheMetrics,
          config.level1Cache,
          config.level2Config,
          appSecurityPolicies);

        const { rowCount, cacheLevel, completion, embeddings } =
          await cacheDao.queryVectorDB(
            req,
            config.appId,
            cachedb
          );

        if (rowCount === 1) { // Cache hit!

          if (sessionId)
            sendTrace(sessionId, `Semantic cache hit. Response served from Semantic Cache Tier: <b>${cacheLevel}</b>`);

          if (req.body.messages && manageState && memoryConfig && memoryConfig.useMemory) { // Generate thread id if manage state == true
            threadId = generateGUID("thread");

            // When response is served from the cache and state mgmt is turned on, update the thread count of the first end-point
            for (const element of config.appEndpoints) {
              let metricsObj = epdata.get(retrieveUniqueURI(element.uri, element.id));
              metricsObj.updateUserThreads();

              break;
            };
          };

          respMessage = (req.body.stream) ? await
            this.#streamCachedResponse(req.id, threadId, config.appId, completion, { expressRes: res }) :
            {
              http_code: 200, // All ok. Serving completion from cache.
              cached: true,
              data: completion
            };

          // Insert cached response in prompts table. This record is also used to collect user feedback.
          let persistPrompts = (process.env.API_GATEWAY_PERSIST_PROMPTS === 'true') ? true : false;
          if (persistPrompts) { // Persist prompt and completion ?
            promptDao = new PersistDao(persistdb, TblNames.Prompts);
            values = [
              req.id,
              instanceName,
              config.appId,
              req.body,
              completion,
              {},
              req.body.user,
              0, // No remote tools were executed!
              (Date.now() - stTime) / 1000,
              EndpointMiscConstants.IdCached // Use '-cached-' as endpoint ID since this is a cached response
            ];
            if (threadId) {
              values.splice(5, 1);
              values.unshift(threadId);
            };

            (threadId) ? await promptDao.storeEntity(req.id, 2, values) : await promptDao.storeEntity(req.id, 0, values);
          };

          if (req.body.messages && manageState && memoryConfig && memoryConfig.useMemory) { // Manage state for this AI application?
            respMessage.threadId = threadId;

            let saveMsg = {
              role: completion.role,
              content: completion.content
            };

            req.body.messages.push(saveMsg);
            logger.log({ level: "debug", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Thread ID: %s\n  Prompt + Cached Message:\n  %s", splat: [scriptName, this.constructor.name, req.id, threadId, JSON.stringify(req.body.messages, null, 2)] });

            memoryDao = new PersistDao(persistdb, TblNames.Memory);
            values = [
              req.id,
              instanceName,
              threadId,
              config.appId,
              {
                content: req.body.messages
              },
              req.body.user,
              0
            ];

            await memoryDao.storeEntity(req.id, 0, values);
          };

          if (sessionId) {
            sendStatus(sessionId, "🏁 Completed");
            sendTrace(sessionId, "Response ready");
            sendDone(sessionId, { threadId: threadId || null }); // Important so client can de-register!
          };

          return (respMessage);
        }
        else { // Semantic cache miss
          embeddedPrompt = embeddings;
          if (sessionId)
            sendTrace(sessionId, 'Semantic cache miss');
        };
      }; // No caching configured
    }
    else { // Start of user session if
      memoryDao = new PersistDao(persistdb, TblNames.Memory);
      values = [
        threadId,
        config.appId
      ];

      // retrieve the thread context
      const userContext = await memoryDao.queryTable(req.id, 1, values);
      if (userContext.rCount === 1) {
        let ctxContent = userContext.data[0].context.content;
        let ctxMsgs = ctxContent.concat(req.body.messages);

        if (memoryConfig.msgCount >= 1)
          this.#checkAndPruneCtxMsgs(memoryConfig.msgCount, ctxMsgs);

        req.body.messages = ctxMsgs;
        endpointId = userContext.data[0].endpoint_id;

        logger.log({ level: "debug", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Thread ID: %s\n  Endpoint ID: %s\n  Prompt + Retrieved Message:\n  %s", splat: [scriptName, this.constructor.name, req.id, threadId, endpointId, JSON.stringify(req.body.messages, null, 2)] });
      }
      else {
        const emsg = `The user session associated with Thread ID=[${threadId}] has either expired or is invalid! Start a new user session.`;
        err_msg = {
          error: {
            target: req.originalUrl,
            message: emsg,
            code: "invalidPayload"
          }
        };

        respMessage = {
          http_code: 400, // Bad request
          data: (req.inboundApiType === AiGatewayInboundReqApiType.Anthropic) ? err_msg :
            {
              jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
              id: req.a2aReqId,
              error: { code: -32602, message: emsg } // Invalid method parameters
            }
        };

        return (respMessage);
      };

      if (memoryConfig.affinity)
        routerIdTried = true;
    }; // end of user session if

    let th_id = !threadId && (manageState && memoryConfig && memoryConfig.useMemory) ? (function () { threadStarted = true; return (generateGUID("thread")); })() : threadId;

    /**
     * 
     * When remote server config is present for an AI App, make a call to remote servers and fetch the tools.
     * This is an optional step and will only be executed when remote server config is provided in the AI App config.
     * If the calls to remote server(s) fail for any reason, tools exposed by those servers will not be cached.  We will proceed 
     * with the original request payload and call Anthropic endpoint(s).
     */
    let remoteServersObject = null;
    if (config.appRemoteServerConfig) {
      try {
        remoteServersObject = await new RemoteServerTools().getRemoteServerToolsForAiApp(
          req.id,
          config.appRemoteServerConfig,
          apps.remoteServerConfig,
          config.appSecurityPolicies,
          apps.securityPolicyConfig);
        if (sessionId && remoteServersObject)
          sendStatus(sessionId, '🛠️ Identifying server tools...');
      }
      catch (error) {
        logger.log({ level: "error", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Message: Error occurred while calling remote servers. Proceeding with original request payload.\n  Error:\n  %s", splat: [scriptName, this.constructor.name, req.id, threadId, config.appId, error.toString()] });
      };
    };

    /**
     * When state management is enabled, is this the first/initial request?
     * Is long term memory enabled for this AI App? &
     * Is user value present in the request payload?
     */
    if (!threadId && userMemConfig && req.body.user)
      await updateSystemMessage( // Ignore errors!
        req,
        config.appId,
        userMemConfig,
        new UserMemDao(appConnections.getConnection(cacheConfig.embeddApp), vecEndpoints));  // This method updates the request payload (req.body)!
    // console.log(`***** Updated request body *****\n${JSON.stringify(req.body,null,2)}\n************`);

    let endpointIdMatched = (manageState && memoryConfig && memoryConfig.useMemory && memoryConfig.affinity) ? false : true; // ID05082025.n

    /**
     * Populate an array to track which endpoints have been tried
     */
    let triedEps = new Array(config.appEndpoints.length).fill(false);

    if (!routerIdTried && routerInstance) // Skip if session affinity is configured and this call is part of an existing session.
      routerEndpointId = routerInstance.getEndpointId(req);

    // 4. Add context by invoking Remote server tools (if configured)
    // This step will only be executed when remote server config is configured with the AI App config.
    // Note: The remote server is expected to return the enriched prompt/context in the same format as the original request payload, 
    // so that it can be directly used to call Anthropic endpoint(s) without any additional transformation.
    // ---------------------------------
    let toolsCount = 0;
    if (remoteServersObject && config.appRemoteServerConfig) {
      try {
        const toolPlannerAiApp = config.appRemoteServerConfig.aiAppName;
        let epMetricsObj = (toolPlannerAiApp) ? appConnections.getConnection(toolPlannerAiApp) : epdata;
        let endpointsObj = (toolPlannerAiApp) ? apps.applications.find(app => app.appId === toolPlannerAiApp)?.endpoints : config.appEndpoints;
        let normsObj = (toolPlannerAiApp) ? config.plannerNormConfigs : config.normConfigs; // Can be null!

        let bridgeObjects = remoteServersObject.filter(server => (server.bridge)).map(({ serverId, bridge }) => ({ serverId, bridge }));
        // console.log(`***** Bridge Objects for Tool Planner/Executor *****\n${JSON.stringify(bridgeObjects,null,2)}\n************`);

        let toolPlannerExecutor =
          new ToolPlannerExecutor(
            instanceName,
            config.appId,
            config.appRemoteServerConfig,
            apps.remoteServerConfig,
            epMetricsObj,
            endpointsObj,
            config.appType,
            bridgeObjects);

        // Get the tools for each MCP server and put them into a single array to be passed to the tool planner/executor.
        let allTools = [];
        for (const remoteServer of remoteServersObject) {
          if (remoteServer.tools)
            allTools = allTools.concat(remoteServer.tools);
        };

        toolsCount = await toolPlannerExecutor.planAndExecuteTools(req, th_id, allTools, normsObj); // This method updates the request payload (req.body) with the enriched context output by remote server tools! 
        // console.log(`***** Updated request body after Remote Server Tools execution *****\n${JSON.stringify(req.body, null, 2)}\n************`);
      }
      catch (error) {
        if (sessionId)
          sendTrace(sessionId, "Error occurred while invoking tools");

        logger.log({ level: "error", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Message: Error occurred while invoking remote tools. Proceeding with original request payload.\n  Error:\n  %s", splat: [scriptName, this.constructor.name, req.id, threadId, config.appId, error.toString()] });
      };
    };

    // 5. Call Azure Anthropic model deployment endpoint(s)
    // ---------------------------------
    let response;
    let retryAfter = 0;
    let continueRetry = true;
    let data;

    if (sessionId)
      sendStatus(sessionId, "✍️ Generating response...");

    do {

      uriIdx = 0;  // Initialize the endpoint index!
      for (const element of config.appEndpoints) { // start of endpoint loop
        if (!endpointIdMatched && (uriIdx !== endpointId)) {
          uriIdx++;

          continue;
        }
        else
          endpointIdMatched = true;

        if ((!routerIdTried) && (routerEndpointId !== null) && (routerEndpointId >= 0)) {
          if (uriIdx !== routerEndpointId) {
            uriIdx++

            continue;
          }
          else
            routerIdTried = true;
        };

        if (triedEps[uriIdx]) { // This endpoint has been called/invoked so skip and go to next!
          uriIdx++;

          continue;
        }
        else
          triedEps[uriIdx] = true;

        uriIdx++;

        if ( apps.securityPolicyConfig ) {
          // 1. Check AI Gateway outbound security policies
          const secEngine = new SecurityEngine(apps.securityPolicyConfig);
          if ( !secEngine.isOutboundAllowed(element.uri) ) // Skip this endpoint URI if it's not in outbound allow list
            continue; 
        };
        if ( config.appSecurityPolicies ) {
          // 2. Check AI App outbound security policies
          const secEngine = new SecurityEngine(config.appSecurityPolicies);
          if ( !secEngine.isOutboundAllowed(element.uri) ) // Skip this endpoint URI if it's not in outbound allow list
            continue;
        };

        respMessage = null; // (Reset response message)
        let metricsObj = epdata.get(retrieveUniqueURI(element.uri, element.id));
        let healthArr = metricsObj.isEndpointHealthy(req.id);
        // console.log(`******isAvailable=${healthArr[0]}; retryAfter=${healthArr[1]}`);
        if (!healthArr[0]) {
          if (retryAfter > 0)
            retryAfter = (healthArr[1] < retryAfter) ? healthArr[1] : retryAfter;
          else
            retryAfter = healthArr[1];

          continue;
        };

        try {
          const meta = await getOpenAICallMetadata(req, element, config.appType);

          if (routerInstance && (routerInstance.routerType === EndpointRouterTypes.LeastConnectionsRouter))
            routerInstance.updateUriConnections(req.id, true, uriIdx - 1);

          // Normalize request payload as per endpoint config.  Normalization code will be executed for each endpoint separately.
          if (config.normConfigs && element.normalizationPolicy?.inputNormalizerId) {
            req.body = req.body_copy; // Reset the request body

            // A deep copy of the request body is created, transforms are applied and then returned
            req.body = processBatch(req.id, config.normConfigs.find(cfg => cfg.normalizerId === element.normalizationPolicy.inputNormalizerId), req.body);
            logger.log({ level: "debug", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Transformed Request\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(req.body, null, 2)] });

            // Send HTTP headers (if any) to the target endpoint
            const normalizer = config.normConfigs.find(cfg => cfg.normalizerId === element.normalizationPolicy.inputNormalizerId);
            normalizer.includeHeaders?.forEach(item => {
              meta.set(item.headerName, item.headerValue);
            });
          };

          stTime = Date.now();
          response = await this._post(element.uri, meta, req.body, {});

          let status = response.status;
          if (status === 200) { // All Ok

            let normConfig = null;
            if (config.normConfigs && element.normalizationPolicy?.outputNormalizerId)
              normConfig = config.normConfigs.find(cfg => cfg.normalizerId === element.normalizationPolicy.outputNormalizerId);

            if (req.body.stream) { // Streaming request?
              const { nonStreamResponse } = await this.#streamToText(req.id, th_id, config.appId, response, { onDelta: (chunk) => process.stdout.write(chunk), expressRes: res });
              data = nonStreamResponse;
            }
            else {
              data = await response.json();
              // console.log(`***** Data: ${JSON.stringify(data, null, 2)} *****`);
            };

            let respTime = Date.now() - stTime;
            metricsObj.updateApiCallsAndTokens(
              req.id,
              data.usage,
              respTime,
              threadStarted
            );

            if (!req.body.stream && normConfig)
              data = processBatch(req.id, normConfig, data);

            if ((!threadId) && cacheDao && embeddedPrompt) { // Cache results ?
              let prompt = req.body.prompt;
              if (!prompt)
                prompt = JSON.stringify(req.body_copy.messages);

              values = [
                req.id,
                instanceName,
                config.appId,
                prompt,
                embeddedPrompt,
                data,
                apps.serverId
              ];

              await cacheDao.storeEntity(
                0,
                values,
                cachedb
              );
            };

            if (th_id && req.body.stream)
              threadId = th_id;

            let persistPrompts = (process.env.API_GATEWAY_PERSIST_PROMPTS === 'true') ? true : false
            if (persistPrompts) { // Persist prompt and completion ?

              const allHeaders = {};
              for (const [name, value] of response.headers.entries()) {
                allHeaders[name] = value;
              };

              promptDao = new PersistDao(persistdb, TblNames.Prompts);
              values = [
                req.id,
                instanceName,
                config.appId,
                req.body,
                data,
                allHeaders,
                req.body.user,
                toolsCount,
                respTime / 1000,
                (element.id) ? element.id : EndpointMiscConstants.IdIndexPrefix + (uriIdx - 1)
              ];

              await promptDao.storeEntity(
                req.id,
                0,
                values
              );
            };

            if (routerInstance)
              if (routerInstance.routerType === EndpointRouterTypes.WeightedDynamicRouter)
                routerInstance.updateWeightsBasedOnLatency(uriIdx - 1, respTime);
              else if ((routerInstance.routerType === EndpointRouterTypes.BudgetAwareRouter) || (routerInstance.routerType === EndpointRouterTypes.AdaptiveBudgetAwareRouter))
                routerInstance.updateActualCost(req.id, uriIdx - 1, data.usage);

            respMessage = {
              http_code: status,
              uri_idx: (uriIdx - 1),
              cached: false,
              toolsCount,
              data
            };

            if (sessionId) {
              sendStatus(sessionId, "🏁 Completed");

              sendTrace(sessionId, `Response served by Endpoint: ${(element.id) ? element.id : EndpointMiscConstants.IdIndexPrefix + (uriIdx - 1)}`);
              sendTrace(sessionId, "Response ready");
            };

            continueRetry = false;
            break; // break out from the endpoint for loop!
          }
          else if (status === 429) { // Endpoint is busy so try next one
            data = await response.json();

            const retryAfterHeader = response.headers.get('retry-after');
            const retryAfterSecs = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0;
            if (!isNaN(retryAfterSecs) && retryAfterSecs > 0)
              retryAfter = retryAfter > 0 ? Math.min(retryAfter, retryAfterSecs) : retryAfterSecs;

            metricsObj.updateFailedCalls(status, retryAfterSecs);

            logger.log({ level: "warn", message: "[%s] %s.processRequest():\n  App Id: %s\n  Request ID: %s\n  Target Endpoint: %s\n  Endpoint ID: %s\n  Status: %s\n  Status Text: %s\n  Message:\n  %s\n  Retry seconds: %d", splat: [scriptName, this.constructor.name, config.appId, req.id, element.uri, element.id, status, response.statusText, JSON.stringify(data, null, 2), retryAfterSecs] });
          }
          else if (status === 400 || status === 422) { // Invalid prompt ~ content filtered;
            data = await response.json();

            let persistPrompts = (process.env.API_GATEWAY_PERSIST_PROMPTS === 'true') ? true : false
            if ((status === 422) && persistPrompts) { // Persist prompts ?; Only update prompts table if it's a content filter issue. Exit while loop, return!

              const allHeaders = {};
              for (const [name, value] of response.headers.entries()) {
                allHeaders[name] = value;
              };

              promptDao = new PersistDao(persistdb, TblNames.Prompts);
              values = [
                req.id,
                instanceName,
                config.appId,
                req.body,
                data,
                allHeaders,
                req.body.user,
                toolsCount,
                (Date.now() - stTime) / 1000,
                (element.id) ? element.id : EndpointMiscConstants.IdIndexPrefix + (uriIdx - 1)
              ];

              await promptDao.storeEntity(
                req.id,
                0,
                values
              );

              continueRetry = false; // Exit while loop and processor
            };

            logger.log({ level: "warn", message: "[%s] %s.processRequest():\n  App Id: %s\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Message:\n  %s", splat: [scriptName, this.constructor.name, config.appId, req.id, element.uri, status, response.statusText, JSON.stringify(data, null, 2)] });

            metricsObj.updateFailedCalls(status, 0);
            respMessage = {
              http_code: status,
              uri_idx: (uriIdx - 1),
              status_text: response.statusText,
              data: (req.inboundApiType === AiGatewayInboundReqApiType.Anthropic) ? data :
                {
                  jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
                  id: req.a2aReqId,
                  error: { code: -32600, message: "AI Service endpoint returned an exception.", data } // Invalid request
                }
            };

            break;
          }
          else { // Authz failed
            data = await response.text();

            logger.log({ level: "warn", message: "[%s] %s.processRequest():\n  App Id: %s\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Message:\n  %s", splat: [scriptName, this.constructor.name, config.appId, req.id, element.uri, status, response.statusText, JSON.stringify(data, null, 2)] });

            metricsObj.updateFailedCalls(status, 0);

            const emsg = `AI Service endpoint returned exception: [${data}].`;
            err_msg = {
              error: {
                target: element.uri,
                message: emsg,
                code: "unauthorized"
              }
            };

            respMessage = {
              http_code: status,
              uri_idx: (uriIdx - 1),
              data: (req.inboundApiType === AiGatewayInboundReqApiType.Anthropic) ? err_msg :
                {
                  jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
                  id: req.a2aReqId,
                  error: { code: A2AErrorCodes.AuthError, message: "AI Service endpoint returned an exception.", data } // Authentication error
                }
            };
          };
        }
        catch (error) {
          const emsg = `AI Services Gateway encountered exception: [${error.message}].`;
          err_msg = {
            error: {
              target: element.uri,
              message: emsg,
              code: "internalFailure"
            }
          };

          logger.log({ level: "error", message: "[%s] %s.processRequest():\n  ID: %s\n  Priority: %d\n  Encountered exception:\n  %s", splat: [scriptName, this.constructor.name, element.id, (uriIdx - 1), JSON.stringify(err_msg, null, 2)] });

          respMessage = {
            http_code: 500,
            uri_idx: (uriIdx - 1),
            data: (req.inboundApiType === AiGatewayInboundReqApiType.Anthropic) ? err_msg :
              {
                jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
                id: req.a2aReqId,
                error: { code: -32603, message: emsg } // Internal JSON-RPC error
              }
          };
        }
        finally {
          if (routerInstance && (routerInstance.routerType === EndpointRouterTypes.LeastConnectionsRouter))
            routerInstance.updateUriConnections(req.id, false, uriIdx - 1);
        };
      }; // end of endpoint for loop

    }
    while (continueRetry && triedEps.some(val => val === false));

    if (retryAfter > 0) {
      if (respMessage == null) { 
        const emsg = `All backend endpoints are too busy! Retry after [${retryAfter}] seconds ...`;

        err_msg = {
          error: {
            target: req.originalUrl,
            message: emsg,
            code: "tooManyRequests"
          }
        };

        respMessage = {
          http_code: 429, // Server is busy, retry later!
          uri_idx: (uriIdx - 1),
          data: (req.inboundApiType === AiGatewayInboundReqApiType.Anthropic) ? err_msg :
            {
              jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
              id: req.a2aReqId,
              error: { code: -32002, message: emsg } // Too many requests, server is busy
            },
          retry_after: retryAfter
        };
      };
    }
    else {
      if (respMessage == null) {
        const emsg = "All backend endpoints failed with an exception. Unable to process request. Please check AI Gateway and Application/Model security policies."; 

        err_msg = {
          error: {
            target: req.originalUrl,
            message: emsg,
            code: "forbidden"
          }
        };

        respMessage = {
          http_code: 403, // Authorization (Gateway policy) error
          data: (req.inboundApiType === AiGatewayInboundReqApiType.Anthropic) ? err_msg :
            {
              jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
              id: req.a2aReqId,
              error: { code: -32001, message: emsg }
            }
        };

        logger.log({ level: "error", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Thread ID: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, threadId, JSON.stringify(respMessage, null, 2)] }); // ID05082025.n
      };
    };

    if ((respMessage.http_code === 200) &&
      req.body.messages && // state management is only supported for messages API
      manageState &&
      memoryConfig &&
      memoryConfig.useMemory) { // Manage state for this AI application?

      let completionMsg = {
        role: data.role,
        content: data.content?.filter(msg => msg.type === "text").map(msg => msg.text).join(' ')
      };

      req.body.messages.push(completionMsg);

      memoryDao = new PersistDao(persistdb, TblNames.Memory);
      if (!threadId)
        threadId = th_id;

      logger.log({ level: "debug", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Thread ID: %s\n  Completed Message:\n  %s", splat: [scriptName, this.constructor.name, req.id, threadId, JSON.stringify(req.body.messages, null, 2)] });

      values = [
        req.id,
        instanceName,
        threadId,
        config.appId,
        {
          content: req.body.messages
        },
        req.body.user,
        (uriIdx - 1)
      ];

      if (req.get(CustomRequestHeaders.ThreadId)) // Update
        await memoryDao.storeEntity(req.id, 1, values);
      else // Insert
        await memoryDao.storeEntity(req.id, 0, values);

      respMessage.threadId = threadId;

      // Update the threadid in the prompts table for each request
      if (process.env.API_GATEWAY_PERSIST_PROMPTS === 'true') {
        promptDao = new PersistDao(persistdb, TblNames.Prompts);
        values = [
          req.id,
          instanceName,
          config.appId,
          threadId
        ];

        await promptDao.storeEntity(
          req.id,
          1,
          values
        );
      };

    };

    /**
     * Was response generated OK? &
     * Is long term memory enabled for this AI App? &
     * Is user value present in the request payload?
     */
    if ((respMessage.http_code === 200) &&
      userMemConfig &&
      req.body.user) {
      // 1) Construct the input message
      const extractionPrompt =
        getExtractionPrompt(
          req.body.user,
          userMessage,
          data.choices[0].message.content,
          userMemConfig);

      let epMetricsObject = null;
      let aiAppEndpoints = null;
      if (userMemConfig.aiAppName) {
        for (const application of apps.applications) {
          if (application.appId == userMemConfig.aiAppName) {
            aiAppEndpoints = application.endpoints;
            epMetricsObject = appConnections.getConnection(application.appId);

            break;
          };
        };
      };
      if (!aiAppEndpoints || !epMetricsObject) { // Fallback to using current model's metrics obj. and backend endpoints?
        aiAppEndpoints = config.appEndpoints;
        epMetricsObject = epdata;
      };

      // 2) Extract user / group facts from input query and assistant reply
      const extraction = await callAiAppEndpoint(req, epMetricsObject, aiAppEndpoints, extractionPrompt, config.appType); // ID08272025.n
      if (extraction) {
        const factMsg = extraction.choices[0].message.content;
        logger.log({ level: "debug", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Thread ID: %s\n  Facts:\n%s", splat: [scriptName, this.constructor.name, req.id, threadId, factMsg] });
        if (!factMsg.startsWith("No extractable facts")) {
          const facts = extraction.choices[0].message.content.split('\n').filter(Boolean);

          if (facts.length > 0) {
            // 3.1) Check to see if embedd model AI App endpoints are populated
            if (!vecEndpoints) {
              for (const application of apps.applications) {
                if (application.appId == cacheConfig.embeddApp) {
                  vecEndpoints = application.endpoints;

                  break;
                };
              };
            };

            // 3.2) Vectorize & store facts in user facts table
            const userMemDao = new UserMemDao(appConnections.getConnection(cacheConfig.embeddApp), vecEndpoints);
            await storeUserFacts(req, config.appId, facts, userMemDao);  // This method stores each fact in user facts table.
          };
        };
      };
    };

    if (sessionId)
      if (respMessage.http_code === 200)
        sendDone(sessionId, { threadId: threadId || null });
      else {
        sendError(sessionId, respMessage.data?.error?.message || 'Execution failed');
        sendDone(sessionId, { error: true });
      };

    return (respMessage);
  } // end of processRequest()
}

module.exports = AzAnthropicProcessor;