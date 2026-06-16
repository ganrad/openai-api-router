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
  DefEmbeddingModelTokenLimit,
  CustomRequestHeaders,
  EndpointRouterTypes,
  OpenAIChatCompletionMsgRoleTypes,
  EndpointMiscConstants,
  AiGatewayInboundReqApiType,
  A2AProtocolAttributes,
  A2AErrorCodes
} = require("../utilities/app-gtwy-constants.js");

const { encode } = require('gpt-tokenizer'); // ID02212025.n
const { getExtractionPrompt, updateSystemMessage, storeUserFacts } = require("../utilities/lt-mem-manager.js");
const { getOpenAICallMetadata, callAiAppEndpoint, retrieveUniqueURI } = require("../utilities/helper-funcs.js");
const { streamA2AResponse } = require("../utilities/a2a-helper-funcs.js");
const { processBatch, processStream } = require("../utilities/payload-normalizer-v2.js");
const { RemoteServerTools } = require("../utilities/remote-server-tools.js");
const { ToolPlannerExecutor } = require("../utilities/tool-planner-executor.js");
const { sendStatus, sendTrace, sendError, sendDone } = require("../utilities/sse-event-broker.js");

class AzAnthropicProcessor {

  constructor() {
    this.streamed_response_sent = false;  // ID08202025.n
    this.request = null;  // ID10082025.n; Initialize with null
  }

  #tokensWithinLimit(req) { // ID02212025.n
    const msgs = req.body.messages;

    const nameTokens = 1;
    const msgTokens = 3;

    let tokens = 5;
    let elemTokens = 0;
    for (const element of msgs) {
      tokens += msgTokens;
      elemTokens = encode(element.content).length;
      // console.log(`*** role: ${element.role}, content: ${element.content}, tokens: ${elemTokens} ***`);

      // Encode the text to get the tokens
      tokens += elemTokens;
      if (element.name)
        tokens += nameTokens;
    };

    const retVal = (tokens > DefEmbeddingModelTokenLimit) ? false : true;
    logger.log({ level: "info", message: "[%s] %s.#tokensWithinLimit():\n  Request ID: %s\n  Token Count: %s", splat: [scriptName, this.constructor.name, req.id, tokens] });

    return (retVal);
  }

  #checkAndPruneCtxMsgs(count, msgs) {
    let aCount = count * 2;

    let mLength = msgs.length;

    if (mLength > aCount)
      msgs.splice(2, 2); // 1) Keep the original 2 messages => role = user and assistant & 2) Delete the next 2 messages (role=user + assistant)

    return (msgs)
  }

  // ID06052024.sn
  * #chunkToLines(chunked_data) {
    let previous = "";

    for (const chunk of chunked_data) {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      previous += bufferChunk;

      let eolIndex;
      while ((eolIndex = previous.indexOf("\n")) >= 0) {
        // line includes the EOL
        const line = previous.slice(0, eolIndex + 1).trimEnd();
        if (line === "data: [DONE]") break;
        // if (line.startsWith("data: ")) yield line;
        if (line) yield line;
        previous = previous.slice(eolIndex + 1);
      }
    };
    if (previous.startsWith("data: ")) yield previous;
  }

  * #linesToMessages(linesAsync) {
    let message;
    for (const line of linesAsync) {
      if (line.startsWith("data: "))
        message = line.substring("data: ".length);
      else
        message = line;

      yield message;
    }
  }

  * #processChunk(data, pline) {
    yield* this.#linesToMessages(this.#chunkToLines(data));
  }

  #constructCompletionMessage(completion, citations, metadata) {
    let completionObj = null;

    if (citations) {
      const citsObj = JSON.parse(citations);
      completionObj = {
        id: metadata.id,
        object: metadata.object,
        created: metadata.created,
        model: metadata.model,
        choices: [
          {
            message: {
              role: OpenAIChatCompletionMsgRoleTypes.Assistant,
              content: completion,
              context: {
                citations: citsObj.choices[0].delta.context.citations,
                intent: citsObj.choices[0].delta.context.intent,
                all_retrieved_documents: citsObj.choices[0].delta.context.all_retrieved_documents
              }
            },
            finish_reason: "stop",
            index: 0
          }
        ],
        system_fingerprint: metadata.system_fingerprint
      };
    }
    else {
      completionObj = {
        id: metadata.id,
        object: metadata.object,
        created: metadata.created,
        model: metadata.model,
        choices: [
          {
            message: {
              role: OpenAIChatCompletionMsgRoleTypes.Assistant,
              content: completion,
            },
            finish_reason: "stop",
            index: 0
          }
        ],
        system_fingerprint: metadata.system_fingerprint
      };
      if (metadata.usage) // ID02152025.n
        completionObj.usage = metadata.usage;
    };

    return (completionObj);
  }

  #constructCompletionStreamMessage(completion) {
    let completionObj = {
      choices: [
        {
          index: 0,
          delta: {
            content: completion.choices[0].message.content
          },
          finish_reason: null
        }
      ],
      created: completion.created,
      id: completion.id,
      model: completion.model,
      object: completion.object,
      system_fingerprint: completion.system_fingerprint
    };

    let citationsObj = null;
    if (completion.choices[0].message?.context) {
      citationsObj = {
        id: completion.id,
        created: completion.created,
        model: completion.model,
        object: completion.object,
        choices: [
          {
            index: 0,
            delta: {
              role: OpenAIChatCompletionMsgRoleTypes.Assistant,
              context: {
                citations: completion.choices[0].message.context.citations,
                intent: completion.choices[0].message.context.intent
              }
            },
            end_turn: false,
            finish_reason: null
          }
        ]
      };
    };

    let retValue = {
      completion: completionObj,
      citations: citationsObj
    };

    return retValue;
  }

  #checkIfMessageIsComplete(message) {
    let braces = 0;
    for (var i = 0, len = message.length; i < len; ++i) {
      switch (message[i]) {
        case '{':
          ++braces;
          break;
        case '}':
          --braces;
          break;
      }
    }
    return (braces === 0) ? true : false;
  }

  #sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
  }

  async #streamChatCompletion(req_id, t_id, app_id, router_res, oai_res, nconfig, t_count) { // ID11032025.n, ID04222026.n
    const reader = oai_res.body.getReader(); // use Nodejs native fetch!
    // const reader = oai_res.body; // use node-fetch library!

    if (!this.streamed_response_sent) { // ID08202025.n
      // Send 200 response status and headers
      let res_hdrs = CustomRequestHeaders.RequestId;
      router_res.setHeader('Content-Type', 'text/event-stream');
      router_res.setHeader('Cache-Control', 'no-cache');
      router_res.setHeader('Connection', 'keep-alive');
      router_res.set(CustomRequestHeaders.RequestId, req_id);
      if (t_id) {
        res_hdrs += ', ' + CustomRequestHeaders.ThreadId;
        router_res.set(CustomRequestHeaders.ThreadId, t_id);
      };
      if (t_count) { // ID04222026.n
        res_hdrs += ', ' + CustomRequestHeaders.ExecToolsCount;
        router_res.set(CustomRequestHeaders.ExecToolsCount, t_count);
      };
      router_res.set("Access-Control-Expose-Headers", res_hdrs);
      router_res.set("X-Accel-Buffering", "no"); // ID10082025.n; Tell Nginx servers (if present as reverse proxy) to not buffer SSE events 
      router_res.flushHeaders();

      this.streamed_response_sent = true; // ID08202025.n
    };

    let chkPart = null;
    let recv_data = '';
    let call_data = null;

    // ID10082025.sn
    let streamOAIResponse = true;
    if (this.request.inboundApiType === AiGatewayInboundReqApiType.Agent2Agent) {
      streamOAIResponse = false;

      const a2aRequest = {
        requestId: req_id,
        threadId: t_id,
        appId: app_id,
        inputMessage: this.request.a2aMessage,
        responseStream: router_res,
        oaiReader: reader,
        a2aReqId: this.request.a2aReqId
      };

      const a2aResponse = await streamA2AResponse(a2aRequest, false);
      recv_data = a2aResponse.recv_data;
      call_data = a2aResponse.call_data;
    };
    // ID10082025.en

    const decoder = new TextDecoder("utf-8");
    while (streamOAIResponse) { // ID10082025.n
      const { done, value } = await reader.read();
      if (done)
        // 1. Debugging start - Finished
        // console.log("**** FINISHED ****");
        break;

      // if (!this.request.normalizeOutput) // ID10142025.n; ID11032025.o
      if (!nconfig) // ID11032025.n
        router_res.write(value); // write the value out to router response/output stream

      const chunk = decoder.decode(value);
      const arr = chunk.split('\n'); // ID09242024.sn

      for (const data of arr) {
        if (data.length === 0) continue; // ignore empty message

        if (data === 'data: [DONE]') {
          if (nconfig)
            router_res.write('data: [DONE]\n\n');
          break;
        };

        // 2. Line data
        // console.log(`**** DATA ****: ${data}`);
        let pdata = '';
        if (data.includes("data: "))
          pdata = data.substring("data: ".length);
        else
          pdata = data;

        if (chkPart) {
          let cdata = chkPart.concat(pdata);
          if (cdata.includes("data: "))
            pdata = cdata.substring("data: ".length);
          else
            pdata = cdata;
          // 3. Stitched line data fragments
          // console.log(`**** C-DATA ****: ${cdata}`);
        };

        try {
          let jsonMsg = JSON.parse(pdata);
          // 4.a Parsed data
          // console.log(`**** P-DATA ****: ${pdata}`);
          chkPart = null;

          /** ID11032025.so
          if (this.request.normalizeOutput) { // ID10142025.n
            // Remove 'prompt_filter_results' and 'content_filter_results'
            delete jsonMsg.prompt_filter_results;
            if (jsonMsg.choices) {
              for (const choice of jsonMsg.choices)
                delete choice.content_filter_results;
            };

            // Re-serialize and write cleaned data
            const cleanedData = `data: ${JSON.stringify(jsonMsg)}\n\n`;

            router_res.write(cleanedData);
          };
          ID11032025.eo */
          // ID11032025.sn
          if (nconfig) {
            // console.log(`*** Json before process:\n${JSON.stringify(jsonMsg,null,2)}`);
            jsonMsg = processStream(nconfig, jsonMsg);
            // console.log(`*** Json after process:\n${JSON.stringify(jsonMsg,null,2)}`);
            router_res.write(`data: ${JSON.stringify(jsonMsg)}\n\n`);
          };
          // ID11032025.en

          // Accumulate content and metadata
          if (!jsonMsg.choices || jsonMsg.choices.length === 0) {
            console.log("streamCompletion(): Skipping this line");

            // ID02152025.sn
            if (jsonMsg.usage && call_data)
              call_data.usage = jsonMsg.usage;
            // ID02152025.en
          }
          else {
            let content = jsonMsg.choices[0].delta.content;
            if (content)
              recv_data = recv_data.concat(content);

            if (!call_data && (jsonMsg.created > 0))
              call_data = {
                id: jsonMsg.id,
                object: jsonMsg.object,
                created: jsonMsg.created,
                model: jsonMsg.model,
                system_fingerprint: jsonMsg.system_fingerprint
              };
          };
        }
        catch (error) {
          // Incomplete JSON, save for next chunk
          chkPart = pdata;

          // 4.b Partial data
          // console.log(`**** ChkPart ****: ${chkPart}`);
        };
      }; // ID09242024.en; End of for loop
    }; // end of while
    // 5. Check if chunk part was not processed!
    // console.log(`ChkPart: ${chkPart}`);

    logger.log({ level: "debug", message: "[%s] %s.streamChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Completion: %s", splat: [scriptName, this.constructor.name, req_id, t_id, app_id, recv_data] });

    let resp_data = this.#constructCompletionMessage(recv_data, null, call_data);

    // 6. Final streamed response to be saved in cache/memory
    // console.log(`**** CACHE/MEMORY DATA ****\n ${JSON.stringify(resp_data,null,2)}`);
    return resp_data;
  }

  async #streamCachedChatCompletion(
    req_id,
    t_id,
    app_id,
    router_res,
    res_payload) {
    // Send 200 response status and headers
    let res_hdrs = CustomRequestHeaders.RequestId;
    router_res.setHeader('Content-Type', 'text/event-stream');
    router_res.setHeader('Cache-Control', 'no-cache');
    router_res.setHeader('Connection', 'keep-alive');
    router_res.set(CustomRequestHeaders.RequestId, req_id);
    if (t_id) {
      res_hdrs += ', ' + CustomRequestHeaders.ThreadId;
      router_res.set(CustomRequestHeaders.ThreadId, t_id);
    };
    router_res.set("Access-Control-Expose-Headers", res_hdrs);
    router_res.set("X-Accel-Buffering", "no"); // ID10082025.n; Tell Nginx servers (if present as reverse proxy) to not buffer SSE events
    router_res.flushHeaders();

    // ID10082025.sn
    if (this.request.inboundApiType === AiGatewayInboundReqApiType.Agent2Agent) {
      const a2aRequest = {
        requestId: req_id,
        threadId: t_id,
        appId: app_id,
        inputMessage: this.request.a2aMessage,
        responseStream: router_res,
        responsePayload: res_payload.choices[0].message.content,
        a2aReqId: this.request.a2aReqId
      };

      await streamA2AResponse(a2aRequest, true);

      return {
        http_code: 200, // All ok. Serving completion from cache.
        cached: true
      };
    };
    // ID10082025.n

    let msgChunk = this.#constructCompletionStreamMessage(res_payload)
    // console.log(`***** CACHED MESSAGE:\n${JSON.stringify(msgChunk)}`);
    if (msgChunk.citations) {
      const cit_data = "data: " + JSON.stringify(msgChunk.citations) + "\n\n";
      router_res.write(cit_data, 'utf8', () => {
        logger.log({ level: "debug", message: "[%s] %s.streamCachedChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Citations:\n  %s", splat: [scriptName, this.constructor.name, req_id, t_id, app_id, cit_data] });
      });
    };

    /** ID11032025.so; When a cached response is streamed back to client, 'prompt_filter_results' will not be sent!
    if (!this.request.normalizeOutput) { // ID10142025.sn
      const value0 = "data: " + JSON.stringify({
        choices: [],
        created: 0,
        id: "",
        model: "",
        object: "",
        prompt_filter_results: [  // Safe to return 'safe sev' for all harm categories as this is a cached response!
          {
            prompt_index: 0,
            content_filter_results: {
              hate: {
                filtered: false,
                severity: "safe",
              },
              self_harm: {
                filtered: false,
                severity: "safe",
              },
              sexual: {
                filtered: false,
                severity: "safe",
              },
              violence: {
                filtered: false,
                severity: "safe",
              }
            }
          }
        ]
      }) + "\n\n";
      router_res.write(value0, 'utf8', () => {
        logger.log({ level: "debug", message: "[%s] %s.streamCachedChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Prompt-Filter:\n  %s", splat: [scriptName, this.constructor.name, req_id, t_id, app_id, value0] });
      });
    }; // ID10142025.en
    ID11032025.eo */

    const value1 = "data: " + JSON.stringify(msgChunk.completion) + "\n\n";
    router_res.write(value1, 'utf8', () => {
      logger.log({ level: "debug", message: "[%s] %s.streamCachedChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Completion:\n  %s", splat: [scriptName, this.constructor.name, req_id, t_id, app_id, value1] });
    });

    const value2 = "data: " + JSON.stringify({
      choices: [
        {
          // ID11032025.o; When a cached response is streamed back to client, empty 'content_filter_results' will not be sent!
          // ...(!this.request.normalizeOutput && {content_filter_results: {}}), // ID10142025.n, ID11032025.o
          delta: {},
          finish_reason: "stop",
          index: 0
        }
      ],
      created: msgChunk.completion.created,
      id: msgChunk.completion.id,
      model: msgChunk.completion.model,
      object: msgChunk.completion.object
    }) + "\n\n";
    router_res.write(value2, 'utf8', () => {
      logger.log({ level: "debug", message: "[%s] %s.streamCachedChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Stop:\n  %s", splat: [scriptName, this.constructor.name, req_id, t_id, app_id, value2] });
    });

    const value3 = 'data: [\"Done\"]\n\n';
    router_res.write(value3, 'utf8', () => {
      logger.log({ level: "debug", message: "[%s] %s.streamCachedChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Done:\n  %s", splat: [scriptName, this.constructor.name, req_id, t_id, app_id, value3] });
    });

    return {
      http_code: 200, // All ok. Serving completion from cache.
      cached: true
    };
  }
  // ID06052024.en

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
    req.body_copy = req.body; // ID11032025.n; Save a copy of the request body

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

    if ( sessionId ) {
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

    if ( req.body.tools ) { // Tool calling is not supported!
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

    let epdata = appConnections.getConnection(config.appId); // ID04302025.n

    if (!threadId) {
      if ( cacheConfig.cacheResults && useCache ) { // Is caching enabled?; ID03142025.o
        for (const application of apps.applications) {
          if (application.appId === cacheConfig.embeddApp) {
            vecEndpoints = application.endpoints;

            break;
          };
        };

        if ( sessionId ) // ID05202026.n
          sendStatus(sessionId, '🔍 Searching semantic cache(s)...');

        stTime = Date.now(); // ID09162025.n
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
          config.level2Config);

        const { rowCount, cacheLevel, completion, embeddings } = // ID05202026.n; ID11212025.n
          await cacheDao.queryVectorDB(
            req, // ID03052025.n
            config.appId,
            cachedb
          );

        if (rowCount === 1) { // Cache hit!

          if ( sessionId) // ID05202026.n
            sendTrace(sessionId, `Semantic cache hit. Response served from Semantic Cache Tier: <b>${cacheLevel}</b>`);

          if (req.body.messages && manageState && memoryConfig && memoryConfig.useMemory) { // Generate thread id if manage state == true
            threadId = generateGUID("thread"); // ID07312025.n

            // When response is served from the cache and state mgmt is turned on, update the thread count of the first end-point
            for (const element of config.appEndpoints) { // ID04302025.n
              let metricsObj = epdata.get(retrieveUniqueURI(element.uri, element.id)); // ID11182025.n
              metricsObj.updateUserThreads();

              break;
            };
          };

          respMessage = (req.body.stream) ? await
            this.#streamCachedChatCompletion(req.id, threadId, config.appId, res, completion) :
            {
              http_code: 200, // All ok. Serving completion from cache.
              cached: true,
              data: completion
            };

          // ID09162025.sn - Insert cached response in prompts table. This record is also used to collect user feedback.
          let persistPrompts = (process.env.API_GATEWAY_PERSIST_PROMPTS === 'true') ? true : false
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
              0, // ID04302026.n (No remote tools were executed!)
              (Date.now() - stTime) / 1000,
              EndpointMiscConstants.IdCached // Use '-cached-' as endpoint ID since this is a cached response
            ];
            if (threadId) {
              values.splice(5, 1);
              values.unshift(threadId);
            };

            (threadId) ? await promptDao.storeEntity(req.id, 2, values) : await promptDao.storeEntity(req.id, 0, values);
          };
          // ID09162025.en

          if (req.body.messages && manageState && memoryConfig && memoryConfig.useMemory) { // Manage state for this AI application?
            respMessage.threadId = threadId;

            // ID05312024.sn
            let saveMsg = {
              role: completion.role,
              content: completion.content
            };
            // ID05312024.en

            req.body.messages.push(saveMsg); // ID05312024.n
            logger.log({ level: "debug", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Thread ID: %s\n  Prompt + Cached Message:\n  %s", splat: [scriptName, this.constructor.name, req.id, threadId, JSON.stringify(req.body.messages, null, 2)] });

            memoryDao = new PersistDao(persistdb, TblNames.Memory);
            values = [
              req.id,
              instanceName, // ID11112024.n
              threadId,
              config.appId,
              {
                content: req.body.messages
              },
              req.body.user, // ID04112024.n
              0 // ID05082025.n
            ];

            await memoryDao.storeEntity(req.id, 0, values);
          };

          if ( sessionId ) { // ID05202026.n
            sendStatus(sessionId, "🏁 Completed");
            sendTrace(sessionId, "Response ready");
          };

          return (respMessage);
        }
        else { // Semantic cache miss
          embeddedPrompt = embeddings;
          if ( sessionId ) // ID05202026.n
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
        endpointId = userContext.data[0].endpoint_id; // ID05082025.n

        logger.log({ level: "debug", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Thread ID: %s\n  Endpoint ID: %s\n  Prompt + Retrieved Message:\n  %s", splat: [scriptName, this.constructor.name, req.id, threadId, endpointId, JSON.stringify(req.body.messages, null, 2)] });
      }
      else {
        const emsg = `The user session associated with Thread ID=[${threadId}] has either expired or is invalid! Start a new user session.`; // ID10082025.n
        err_msg = {
          error: {
            target: req.originalUrl,
            message: emsg,
            code: "invalidPayload"
          }
        };

        respMessage = {
          http_code: 400, // Bad request
          data: (req.inboundApiType === AiGatewayInboundReqApiType.Anthropic) ? err_msg : // ID10082025.n
            {
              jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
              id: req.a2aReqId,
              error: { code: -32602, message: emsg } // Invalid method parameters
            }
        };

        return (respMessage);
      };

      if (memoryConfig.affinity) // ID06162025.n
        routerIdTried = true;
    }; // end of user session if

    let th_id = !threadId && (manageState && memoryConfig && memoryConfig.useMemory) ? (function () { threadStarted = true; return (generateGUID("thread")); })() : threadId; // ID04222026.n

    /**
     * ID02232026.sn
     * When remote server config is present for an AI App, make a call to remote servers and fetch the tools.
     * This is an optional step and will only be executed when remote server config is provided in the AI App config.
     * If the calls to remote server(s) fail for any reason, tools exposed by those servers will not be cached.  We will proceed 
     * with the original request payload and call OAI endpoint(s).
     */
    let remoteServersObject = null;
    if (config.appRemoteServerConfig) {
      try {
        remoteServersObject = await new RemoteServerTools().getRemoteServerToolsForAiApp(req.id, config.appRemoteServerConfig, apps.remoteServerConfig);
        if ( sessionId && remoteServersObject ) // ID05202026.n
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

    if (!routerIdTried && routerInstance) // ID06162025.n; Skip if session affinity is configured and this call is part of an existing session.
      routerEndpointId = routerInstance.getEndpointId(req);  // ID08052025.n

    // 4. Add context by invoking Remote server tools (if configured)
    // This step will only be executed when remote server config is configured with the AI App config.
    // Note: The remote server is expected to return the enriched prompt/context in the same format as the original request payload, 
    // so that it can be directly used to call OAI endpoint(s) without any additional transformation.
    // ---------------------------------
    let toolsCount = 0;
    if (remoteServersObject && config.appRemoteServerConfig) {
      try {
        const toolPlannerAiApp = config.appRemoteServerConfig.aiAppName;
        let epMetricsObj = (toolPlannerAiApp) ? appConnections.getConnection(toolPlannerAiApp) : epdata;
        let endpointsObj = (toolPlannerAiApp) ? apps.applications.find(app => app.appId === toolPlannerAiApp)?.endpoints : config.appEndpoints;

        let bridgeObjects = remoteServersObject.filter(server => (server.bridge)).map(({ serverId, bridge }) => ({ serverId, bridge }));
        // console.log(`***** Bridge Objects for Tool Planner/Executor *****\n${JSON.stringify(bridgeObjects,null,2)}\n************`);

        // let toolPlannerExecutor = new McpToolPlannerExecutor(config.appRemoteServerConfig, apps.remoteServerConfig, epMetricsObj, endpointsObj, config.appType);
        let toolPlannerExecutor = // ID04222026.n
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

        toolsCount = await toolPlannerExecutor.planAndExecuteTools(req, th_id, allTools); // This method updates the request payload (req.body) with the enriched context output by remote server tools! 
        console.log(`***** Updated request body after Remote Server Tools execution *****\n${JSON.stringify(req.body, null, 2)}\n************`);
      }
      catch (error) {
        if ( sessionId ) // ID05202026.n
          sendTrace(sessionId, "Error occurred while invoking tools");

        logger.log({ level: "error", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Message: Error occurred while invoking remote tools. Proceeding with original request payload.\n  Error:\n  %s", splat: [scriptName, this.constructor.name, req.id, threadId, config.appId, error.toString()] });
      };
    };

    // 5. Call Azure Anthropic model deployment endpoint(s)
    // ---------------------------------
    let response;
    let retryAfter = 0;
    let continueRetry = true; // ID0522026.n
    let data;

    if ( sessionId ) // ID05202026.n
      sendStatus(sessionId, "✍️ Generating response...");

    do { // ID06162025.n

      uriIdx = 0;  // Initialize the endpoint index!
      for (const element of config.appEndpoints) { // start of endpoint loop
        if (!endpointIdMatched && (uriIdx !== endpointId)) { // ID05082025.n
          uriIdx++;

          continue;
        }
        else
          endpointIdMatched = true;

        if ((!routerIdTried) && (routerEndpointId !== null) && (routerEndpointId >= 0)) { // ID06162025.n
          if (uriIdx !== routerEndpointId) {
            uriIdx++

            continue;
          }
          else
            routerIdTried = true;
        };

        if (triedEps[uriIdx]) { // ID06162025.n; This endpoint has been called/invoked so skip and go to next!
          uriIdx++;

          continue;
        }
        else
          triedEps[uriIdx] = true;

        uriIdx++;

        respMessage = null; // ID05222026.n (Reset response message)
        let metricsObj = epdata.get(retrieveUniqueURI(element.uri, element.id)); // ID11182025.n
        let healthArr = metricsObj.isEndpointHealthy(req.id); // ID05082025.n
        // console.log(`******isAvailable=${healthArr[0]}; retryAfter=${healthArr[1]}`);
        if (!healthArr[0]) {
          if (retryAfter > 0)
            retryAfter = (healthArr[1] < retryAfter) ? healthArr[1] : retryAfter;
          else
            retryAfter = healthArr[1];

          continue;
        };

        try {
          const meta = await getOpenAICallMetadata(req, element, config.appType); // ID08272025.n

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
              meta.set(item.headerName,item.headerValue);
            });
          };

          /*
          stTime = Date.now();
          response = await fetch(element.uri, {
            method: req.method,
            headers: meta,
            body: JSON.stringify(req.body)
          });
          */

          let status = response.status;
          if (status === 200) { // All Ok

            let normConfig = null;
            if (config.normConfigs && element.normalizationPolicy?.outputNormalizerId)
              normConfig = config.normConfigs.find(cfg => cfg.normalizerId === element.normalizationPolicy.outputNormalizerId);

            if (req.body.stream) // Streaming request?
              await this.#streamChatCompletion(req.id, th_id, config.appId, res, response, normConfig, toolsCount); // Messages API call
            else
              data = await response.json();
              // console.log(`***** Data: ${JSON.stringify(data, null, 2)} *****`);

            let respTime = Date.now() - stTime;
            metricsObj.updateApiCallsAndTokens(
              req.id, // ID08252025.n
              data.usage, // ID08252025.n
              respTime,
              threadStarted // ID04302025.n
            );

            if (!req.body.stream && normConfig) // ID11032025.n
              data = processBatch(req.id, normConfig, data);

            if ((!threadId) && cacheDao && embeddedPrompt) { // Cache results ?
              let prompt = req.body.prompt;
              if (!prompt)
                prompt = JSON.stringify(req.body_copy.messages); // ID02282026.n

              values = [
                req.id,
                instanceName, // ID11112024.n
                config.appId,
                prompt,
                embeddedPrompt, // ID11212025.n
                data, // ID10142025.o; ID11032025.n
                apps.serverId // ID11212025.n
              ];

              await cacheDao.storeEntity(
                0,
                values,
                cachedb
              );
            };

            if (th_id && req.body.stream) // ID06052024.n
              threadId = th_id;

            let persistPrompts = (process.env.API_GATEWAY_PERSIST_PROMPTS === 'true') ? true : false
            if (persistPrompts) { // Persist prompt and completion ?
              // ----- ID02112025.sn
              const allHeaders = {};
              for (const [name, value] of response.headers.entries()) {
                allHeaders[name] = value;
              };
              // ------ ID02112025.en
              promptDao = new PersistDao(persistdb, TblNames.Prompts);
              values = [
                req.id,
                instanceName, // ID11112024.n
                config.appId,
                req.body,
                data, // ID04112024.n
                allHeaders, // ID02112025.n
                req.body.user, // ID04112024.n
                toolsCount, // ID04302026.n
                respTime / 1000, // ID11082024.n
                (element.id) ? element.id : EndpointMiscConstants.IdIndexPrefix + (uriIdx - 1) // ID05082025.n, ID09162025.n
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
              else if ((routerInstance.routerType === EndpointRouterTypes.BudgetAwareRouter) || (routerInstance.routerType === EndpointRouterTypes.AdaptiveBudgetAwareRouter)) // ID08292025.n, ID09022025.n
                routerInstance.updateActualCost(req.id, uriIdx - 1, data.usage);

            respMessage = {
              http_code: status,
              uri_idx: (uriIdx - 1),
              cached: false,
              toolsCount, // ID04222026.n
              data // ID10142025.o; ID11032025.n
            };

            if ( sessionId ) { // ID05202026.n
              sendStatus(sessionId, "🏁 Completed");

              sendTrace(sessionId, `Response served by Endpoint: ${(element.id) ? element.id : EndpointMiscConstants.IdIndexPrefix + (uriIdx - 1)}`);
              sendTrace(sessionId, "Response ready");
            };

            continueRetry = false; // ID05222026.n
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
          else if (status === 400 || status === 422) { // Invalid prompt ~ content filtered; ID11062024.n
            data = await response.json();

            // ID03012024.sn
            let persistPrompts = (process.env.API_GATEWAY_PERSIST_PROMPTS === 'true') ? true : false
            if ((status === 422) && persistPrompts) { // Persist prompts ?; Only update prompts table if it's a content filter issue. Exit while loop, return!
              // ----- ID02112025.sn
              const allHeaders = {};
              for (const [name, value] of response.headers.entries()) {
                allHeaders[name] = value;
              };
              // ------ ID02112025.en

              promptDao = new PersistDao(persistdb, TblNames.Prompts);
              values = [
                req.id,
                instanceName, // ID11112024.n
                config.appId,
                req.body,
                data, // ID04112024.n
                allHeaders, // ID02112025.n
                req.body.user, // ID04112024.n
                toolsCount, // ID04302026.n
                (Date.now() - stTime) / 1000, // ID11082024.n
                (element.id) ? element.id : EndpointMiscConstants.IdIndexPrefix + (uriIdx - 1) // ID05082025.n, ID09162025.n
              ];

              await promptDao.storeEntity(
                req.id,
                0,
                values
              );

              continueRetry = false; // ID06062026.n - Exit while loop and processor
            };
            // ID03012024.en

            logger.log({ level: "warn", message: "[%s] %s.processRequest():\n  App Id: %s\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Message:\n  %s", splat: [scriptName, this.constructor.name, config.appId, req.id, element.uri, status, response.statusText, JSON.stringify(data, null, 2)] });

            metricsObj.updateFailedCalls(status, 0);
            respMessage = {
              http_code: status,
              uri_idx: (uriIdx - 1), // ID03262025.n
              status_text: response.statusText,
              data: (req.inboundApiType === AiGatewayInboundReqApiType.Anthropic) ? data : // ID10082025.n
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

            const emsg = `AI Service endpoint returned exception: [${data}].`; // ID10082025.n
            err_msg = {
              error: {
                target: element.uri,
                message: emsg,
                code: "unauthorized"
              }
            };

            respMessage = {
              http_code: status,
              uri_idx: (uriIdx - 1), // ID03262025.n
              data: (req.inboundApiType === AiGatewayInboundReqApiType.Anthropic) ? err_msg : // ID10082025.n
                {
                  jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
                  id: req.a2aReqId,
                  error: { code: A2AErrorCodes.AuthError, message: "AI Service endpoint returned an exception.", data } // Authentication error
                }
            };
          };
        }
        catch (error) {
          const emsg = `AI Services Gateway encountered exception: [${error.message}].`; // ID10082025.n
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
            uri_idx: (uriIdx - 1), // ID03262025.n
            data: (req.inboundApiType === AiGatewayInboundReqApiType.Anthropic) ? err_msg : // ID10082025.n
              {
                jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
                id: req.a2aReqId,
                error: { code: -32603, message: emsg } // Internal JSON-RPC error
              }
          };
        }
        finally { // ID06162025.sn
          if (routerInstance && (routerInstance.routerType === EndpointRouterTypes.LeastConnectionsRouter))
            routerInstance.updateUriConnections(req.id, false, uriIdx - 1);
        }; // ID06162025.en
      }; // end of endpoint for loop

    }
    while (continueRetry && triedEps.some(val => val === false)); // ID05222026.n

    if (retryAfter > 0) {
      if (respMessage == null) { // ID06162025.n
        const emsg = `All backend Azure OAI endpoints are too busy! Retry after [${retryAfter}] seconds ...`; // ID10082025.n

        err_msg = {
          error: {
            target: req.originalUrl,
            message: emsg,
            code: "tooManyRequests"
          }
        };

        respMessage = {
          http_code: 429, // Server is busy, retry later!
          uri_idx: (uriIdx - 1), // ID05082025.n
          data: (req.inboundApiType === AiGatewayInboundReqApiType.Anthropic) ? err_msg : // ID10082025.n
            {
              jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
              id: req.a2aReqId,
              error: { code: -32002, message: emsg } // Too many requests, server is busy
            },
          retry_after: retryAfter
        };
      };  // ID06162025.n
    }
    else {
      if (respMessage == null) {
        const emsg = "Internal server error. Unable to process request. Please check server logs."; // ID10082025.n
        // ID06132024.sn
        err_msg = {
          error: {
            target: req.originalUrl,
            message: emsg,
            code: "internalFailure"
          }
        };
        // ID06132024.en

        respMessage = {
          http_code: 500, // Internal API Gateway server error!
          data: (req.inboundApiType === AiGatewayInboundReqApiType.Anthropic) ? err_msg : // ID10082025.n
            {
              jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
              id: req.a2aReqId,
              error: { code: -32603, message: emsg } // Internal JSON-RPC error
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
        threadId = th_id; // ID04222026.n

      logger.log({ level: "debug", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Thread ID: %s\n  Completed Message:\n  %s", splat: [scriptName, this.constructor.name, req.id, threadId, JSON.stringify(req.body.messages, null, 2)] });

      values = [
        req.id,
        instanceName, // ID11112024.n
        threadId,
        config.appId,
        {
          content: req.body.messages
        },
        req.body.user, // ID04112024.n
        (uriIdx - 1) //ID05082025.n
      ];

      if (req.get(CustomRequestHeaders.ThreadId)) // Update
        await memoryDao.storeEntity(req.id, 1, values);
      else // Insert
        await memoryDao.storeEntity(req.id, 0, values);

      respMessage.threadId = threadId;

      // ID02142025.sn  Update the threadid in the prompts table for each request
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
      // ID02142025.en
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

    if ( sessionId ) // ID05202026.n
      if ( respMessage.http_code === 200 )
        sendDone(sessionId, { threadId: threadId || null });
      else {
        sendError(sessionId, respMessage.data?.error?.message || 'Execution failed');
        sendDone(sessionId, { error: true });
      };

    return (respMessage);
  } // end of processRequest()
}

module.exports = AzAnthropicProcessor;