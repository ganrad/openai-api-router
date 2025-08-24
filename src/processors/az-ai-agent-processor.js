/**
 * Name: Azure AI Agent processor
 * Description: This class implements a processor for executing/invoking an AI Agent deployed in Azure AI Foundry.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 03-24-2025; 07-10-2025; 08-05-2025
 * Version (Introduced): v2.4.0
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

const {
  CustomRequestHeaders,
  HttpMethods,
  AzureApiVersions,
  AzAiAgentRunStatus,
  AzAiAgentAnnotationTypes,
  EndpointRouterTypes,
  OpenAIChatCompletionMsgRoleTypes,
  AzureResourceUris } = require("../utilities/app-gtwy-constants.js");

const { getAccessToken } = require("../auth/bootstrap-auth.js");

const runStates = [AzAiAgentRunStatus.Queued, AzAiAgentRunStatus.InProgress, AzAiAgentRunStatus.Completed];
const AiAgentProcessorConstants = {
  SleepTime: 5000, // 5 seconds (minimum)
  MaxRetryAttempts: 6 // 6 * 5 = 30 seconds (max. wait time)
}

class AzAiAgentProcessor {

  constructor() {
    this.streamed_response_sent = false;  // When streaming mode is on, send the http headers only once.
  }

  #retrieveCitations(annotations) {
    let citations = new Array();
    for (const annotation of annotations) {
      let citation;

      switch (annotation.type) {
        case AzAiAgentAnnotationTypes.UrlCitation:
          citation = {
            content: annotation.text,
            title: annotation.url_citation.title,
            url: annotation.url_citation.url,
            // filepath: 
            chunk_id: `${annotation.start_index}:${annotation.end_index}`
          };
          break;
        case AzAiAgentAnnotationTypes.FileCitation:
          citation = {
            content: annotation.text,
            filepath: annotation.file_citation.file_id,
            chunk_id: `${annotation.start_index}:${annotation.end_index}`
          };
          break;
      };

      if (citation)
        citations.push(citation);
    }

    return (citations);
  }

  #constructCompletionMessage(requestid, completion, annotations, metadata) {
    let context = null;
    if (annotations) {
      context = {
        citations: this.#retrieveCitations(annotations),
        intent: "none",
        all_retrieved_documents: "none"
      };
    };

    let completionObj = {
      id: metadata.id,
      object: metadata.object,
      created: metadata.created,
      model: metadata.model,
      choices: [
        {
          message: {
            role: "assistant",
            content: completion,
            context: context
          },
          finish_reason: "stop",
          index: 0
        }
      ],
      system_fingerprint: metadata.system_fingerprint
    };

    if (metadata.usage)
      completionObj.usage = metadata.usage;

    logger.log({ level: "debug", message: "[%s] %s.#constructCompletionMessage():\n  Request ID: %s\n  Final Response:\n  %s", splat: [scriptName, this.constructor.name, requestid, JSON.stringify(completionObj, null, 2)] });

    return (completionObj);
  }

  #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async #getOpenAICallMetadata(req, endpoint) {
    const meta = new Map();
    meta.set('Content-Type', 'application/json');
    let bearerToken = req.headers['Authorization'] || req.headers['authorization'];

    if (bearerToken && !req.authInfo) { // AI App Gateway security is not set
      if (process.env.AZURE_AI_SERVICE_MID_AUTH === "true")
        // Use managed identity of the AI App Gateway host if this env var is set (Override the token sent in the header!)
        bearerToken = await getAccessToken(req, AzureResourceUris.AzureAiFoundryService);

      meta.set('Authorization', bearerToken);
      logger.log({ level: "debug", message: "[%s] %s.#getOpenAICallMetadata(): Using Bearer token (MID-IMDS) for AI Agent Auth.\n  Request ID: %s", splat: [scriptName, this.constructor.name, req.id] });
    }
    else { // Use managed identity of the AI App Gateway host to authenticate (discard Ai app gateway auth token!)
      if (process.env.AZURE_AI_SERVICE_MID_AUTH === "true") {
        bearerToken = await getAccessToken(req, AzureResourceUris.AzureAiFoundryService);
        meta.set('Authorization', bearerToken);
        logger.log({ level: "debug", message: "[%s] %s.#getOpenAICallMetadata(): Using Bearer token (MID-IMDS) for AI Agent Auth.\n  Request ID: %s", splat: [scriptName, this.constructor.name, req.id] });
      }
      else {
        // meta.set('api-key', endpoint.apikey);
        meta.set('Authorization', 'Bearer ' + endpoint.apikey);
        logger.log({ level: "debug", message: "[%s] %s.#getOpenAICallMetadata(): Using API Key for AI Agent Auth.\n  Request ID: %s", splat: [scriptName, this.constructor.name, req.id] });
      };
    };

    return (meta);
  }

  async #createAgentThread(
    req,
    meta,
    agentEndpoint) { // 1 - Create Agent thread
    let respMessage;
    let data;
    let err_msg;
    let threadUri = agentEndpoint.uri + '/threads?api-version=' + AzureApiVersions.AiAgentService;

    try {
      logger.log({ level: "info", message: "[%s] %s.#createAgentThread():\n  Request ID: %s\n  Target URI: %s", splat: [scriptName, this.constructor.name, req.id, threadUri] });

      // Create agent thread
      let response = await fetch(
        threadUri, {
        method: HttpMethods.POST,
        headers: meta
      });

      let status = response.status;
      if (status === 200) { // All Ok
        data = await response.json();
        logger.log({ level: "debug", message: "[%s] %s.#createAgentThread():\n  Request ID: %s\n  Response:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(data, null, 2)] });

        respMessage = {
          http_code: status,
          data: data
        };
      }
      else {
        data = await response.text(); // json();
        err_msg = {
          error: {
            target: threadUri,
            message: `createAgentThread(): AI Agent Service Thread endpoint returned exception. Status: ${response.status}, Text: ${response.statusText}, Message: ${data}.`,
            code: "serviceError"
          }
        };
        logger.log({ level: "error", message: "[%s] %s.#createAgentThread():\n  Request ID: %s\n  Status: %s\n  Text: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, response.status, response.statusText, JSON.stringify(err_msg, null, 2)] });

        respMessage = {
          http_code: status,
          status_text: response.statusText,
          data: err_msg
        };
      }
    }
    catch (error) {
      err_msg = {
        error: {
          target: threadUri,
          message: `createAgentThread(): AI Application Gateway encountered exception: [${error}].`,
          code: "internalFailure"
        }
      };
      logger.log({ level: "error", message: "[%s] %s.#createAgentThread():\n  Request ID: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(err_msg, null, 2)] });

      respMessage = {
        http_code: 500,
        data: err_msg
      };
    };

    return (respMessage);
  }

  async #createAndAttachMessageToThread(
    req,
    meta,
    agentEndpoint,
    threadId) { // 2 - Create message & attach to thread
    let respMessage;
    let data;
    let err_msg;
    let threadUri = agentEndpoint.uri + '/threads/' + threadId + '/messages?api-version=' + AzureApiVersions.AiAgentService;

    try {
      let idx = 0;
      for (const item of req.body.messages) {
        if (item.role === OpenAIChatCompletionMsgRoleTypes.UserMessage)
          break;
        idx++;
      };
      logger.log({ level: "info", message: "[%s] %s.#createAndAttachMessageToThread():\n  Request ID: %s\n  Target URI: %s\n  Thread ID: %s\n  Message: %s", splat: [scriptName, this.constructor.name, req.id, threadUri, threadId, JSON.stringify(req.body.messages[idx], null, 2)] });

      // Associate message with agent thread
      let response = await fetch(
        threadUri, {
        method: HttpMethods.POST,
        headers: meta,
        body: JSON.stringify(req.body.messages[idx])
      });

      let status = response.status;
      if (status === 200) { // All Ok
        data = await response.json();
        logger.log({ level: "debug", message: "[%s] %s.#createAndAttachMessageToThread():\n  Request ID: %s\n  Response:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(data, null, 2)] });

        respMessage = {
          http_code: status,
          data: data
        };
      }
      else {
        data = await response.text(); // Unauthorized 401 error doesn't return a JSON!
        err_msg = {
          error: {
            target: threadUri,
            message: `createAndAttachMessageToThread(): AI Agent Service Thread endpoint returned exception. Status: ${response.status}, Text: ${response.statusText}, Message: ${data}.`,
            code: "serviceError"
          }
        };
        logger.log({ level: "error", message: "[%s] %s.#createAndAttachMessageToThread():\n  Request ID: %s\n  Status: %s\n  Text: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, response.status, response.statusText, JSON.stringify(err_msg, null, 2)] });

        respMessage = {
          http_code: status,
          status_text: response.statusText,
          data: err_msg
        };
      }
    }
    catch (error) {
      err_msg = {
        error: {
          target: threadUri,
          message: `createAndAttachMessageToThread(): AI Application Gateway encountered exception: [${error}].`,
          code: "internalFailure"
        }
      };
      logger.log({ level: "error", message: "[%s] %s.#createAndAttachMessageToThread():\n  Request ID: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(err_msg, null, 2)] });

      respMessage = {
        http_code: 500,
        data: err_msg
      };
    };

    return (respMessage);
  }

  async #streamAgentOutput(
    req_id,
    t_id,
    agent_id,
    router_res,
    agent_res) {
    const reader = agent_res.body.getReader();
    const decoder = new TextDecoder("utf-8");

    if (!this.streamed_response_sent) {
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
      router_res.flushHeaders();

      this.streamed_response_sent = true;
    };

    let recv_data = "";
    let cit_data = null;
    let cit_data_str = "";
    let run_data;
    let buffer = "";
    let continueProcess = true;
    while (continueProcess) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value);
      // console.log("=============== ++++ ================"); // 0
      // console.log(`Decoded Chunk:\n${buffer}`); // 1

      let lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          const eventStr = line.slice(6).trim();
          // console.log(`Processing Event: (${eventStr})`); // 2

          if (eventStr !== "thread.message.delta" &&
            eventStr !== "thread.run.completed" &&
            eventStr !== "thread.run.incomplete" &&
            eventStr !== "done") {
            // console.log("Skipping event ...."); // 3
            break;
          };
        };

        if (line.startsWith("data: ")) {
          const payloadStr = line.slice(5).trim();

          if (payloadStr === "[DONE]") {
            continueProcess = false;

            break; // break out of the message processing for loop
          };

          try {
            const payloadObj = JSON.parse(payloadStr);

            if (payloadObj.id.startsWith("run_"))
              run_data = {
                id: payloadObj.id,
                object: payloadObj.object,
                created: payloadObj.created_at,
                model: payloadObj.model,
                system_fingerprint: payloadObj.assistant_id
              };

            const annotations = payloadObj.delta?.content[0].text.annotations;
            if (annotations?.length > 0) {  // Send annotations first
              const openAIChunk = {
                id: payloadObj.id,
                object: "extensions.chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: "agent-mapped",
                choices: [
                  {
                    index: 0,
                    delta: {
                      role: "assistant",
                      context: {
                        citations: this.#retrieveCitations(annotations)
                      }
                    },
                    end_turn: false,
                    finish_reason: null
                  }
                  // system_fingerprint:
                ]
              };
              router_res.write(`data: ${JSON.stringify(openAIChunk)}\n\n`);
              cit_data_str += openAIChunk.choices[0].delta.context.citations[0].content;
              if (!cit_data)
                cit_data = annotations; // If null initialize
              else
                cit_data.push(...annotations);
            };

            const dataStr = payloadObj.delta?.content[0].text.value
            if (dataStr) { // Next send content
              const openAIChunk = {
                id: payloadObj.id,
                object: "extensions.chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: "agent-mapped",
                choices: [
                  {
                    index: 0,
                    delta: { content: dataStr },
                    end_turn: false,
                    finish_reason: null
                  }
                  // system_fingerprint: 
                ]
              };
              router_res.write(`data: ${JSON.stringify(openAIChunk)}\n\n`);
              recv_data += dataStr;
            };

            const usageObj = payloadObj?.usage;
            if (usageObj) { // Send token usage info.
              const openAIChunk = {
                id: payloadObj.id, // Run ID
                object: "extensions.chat.completion.chunk",
                created: payloadObj.created_at,
                model: payloadObj.model,
                usage: usageObj
              };
              router_res.write(`data: ${JSON.stringify(openAIChunk)}\n\n`);

              if (run_data)
                run_data.usage = usageObj;
            };
          }
          catch (err) {
            continue;
          }
        };
      };
      if (!continueProcess)
        break;  // break out of the outer while loop
    }; // end of while loop
    router_res.write(`data: [DONE]\n\n`); // Finally, send [DONE] msg

    logger.log({ level: "info", message: "[%s] %s.#streamAgentOutput():\n  Request ID: %s\n  Thread ID: %s\n  Agent ID: %s\n  Run ID: %s\n  Annotations:\n  %s\n  Completion:\n  %s", splat: [scriptName, this.constructor.name, req_id, t_id, agent_id, run_data.id, cit_data_str, recv_data] });

    const resp_data = this.#constructCompletionMessage(req_id, recv_data, cit_data, run_data);

    return resp_data;
  }

  async #runAgentThread(
    req,
    res,
    meta,
    agentEndpoint,
    threadId,
    agentId) { // 3 - Activate a run on the thread using the supplied agent
    let respMessage;
    let data;
    let err_msg;
    let threadUri = agentEndpoint.uri + '/threads/' + threadId + '/runs?api-version=' + AzureApiVersions.AiAgentService;

    try {
      let payload = {
        assistant_id: agentId,
        instructions: req.body.instructions,
        max_prompt_tokens: req.body.max_prompt_tokens,
        max_completion_tokens: req.body.max_completion_tokens,
        temperature: req.body.temperature,
        top_p: req.body.top_p,
        model: req.body.model,
        parallel_tool_calls: req.body.parallel_tool_calls,
        tool_choice: req.body.tool_choice,
        response_format: req.body.response_format,
        truncation_strategy: req.body.truncation_strategy,
        stream: req.body.stream
      };
      logger.log({ level: "info", message: "[%s] %s.#runAgentThread():\n  Request ID: %s\n  Target URI: %s\n  Agent ID: %s\n  Thread ID: %s\n  Payload:\n  %s", splat: [scriptName, this.constructor.name, req.id, threadUri, agentId, threadId, JSON.stringify(payload, null, 2)] });

      // Avoid Zombie connections, memory leaks etc
      let signal = null;
      if (payload.stream) {
        const controller = new AbortController();
        signal = controller.signal;

        // Abort fetch if client disconnects -
        req.on('close', () => {
          logger.log({ level: "warn", message: "[%s] %s.#runAgentThread():\n  Request ID: %s", splat: [scriptName, this.constructor.name, req.id] });
          controller.abort();
        });
      };

      // Call AI Agent API to run thread using agent
      let response = await fetch(
        threadUri, {
        method: HttpMethods.POST,
        headers: meta,
        body: JSON.stringify(payload),
        signal
      });

      let status = response.status;
      if (status === 200) { // All Ok
        if (payload.stream)
          data = await this.#streamAgentOutput(req.id, threadId, agentId, res, response);
        else
          data = await response.json();
        logger.log({ level: "debug", message: "[%s] %s.#runAgentThread():\n  Request ID: %s\n  Response:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(data, null, 2)] });

        respMessage = {
          http_code: status,
          data: data
        };
      }
      else {
        data = await response.text();
        err_msg = {
          error: {
            target: threadUri,
            message: `runAgentThread(): AI Agent Service Thread endpoint returned exception. Status: ${response.status}, Text: ${response.statusText}, Message: ${data}.`,
            code: "serviceError"
          }
        };
        logger.log({ level: "error", message: "[%s] %s.#runAgentThread():\n  Request ID: %s\n  Status: %s\n  Text: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, response.status, response.statusText, JSON.stringify(err_msg, null, 2)] });

        respMessage = {
          http_code: status,
          status_text: response.statusText,
          data: err_msg
        };
      }
    }
    catch (error) {
      err_msg = {
        error: {
          target: threadUri,
          message: `runAgentThread(): AI Application Gateway encountered exception: [${error}].`,
          code: "internalFailure"
        }
      };
      logger.log({ level: "error", message: "[%s] %s.#runAgentThread():\n  Request ID: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(err_msg, null, 2)] });

      respMessage = {
        http_code: 500,
        data: err_msg
      };
    };

    return (respMessage);
  }

  async #checkRunStatus(
    req,
    meta,
    agentEndpoint,
    threadId,
    runId,
    attempt) { // 4 - Check status of run
    let respMessage;
    let data;
    let err_msg;
    let threadUri = agentEndpoint.uri + '/threads/' + threadId + '/runs/' + runId + '?api-version=' + AzureApiVersions.AiAgentService;

    try {
      logger.log({ level: "info", message: "[%s] %s.#checkRunStatus():\n  Request ID: %s\n  Target URI: %s\n  Thread ID: %s\n  Run ID: %s\n  Retry Attempt: %d", splat: [scriptName, this.constructor.name, req.id, threadUri, threadId, runId, attempt + 1] });

      // Check thread run status
      let response = await fetch(
        threadUri, {
        method: HttpMethods.GET,
        headers: meta
      });

      let status = response.status;
      if (status === 200) { // All Ok
        data = await response.json();
        logger.log({ level: "debug", message: "[%s] %s.#checkRunStatus():\n  Request ID: %s\n  Response:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(data, null, 2)] });

        if (runStates.includes(data.status)) {
          respMessage = {
            http_code: status,
            data: data
          };
        }
        else // data.status === AzAiAgentRunStatus.Failed
          respMessage = {
            http_code: 429, // Too many requests, retry
            data: {
              error: {
                target: threadUri,
                message: data.last_error.message,
                code: data.last_error.code
              }
            }
          };
      }
      else {
        data = await response.text();
        err_msg = {
          error: {
            target: threadUri,
            message: `checkRunStatus(): AI Agent Service Thread endpoint returned exception. Status: ${response.status}, Text: ${response.statusText}, Message: ${data}.`,
            code: "serviceError"
          }
        };
        logger.log({ level: "error", message: "[%s] %s.#checkRunStatus():\n  Request ID: %s\n  Status: %s\n  Text: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, response.status, response.statusText, JSON.stringify(err_msg, null, 2)] });

        respMessage = {
          http_code: status,
          status_text: response.statusText,
          data: err_msg
        };
      }
    }
    catch (error) {
      err_msg = {
        error: {
          target: threadUri,
          message: `checkRunStatus(): AI Application Gateway encountered exception: [${error}].`,
          code: "internalFailure"
        }
      };
      logger.log({ level: "error", message: "[%s] %s.#checkRunStatus():\n  Request ID: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(err_msg, null, 2)] });

      respMessage = {
        http_code: 500,
        data: err_msg
      };
    };

    return (respMessage);
  }

  async #retrieveAgentResponse(
    req,
    meta,
    agentEndpoint,
    threadId,
    runId) { // 5 - Retrieve agent response
    let respMessage;
    let data;
    let err_msg;
    let threadUri = agentEndpoint.uri + '/threads/' + threadId + '/messages?api-version=' + AzureApiVersions.AiAgentService;

    try {
      logger.log({ level: "info", message: "[%s] %s.#retrieveAgentResponse():\n  Request ID: %s\n  Target URI: %s\n  Thread ID: %s\n  Run ID: %s", splat: [scriptName, this.constructor.name, req.id, threadUri, threadId, runId] });

      // Create agent thread
      let response = await fetch(
        threadUri, {
        method: HttpMethods.GET,
        headers: meta
      });

      let status = response.status;
      if (status === 200) { // All Ok
        let respObject = await response.json();
        logger.log({ level: "debug", message: "[%s] %s.#retrieveAgentResponse():\n  Request ID: %s\n  Response:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(respObject, null, 2)] });

        for (let i = 0; i < respObject.data.length; i++) {
          const obj = respObject.data[i];
          if (obj.run_id === runId) {
            data = obj;
            break;
          };
        }

        respMessage = {
          http_code: status,
          data: data
        };
      }
      else {
        data = await response.text();
        err_msg = {
          error: {
            target: threadUri,
            message: `retrieveAgentResponse(): AI Agent Service Thread endpoint returned exception. Status: ${response.status}, Text: ${response.statusText}, Message: ${data}.`,
            code: "serviceError"
          }
        };
        logger.log({ level: "error", message: "[%s] %s.#retrieveAgentResponse():\n  Request ID: %s\n  Status: %s\n  Text: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, response.status, response.statusText, JSON.stringify(err_msg, null, 2)] });

        respMessage = {
          http_code: status,
          status_text: response.statusText,
          data: err_msg
        };
      }
    }
    catch (error) {
      err_msg = {
        error: {
          target: threadUri,
          message: `retrieveAgentResponse(): AI Application Gateway encountered exception: [${error}].`,
          code: "internalFailure"
        }
      };
      logger.log({ level: "error", message: "[%s] %s.#retrieveAgentResponse():\n  Request ID: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(err_msg, null, 2)] });

      respMessage = {
        http_code: 500,
        data: err_msg
      };
    };

    return (respMessage);
  }

  async processRequest(
    req, // 0 - Request
    res, // 1 - Response
    config) { // 2 - App Config

    let apps = req.targeturis; // Global AI applications (context) object
    let cacheConfig = req.cacheconfig; // Global cache config
    let memoryConfig = arguments[3]; // AI application state management config
    let appConnections = arguments[4]; // EP metrics obj for all applications
    let cacheMetrics = arguments[5]; // Cache hit metrics obj for all apps
    const routerInstance = arguments[7]; // Router instance
    let instanceName = (process.env.POD_NAME) ? apps.serverId + '-' + process.env.POD_NAME : apps.serverId; // Server instance name

    // Get agent thread ID from request header
    let threadId = memoryConfig?.useMemory ? req.get(CustomRequestHeaders.ThreadId) : null;
    let threadStarted = threadId ? false : true;

    logger.log({ level: "info", message: "[%s] %s.processRequest(): Request ID: %s\n  URL: %s\n  User: %s\n  Thread ID: %s\n  Application ID: %s\n  Type: %s\n  Request Payload:\n  %s", splat: [scriptName, this.constructor.name, req.id, req.originalUrl, req.user?.name, threadId, config.appId, config.appType, JSON.stringify(req.body, null, 2)] });

    let respMessage = null; // IMPORTANT: Populate the response message before returning!

    // Has caching been disabled on the request using query param ~ 'use_cache=false' ?
    let useCache = config.useCache;
    if (useCache && req.query.use_cache)
      useCache = req.query.use_cache === 'false' ? false : useCache;

    let vecEndpoints = null;  // Embedding model endpoints array
    let embeddedPrompt = null;
    let cacheDao = null;
    let promptDao = null;
    let values = null;
    let metadata = null;
    let err_msg = null;
    let uriIdx = 0;
    let routerEndpointId;
    let routerIdTried = false;

    let epdata = appConnections.getConnection(config.appId);

    // Populate the array to track which endpoints have been tried ....
    let triedEps = new Array(config.appEndpoints.length).fill(false);

    if (routerInstance)
      routerEndpointId = routerInstance.getEndpointId(req);

    let stTime; // Endpoint processing start time
    let retryAfter = 0;
    const callStartTime = Date.now(); // Inbound API call start time
    let endpointId;
    do {
      uriIdx = 0;  // Initialize the endpoint index!
      for (const endpoint of config.appEndpoints) { // start of endpoint for loop
        endpointId = endpoint.id; // Set the endpoint id

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

        let metricsObj = epdata.get(endpoint.uri + "/" + endpoint.id);
        let healthArr = metricsObj.isEndpointHealthy(req.id);
        if (!healthArr[0]) {
          if (retryAfter > 0)
            retryAfter = (healthArr[1] < retryAfter) ? healthArr[1] : retryAfter;
          else
            retryAfter = healthArr[1];

          continue; // skip this endpoint as rpm has been hit!
        };

        const meta = await this.#getOpenAICallMetadata(req, endpoint);
        try {
          if (routerInstance && (routerInstance.routerType === EndpointRouterTypes.LeastConnectionsRouter))
            routerInstance.updateUriConnections(req.id, true, uriIdx - 1);

          stTime = Date.now();
          // 1. Create a new agent thread
          if (!threadId) {
            respMessage = await this.#createAgentThread(req, meta, endpoint);
            if (respMessage.http_code !== 200) {
              metricsObj.updateFailedCalls(respMessage.http_code, 0);

              continue; // Try the next agent endpoint
            }
            else
              threadId = respMessage.data.id;
          };

          // 2. Create a message and attach to thread
          respMessage = await this.#createAndAttachMessageToThread(req, meta, endpoint, threadId);
          if (respMessage.http_code !== 200) {
            metricsObj.updateFailedCalls(respMessage.http_code, 0);

            continue;
          };

          // 3. Run thread using agent
          let runId;
          respMessage = await this.#runAgentThread(req, res, meta, endpoint, threadId, endpoint.id);
          if (respMessage.http_code !== 200) {
            metricsObj.updateFailedCalls(respMessage.http_code, 0);

            continue;
          }
          else {
            if (req.body.stream) {
              const respTime = Date.now() - stTime;
              metricsObj.updateApiCallsAndTokens(
                respMessage.data.usage?.total_tokens,
                respTime,
                threadStarted
              );

              break; // Break out of the endpoint for loop
            }
            else
              runId = respMessage.data.id;
          };

          // 4. Check agent run status
          let runError = false;
          let waitIdx = 0; // Fixed & no exponential delay.
          while (true) {
            respMessage = await this.#checkRunStatus(req, meta, endpoint, threadId, runId, waitIdx);
            if (respMessage.http_code !== 200) {
              metricsObj.updateFailedCalls(respMessage.http_code, 0);
              runError = true;

              break;
            };

            // console.log(`***** Agent Response *****\n ${JSON.stringify(respMessage.data, null, 2)}\n*****`);

            if (respMessage.data.status === AzAiAgentRunStatus.Completed) {
              metadata = {
                id: respMessage.data.id, // Run ID
                usage: respMessage.data.usage, // Token counts
                model: respMessage.data.model // LLM
              };

              break;
            }
            else {  // status = in_progress
              await this.#sleep(AiAgentProcessorConstants.SleepTime); // Sleep for 5 seconds
              if (waitIdx < AiAgentProcessorConstants.MaxRetryAttempts)
                waitIdx++;
              else {
                runError = true;

                err_msg = {
                  error: {
                    target: endpoint.uri + '/threads/' + threadId + '/runs/' + runId + '?api-version=' + AzureApiVersions.AiAgentService,
                    message: `Retry attempts [${waitIdx}:${waitIdx * AiAgentProcessorConstants.SleepTime}] exceeded.`,
                    code: "internalFailure"
                  }
                };
                logger.log({ level: "error", message: "[%s] %s.processRequest(): Max wait time exceeded.\n  Error: %s", splat: [scriptName, this.constructor.name, JSON.stringify(err_msg, null, 2)] });

                respMessage = {
                  http_code: 500,
                  uri_idx: uriIdx - 1,
                  data: err_msg
                };

                break;
              };
            };
          }; // end of while loop -

          if (runError)
            continue;

          // 5. Retrieve agent response
          respMessage = await this.#retrieveAgentResponse(req, meta, endpoint, threadId, runId);
          // Todo: Loop thru and run the async calls with another assistant uri!

          if (respMessage.http_code !== 200) {
            metricsObj.updateFailedCalls(respMessage.http_code, 0);

            continue;
          }
          else {
            metadata.created = respMessage.data.created_at; // Message created at
            metadata.object = respMessage.data.object; // Thread message object
            metadata.system_fingerprint = respMessage.data.assistant_id; // Assistant ID

            // 6. Construct response message
            respMessage = {
              data: this.#constructCompletionMessage(req.id, respMessage.data.content[0].text.value, respMessage.data.content[0].text.annotations, metadata),
              http_code: 200,
              threadId: threadId
            };

            const respTime = Date.now() - stTime;
            metricsObj.updateApiCallsAndTokens(
              respMessage.data.usage?.total_tokens,
              respTime,
              threadStarted
            );

            if (routerInstance && (routerInstance.routerType === EndpointRouterTypes.WeightedDynamicRouter))
              routerInstance.updateWeightsBasedOnLatency(uriIdx - 1, respTime);
          };

          retryAfter = 0;  // IMP: Set the retry after var to zero!!
          break; // Completed request; break!
        }
        catch (error) {
          err_msg = {
            error: {
              target: req.originalUrl,
              message: `AI Application Gateway encountered exception: [${error}].`,
              code: "internalFailure"
            }
          };
          logger.log({ level: "error", message: "[%s] %s.processRequest(): Encountered exception:\n  %s", splat: [scriptName, this.constructor.name, JSON.stringify(err_msg, null, 2)] });

          respMessage = {
            http_code: 500,
            data: err_msg
          };
        }
        finally {
          if (routerInstance && (routerInstance.routerType === EndpointRouterTypes.LeastConnectionsRouter))
            routerInstance.updateUriConnections(req.id, false, uriIdx - 1);
        };
      }; // end of endpoints for loop
    }
    while (((retryAfter > 0) || (respMessage.http_code !== 200)) && triedEps.some(val => val === false));

    if ((retryAfter > 0) && (respMessage == null)) { // When all endpoints have hit RPM limit | Backends latency is high
      err_msg = {
        error: {
          target: req.originalUrl,
          message: `All backend AI Agents have either a) Hit the configured RPM limits or b) Surpassed the configured latency threshold! Retry after [${retryAfter}] seconds ...`,
          code: "tooManyRequests"
        }
      };

      respMessage = {
        http_code: 429, // Too many requests, retry later!
        data: err_msg,
        retry_after: retryAfter
      };
    };
    respMessage.uri_idx = uriIdx - 1; // Set the URI index in both success and failure paths ....

    // 7. Persist prompt and completion in both success and failure paths
    let persistPrompts = (process.env.API_GATEWAY_PERSIST_PROMPTS === 'true') ? true : false
    if (persistPrompts) { // Persist prompt and completion ?
      promptDao = new PersistDao(persistdb, TblNames.Prompts);
      values = [
        threadId,
        req.id,
        instanceName,
        config.appId,
        req.body,
        respMessage.data,
        req.body.user,
        (Date.now() - callStartTime) / 1000, // End to end call time
        endpointId ?? "index-" + respMessage.uri_idx
      ];

      await promptDao.storeEntity(
        req.id,
        2,
        values
      );
    };

    return (respMessage);
  } // end of processRequest()
}

module.exports = AzAiAgentProcessor;