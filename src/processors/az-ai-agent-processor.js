/**
 * Name: Azure AI Agent processor
 * Description: This class implements a processor for executing/invoking an Azure AI Agent.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 03-24-2025
 * Version: v2.4.0 (Introduced)
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
const pgvector = require("pgvector/pg");
const { 
  CustomRequestHeaders, 
  HttpMethods, 
  AzureApiVersions,
  AzAiAgentRunStatus,
  AzAiAgentAnnotationTypes } = require("../utilities/app-gtwy-constants.js");

const { getAccessToken } = require("../auth/bootstrap-auth.js");

const runStates = [ AzAiAgentRunStatus.Queued, AzAiAgentRunStatus.InProgress, AzAiAgentRunStatus.Completed ];
const AiAgentProcessorConstants = {
  SleepTime: 5000, // 5 seconds (minimum)
  MaxRetryAttempts: 6 // 6 * 5 = 30 seconds (max. wait time)
}

class AzAiAgentProcessor {

  constructor() {
  }

  #retrieveCitations(annotations) {
    let citations = new Array();
    for ( const annotation of annotations ) {
      let citation;
      
      switch ( annotation.type ) {
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

    return(citations);
  }

  #constructCompletionMessage(completion, annotations, metadata) {
    let completionObj = null;

    completionObj = {
      id: metadata.id,
      object: metadata.object,
      created: metadata.created,
      model: metadata.model,
      choices: [
        {
          message: {
            role: "assistant",
            content: completion,
          },
          finish_reason: "stop",
          index: 0
        }
      ],
      system_fingerprint: metadata.system_fingerprint
    };

    if ( annotations )
      completionObj.choices[0].message.context = {
        citations: this.#retrieveCitations(annotations),
        intent: "none",
        all_retrieved_documents: "none"
      };

    if ( metadata.usage )
      completionObj.usage = metadata.usage;

    return (completionObj);
  }

  #constructCompletionMessage_0(completion, citations, metadata) {
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
              role: "assistant",
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
              role: "assistant",
              content: completion,
            },
            finish_reason: "stop",
            index: 0
          }
        ],
        system_fingerprint: metadata.system_fingerprint
      };
      if ( metadata.usage )
        completionObj.usage = metadata.usage;
    };

    return (completionObj);
  }

  #toolsMessagesNotPresent(msgs) {
    let retval = true;
    msgs.forEach(element => {
      if ( element.tool_calls ) {
        retval = false;

        return;
      }
    });

    return(retval);
  }

  #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async #createAgentThread(req, agentEpUri) { // 1 - Create Agent thread
    let respMessage;
    let data;
    let err_msg;
    let threadUri = agentEpUri + '/threads?api-version=' + AzureApiVersions.AiAgentService;

    try {
      const meta = new Map();
      meta.set('Content-Type', 'application/json');
      let bearerToken = req.headers['Authorization'] || req.headers['authorization'];
      
      if ( !req.authInfo ) { // AI App Gateway security is not set
        if ( process.env.AZURE_AI_SERVICE_MID_AUTH === "true" )
          // Use managed identity of the AI App Gateway host if this env var is set
          bearerToken = await getAccessToken(req);

        meta.set('Authorization', bearerToken);
      }
      else { // Use managed identity of the AI App Gateway host to authenticate (discard Ai app gateway auth token!)
        bearerToken = await getAccessToken(req);
        meta.set('Authorization', bearerToken);
      };
      logger.log({ level: "info", message: "[%s] %s.createAgentThread():\n  Request ID: %s\n  Target URI: %s\n  Token: %s", splat: [scriptName, this.constructor.name, req.id, threadUri, bearerToken] });

      // Create agent thread
      let response = await fetch(threadUri, {
        method: HttpMethods.POST,
        headers: meta
      });

      let status = response.status;
      if (status === 200) { // All Ok
        data = await response.json();
        logger.log({ level: "debug", message: "[%s] %s.createAgentThread():\n  Request ID: %s\n  Response:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(data, null, 2)] });

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
        logger.log({ level: "error", message: "[%s] %s.createAgentThread():\n  Request ID: %s\n  Status: %s\n  Text: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, response.status, response.statusText, JSON.stringify(err_msg, null, 2)] });

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
      logger.log({ level: "error", message: "[%s] %s.createAgentThread():\n  Request ID: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(err_msg, null, 2)] });

      respMessage = {
        http_code: 500,
        data: err_msg
      };
    };

    return(respMessage);
  }

  async #createAndAttachMessageToThread(req, agentEpUri, threadId) { // 2 - Create message & attach to thread
    let respMessage;
    let data;
    let err_msg;
    let threadUri = agentEpUri + '/threads/' + threadId + '/messages?api-version=' + AzureApiVersions.AiAgentService;

    try {
      const meta = new Map();
      meta.set('Content-Type', 'application/json');
      let bearerToken = req.headers['Authorization'] || req.headers['authorization'];
      
      if ( !req.authInfo ) { // AI App Gateway security is not set
        if ( process.env.AZURE_AI_SERVICE_MID_AUTH === "true" )
          // Use managed identity of the AI App Gateway host if this env var is set
          bearerToken = await getAccessToken(req);

        meta.set('Authorization', bearerToken);
      }
      else { // Use managed identity of the AI App Gateway host to authenticate (discard Ai app gateway auth token!)
        bearerToken = await getAccessToken(req);
        meta.set('Authorization', bearerToken);
      };
      logger.log({ level: "info", message: "[%s] %s.createAndAttachMessageToThread():\n  Request ID: %s\n  Target URI: %s\n  Thread ID: %s\n  Message: %s", splat: [scriptName, this.constructor.name, req.id, threadUri, threadId, JSON.stringify(req.body.messages[0], null, 2)] });

      // Create agent thread
      let response = await fetch(threadUri, {
        method: HttpMethods.POST,
        headers: meta,
        body: JSON.stringify(req.body.messages[0])
      });

      let status = response.status;
      if (status === 200) { // All Ok
        data = await response.json();
        logger.log({ level: "debug", message: "[%s] %s.createAndAttachMessageToThread():\n  Request ID: %s\n  Response:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(data, null, 2)] });

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
        logger.log({ level: "error", message: "[%s] %s.createAndAttachMessageToThread():\n  Request ID: %s\n  Status: %s\n  Text: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, response.status, response.statusText, JSON.stringify(err_msg, null, 2)] });

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
      logger.log({ level: "error", message: "[%s] %s.createAndAttachMessageToThread():\n  Request ID: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(err_msg, null, 2)] });

      respMessage = {
        http_code: 500,
        data: err_msg
      };
    };

    return(respMessage);
  }

  async #runAgentThread(req, agentEpUri, threadId, agentId) { // 3 - Run thread using the supplied agent
    let respMessage;
    let data;
    let err_msg;
    let threadUri = agentEpUri + '/threads/' + threadId + '/runs?api-version=' + AzureApiVersions.AiAgentService;

    try {
      const meta = new Map();
      meta.set('Content-Type', 'application/json');
      let bearerToken = req.headers['Authorization'] || req.headers['authorization'];  // Case in-sensitive match
      
      if ( !req.authInfo ) { // AI App Gateway security is not set
        if ( process.env.AZURE_AI_SERVICE_MID_AUTH === "true" )
          // Use managed identity of the AI App Gateway host if this env var is set
          bearerToken = await getAccessToken(req);

        meta.set('Authorization', bearerToken);
      }
      else { // Use managed identity of the AI App Gateway host to authenticate (discard Ai app gateway auth token!)
        bearerToken = await getAccessToken(req);
        meta.set('Authorization', bearerToken);
      };
      logger.log({ level: "info", message: "[%s] %s.runAgentThread():\n  Request ID: %s\n  Agent ID: %s\n  Target URI: %s\n  Thread ID: %s", splat: [scriptName, this.constructor.name, req.id, agentId, threadUri, threadId] });

      // Run thread using agent
      let response = await fetch(threadUri, {
        method: HttpMethods.POST,
        headers: meta,
        body: JSON.stringify({ assistant_id: agentId })
      });

      let status = response.status;
      if (status === 200) { // All Ok
        data = await response.json();
        logger.log({ level: "debug", message: "[%s] %s.runAgentThread():\n  Request ID: %s\n  Response:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(data, null, 2)] });

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
        logger.log({ level: "error", message: "[%s] %s.runAgentThread():\n  Request ID: %s\n  Status: %s\n  Text: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, response.status, response.statusText, JSON.stringify(err_msg, null, 2)] });

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
      logger.log({ level: "error", message: "[%s] %s.runAgentThread():\n  Request ID: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(err_msg, null, 2)] });

      respMessage = {
        http_code: 500,
        data: err_msg
      };
    };

    return(respMessage);
  }

  async #checkRunStatus(req, agentEpUri, threadId, runId, attempt) { // 4 - Check status of run
    let respMessage;
    let data;
    let err_msg;
    let threadUri = agentEpUri + '/threads/' + threadId + '/runs/' + runId + '?api-version=' + AzureApiVersions.AiAgentService;

    try {
      const meta = new Map();
      meta.set('Content-Type', 'application/json');
      let bearerToken = req.headers['Authorization'] || req.headers['authorization'];  // Case in-sensitive match
      
      if ( !req.authInfo ) { // AI App Gateway security is not set
        if ( process.env.AZURE_AI_SERVICE_MID_AUTH === "true" )
          // Use managed identity of the AI App Gateway host if this env var is set
          bearerToken = await getAccessToken(req);

        meta.set('Authorization', bearerToken);
      }
      else { // Use managed identity of the AI App Gateway host to authenticate (discard Ai app gateway auth token!)
        bearerToken = await getAccessToken(req);
        meta.set('Authorization', bearerToken);
      };
      logger.log({ level: "info", message: "[%s] %s.checkRunStatus():\n  Request ID: %s\n  Target URI: %s\n  Thread ID: %s\n  Run ID: %s\n  Retry Attempt: %d", splat: [scriptName, this.constructor.name, req.id, threadUri, threadId, runId, attempt + 1] });

      // Check thread run status
      let response = await fetch(threadUri, {
        method: HttpMethods.GET,
        headers: meta
      });

      let status = response.status;
      if (status === 200) { // All Ok
        data = await response.json();
        logger.log({ level: "debug", message: "[%s] %s.checkRunStatus():\n  Request ID: %s\n  Response:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(data, null, 2)] });

        if ( runStates.includes(data.status) ) {
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
        logger.log({ level: "error", message: "[%s] %s.checkRunStatus():\n  Request ID: %s\n  Status: %s\n  Text: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, response.status, response.statusText, JSON.stringify(err_msg, null, 2)] });

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
      logger.log({ level: "error", message: "[%s] %s.checkRunStatus():\n  Request ID: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(err_msg, null, 2)] });

      respMessage = {
        http_code: 500,
        data: err_msg
      };
    };

    return(respMessage);
  }

  async #retrieveAgentResponse(req, agentEpUri, threadId, runId) { // 5 - Retrieve agent response
    let respMessage;
    let data;
    let err_msg;
    let threadUri = agentEpUri + '/threads/' + threadId + '/messages?api-version=' + AzureApiVersions.AiAgentService;

    try {
      const meta = new Map();
      meta.set('Content-Type', 'application/json');
      let bearerToken = req.headers['Authorization'] || req.headers['authorization'];  // Case in-sensitive match
      
      if ( !req.authInfo ) { // AI App Gateway security is not set
        if ( process.env.AZURE_AI_SERVICE_MID_AUTH === "true" )
          // Use managed identity of the AI App Gateway host if this env var is set
          bearerToken = await getAccessToken(req);

        meta.set('Authorization', bearerToken);
      }
      else { // Use managed identity of the AI App Gateway host to authenticate (discard Ai app gateway auth token!)
        bearerToken = await getAccessToken(req);
        meta.set('Authorization', bearerToken);
      };
      logger.log({ level: "info", message: "[%s] %s.retrieveAgentResponse():\n  Request ID: %s\n  Target URI: %s\n  Thread ID: %s\n  Run ID: %s", splat: [scriptName, this.constructor.name, req.id, threadUri, threadId, runId] });

      // Create agent thread
      let response = await fetch(threadUri, {
        method: HttpMethods.GET,
        headers: meta
      });

      let status = response.status;
      if (status === 200) { // All Ok
        let respObject = await response.json();
        logger.log({ level: "debug", message: "[%s] %s.retrieveAgentResponse():\n  Request ID: %s\n  Response:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(respObject, null, 2)] });
        
        for (let i = 0; i < respObject.data.length; i++) {
          const obj = respObject.data[i];
          if ( obj.run_id === runId ) {
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
        logger.log({ level: "error", message: "[%s] %s.retrieveAgentResponse():\n  Request ID: %s\n  Status: %s\n  Text: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, response.status, response.statusText, JSON.stringify(err_msg, null, 2)] });

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
      logger.log({ level: "error", message: "[%s] %s.retrieveAgentResponse():\n  Request ID: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(err_msg, null, 2)] });

      respMessage = {
        http_code: 500,
        data: err_msg
      };
    };

    return(respMessage);
  }

  async processRequest(
    req, // 0 - Request
    res, // 1 - Response
    config) { // 2 - App Config

    let apps = req.targeturis; // Global Ai applications (context) object
    let cacheConfig = req.cacheconfig; // Global cache config
    let appConnections = arguments[3]; // EP metrics obj for all applications
    let cacheMetrics = arguments[4]; // Cache hit metrics obj for all apps
    let instanceName = (process.env.POD_NAME) ? apps.serverId + '-' + process.env.POD_NAME : apps.serverId; // Server instance name

    // Get agent thread ID in request header
    let threadId = req.get(CustomRequestHeaders.ThreadId);

    logger.log({ level: "info", message: "[%s] %s.processRequest(): Request ID: %s\n  URL: %s\n  User: %s\n  Thread ID: %s\n  Application ID: %s\n  Type: %s\n  Request Payload:\n  %s", splat: [scriptName, this.constructor.name, req.id, req.originalUrl, req.user?.name, threadId, config.appId, config.appType, JSON.stringify(req.body, null, 2)] });

    let respMessage = null; // Populate the response message before returning!

    // Has caching been disabled on the request using query param ~ 'use_cache=false' ?
    let useCache = config.useCache;
    if ( useCache && req.query.use_cache )
      useCache = req.query.use_cache === 'false' ? false : useCache;

    let vecEndpoints = null;  // Embedding model endpoints array
    let embeddedPrompt = null;
    let cacheDao = null;
    let promptDao = null;
    let values = null;
    let metadata = null;

    let err_msg = null;
    let uriIdx = 0;

    let stTime = Date.now();
    try {
      for (const endpoint of config.appEndpoints) { // start of endpoint for loop
        uriIdx++;

        if ( ! threadId ) {
          // 1. Create a new agent thread
          respMessage = await this.#createAgentThread(req, endpoint.uri);
          if ( respMessage.http_code !== 200 ) {
            // metricsObj.updateFailedCalls(respMessage.http_code, 0);

            continue; // Try the next agent endpoint
          }
          else
            threadId = respMessage.data.id;
        };

        // 2. Create a message and attach to thread
        respMessage = await this.#createAndAttachMessageToThread(req, endpoint.uri, threadId);
        if ( respMessage.http_code !== 200 )
          continue;

        // 3. Run thread using agent
        let runId;
        respMessage = await this.#runAgentThread(req, endpoint.uri, threadId, endpoint.id);
        if ( respMessage.http_code !== 200 )
          continue;
        else
          runId = respMessage.data.id

        // 4. Check agent run status
        let runError = false;
        let waitIdx = 0; // Fixed & no exponential delay.
        while ( true ) {
          respMessage = await this.#checkRunStatus(req, endpoint.uri, threadId, runId, waitIdx);
          if ( respMessage.http_code !== 200 ) {
            runError = true;

            break;
          };

          // console.log(`***** Agent Response *****\n ${JSON.stringify(respMessage.data, null, 2)}\n*****`);

          if ( respMessage.data.status === AzAiAgentRunStatus.Completed ) {
            metadata = {
              id: respMessage.data.id, // Run ID
              usage: respMessage.data.usage, // Token counts
              model: respMessage.data.model // LLM
            };

            break;
          }
          else {  // status = in_progress
            await this.#sleep(AiAgentProcessorConstants.SleepTime); // Sleep for 5 seconds
            if ( waitIdx < AiAgentProcessorConstants.MaxRetryAttempts )
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

        if ( runError )
          continue;

        // 5. Retrieve agent response
        respMessage = await this.#retrieveAgentResponse(req, endpoint.uri, threadId, runId);
        // Todo: Loop thru and run the async calls with another assistant uri!
        if ( respMessage.http_code !== 200 )
          continue; 

        break; // Completed request; break!
      }; // end of endpoints for loop

      if ( respMessage.http_code === 200 ) {
        metadata.created = respMessage.data.created_at; // Message created at
        metadata.object = respMessage.data.object; // Thread message object
        metadata.system_fingerprint = respMessage.data.assistant_id; // Assistant ID

        // 6. Construct response message
        respMessage = {
          data: this.#constructCompletionMessage(respMessage.data.content[0].text.value, respMessage.data.content[0].text.annotations, metadata),
          http_code: 200,
          threadId: threadId
        };
      };
      respMessage.uri_idx = uriIdx - 1; // Set the URI Index which served the response
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
        uri_idx: uriIdx - 1,
        data: err_msg
      };
    };
    let respTime = Date.now() - stTime;

    return (respMessage);
  } // end of processRequest()
}

module.exports = AzAiAgentProcessor;