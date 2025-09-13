/**
 * Name: SessionDataHandler
 * Description: This class retrieves data associated with a user session.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 07-24-2025
 * Version (Introduced): 2.4.0
 *
 * Notes:
 *
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger.js');

const { TblNames, PersistDao } = require("../utilities/persist-dao.js");
const persistdb = require("../services/pp-pg.js");
const { AzAiServices, ServerTypes, AzureApiVersions, HttpMethods, AzureResourceUris } = require("../utilities/app-gtwy-constants");
const { getAccessToken } = require("../auth/bootstrap-auth.js");
const AbstractDataHandler = require('./abstract-data-handler.js');

class SessionDataHandler extends AbstractDataHandler {
  constructor() {
    super();
  }

  #getEndpointName(aiApp, endpointId) {
    let endpointName = null;

    for ( let ep = 0; ep < aiApp.endpoints.length; ep++ ) {
      if ( ep === endpointId ) {
        endpointName = aiApp.endpoints[ep].id;
        break;
      };
    };

    return(endpointName);
  }

  async #getSDServerModelSessionInfo(req, aiApp) {
    let respMessage;
    let err_msg;

    const appId = req.params.app_id; // AI Application ID
    const threadId = req.params.session_id; // User session (/Thread) ID

    let values = [
      threadId,
      appId
    ];

    let memoryDao = new PersistDao(persistdb, TblNames.Memory); // ID05082025.n
    let endpointId = "NA";
    const sessionInfo = await memoryDao.queryTable(req.id, 1, values);
    if (sessionInfo.rCount == 1) // ID05082025.n
      endpointId = sessionInfo.data[0].endpoint_id;

    let promptsDao = new PersistDao(persistdb, TblNames.Prompts);
    const sessionTrace = await promptsDao.queryTable(req.id, 2, values);
    if (sessionTrace.rCount >= 1) {
      respMessage = {
        http_code: 200, // OK
        data: {
          backendUriIndex: (endpointId !== "NA") ? (this.#getEndpointName(aiApp, endpointId) ?? endpointId) : endpointId,
          messageTrace: sessionTrace.data,
          endpointUri: req.originalUrl,
          currentDate: new Date().toLocaleString(),
        }
      };
    }
    else {
      err_msg = {
        error: {
          endpointUri: req.originalUrl,
          message: `Session [ID=${threadId}] not found for AI Application [ID=${appId}].  Please check the parameter values and try again!`,
          code: "invalidPayload"
        }
      };

      respMessage = {
        http_code: 400, // Bad request
        data: err_msg
      };
    };

    return (respMessage);
  }

  async #getOpenAICallMetadata(req, endpoint) {
    const meta = new Map();
    meta.set('Content-Type', 'application/json');
    let bearerToken = req.headers['Authorization'] || req.headers['authorization'];

    if (bearerToken && !req.authInfo) { // AI App Gateway security is not set
      if (process.env.AZURE_AI_SERVICE_MID_AUTH === "true")
        // Use managed identity of the AI App Gateway host if this env var is set
        bearerToken = await getAccessToken(req, AzureResourceUris.AzureAiFoundryService);

      meta.set('Authorization', bearerToken);
      logger.log({ level: "debug", message: "[%s] %s.#getOpenAICallMetadata(): Using Bearer token for AI Agent Auth.\n  Request ID: %s", splat: [scriptName, this.constructor.name, req.id] });
    }
    else { // Use managed identity of the AI App Gateway host to authenticate (discard Ai app gateway auth token!)
      if (process.env.AZURE_AI_SERVICE_MID_AUTH === "true") {
        bearerToken = await getAccessToken(req, AzureResourceUris.AzureAiFoundryService);
        meta.set('Authorization', bearerToken);
        logger.log({ level: "debug", message: "[%s] %s.#getOpenAICallMetadata(): Using Bearer token for AI Agent Auth.\n  Request ID: %s", splat: [scriptName, this.constructor.name, req.id] });
      }
      else {
        // meta.set('api-key', endpoint.apikey);
        meta.set('Authorization', 'Bearer ' + endpoint.apikey);
        logger.log({ level: "debug", message: "[%s] %s.#getOpenAICallMetadata(): Using API Key for AI Agent Auth.\n  Request ID: %s", splat: [scriptName, this.constructor.name, req.id] });
      };
    };

    return (meta);
  }

  async #listMessagesInThread(
    req,
    meta,
    agentEndpoint) { // 2 - List messages associated with thread

    const threadId = req.params.session_id; // User session (/Thread) ID

    let respMessage;
    let data;
    let err_msg;
    let threadUri = agentEndpoint.uri + '/threads/' + threadId + '/messages?api-version=' + AzureApiVersions.AiAgentService + '&order=asc';

    try {
      // List messages associated with agent thread
      let response = await fetch(
        threadUri, {
        method: HttpMethods.GET,
        headers: meta
      });

      let status = response.status;
      if (status === 200) { // All Ok
        data = await response.json();
        logger.log({ level: "debug", message: "[%s] %s.#listMessagesInThread():\n  Request ID: %s\n  Endpoint ID: %s\n  Target URI: %s\n  Status: %d\n  Thread ID: %s\n  Response:\n  %s", splat: [scriptName, this.constructor.name, req.id, agentEndpoint.id, threadUri, status, threadId, JSON.stringify(data, null, 2)] });

        respMessage = {
          http_code: status, // OK
          data: {
            backendUriIndex: agentEndpoint.id, // ID05082025.n
            messageTrace: data,
            endpointUri: req.originalUrl,
            currentDate: new Date().toLocaleString(),
          }
        };
      }
      else {
        data = await response.text(); // Unauthorized 401 error doesn't return a JSON!
        err_msg = {
          error: {
            target: threadUri,
            message: `listMessagesInThread(): AI Agent Service Thread endpoint returned exception. Status: ${response.status}, Text: ${response.statusText}, Message: ${data}.`,
            code: "serviceError"
          }
        };
        logger.log({ level: "error", message: "[%s] %s.#listMessagesInThread():\n  Request ID: %s\n  Endpoint ID: %s\n  Target URI: %s\n  Status: %s\n  Text: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, agentEndpoint.id, threadUri, status, response.statusText, JSON.stringify(err_msg, null, 2)] });

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
          message: `listMessagesInThread(): AI Application Gateway encountered exception: [${error}].`,
          code: "internalFailure"
        }
      };
      logger.log({ level: "error", message: "[%s] %s.#listMessagesInThread():\n  Request ID: %s\n  Endpoint ID: %s\n  Target URI: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, agentEndpoint.id, threadUri, JSON.stringify(err_msg, null, 2)] });

      respMessage = {
        http_code: 500,
        data: err_msg
      };
    };

    return (respMessage);
  }

  async #getSDServerAgentSessionInfo(req, aiApp) {
    let err_msg;
    let respMessage;

    for (const endpoint of aiApp.endpoints) { // Iterate thru configured endpoints
      const meta = await this.#getOpenAICallMetadata(req, endpoint);
      try {
        // 1. List messages associated with thread
        respMessage = await this.#listMessagesInThread(req, meta, endpoint);
        if (respMessage.http_code !== 200)
          continue;
        else
          break; // Break out of the for loop -
      }
      catch (error) {
        err_msg = {
          error: {
            target: req.originalUrl,
            message: `AI Application Gateway encountered exception: [${error}].`,
            code: "internalFailure"
          }
        };
        logger.log({ level: "error", message: "[%s] %s.#getSDServerAgentSessionInfo(): Encountered exception:\n  %s", splat: [scriptName, this.constructor.name, JSON.stringify(err_msg, null, 2)] });

        respMessage = {
          http_code: 500,
          data: err_msg
        };
      }
    }; // End of app endpoints for loop -

    return (respMessage);
  }

  async handleRequest(request) {
    let response = null;
    let err_msg;

    if (!(process.env.API_GATEWAY_PERSIST_PROMPTS === "true")) {
      err_obj = {
        error: {
          endpointUri: request.originalUrl,
          message: `Prompt persistence is not enabled for this AI App Gateway instance! Unable to process request.`,
          code: "invalidPayload"
        }
      };

      response = {
        http_code: 400, // Bad request
        data: err_msg
      };

      return (response);
    };

    const appId = request.params.app_id; // AI Application ID
    const threadId = request.params.session_id; // User session (/Thread) ID
    logger.log({ level: "info", message: "[%s] %s.handleRequest():\n  Req ID: %s\n  AI Application ID: %s\n  Thread ID: %s", splat: [scriptName, this.constructor.name, request.id, appId, threadId] });

    if (!threadId || !appId) {
      err_obj = {
        error: {
          endpointUri: req.originalUrl,
          message: `AI Application ID [${appId}] and Session ID [${threadId}] are required parameters! Unable to process request.`,
          code: "invalidPayload"
        }
      };

      response = {
        http_code: 400, // Bad request
        data: err_msg
      };

      return (response);
    };

    const appsConfig = request.targeturis; // AI application configurations
    let application = this._getAiApplication(appId, appsConfig);

    if (!application) {
      err_obj = {
        error: {
          target: request.originalUrl,
          message: `AI Application ID [${appId}] not found. Unable to process request.`,
          code: "invalidPayload"
        }
      };

      response = {
        http_code: 400, // Bad request
        data: err_msg
      };

      return (response);
    };

    switch (request.targeturis.serverType) {
      case ServerTypes.SingleDomain:
        switch (application.appType) {
          case AzAiServices.OAI:
            response = await this.#getSDServerModelSessionInfo(request, application);
            break;
          case AzAiServices.AzAiAgent:
            response = await this.#getSDServerAgentSessionInfo(request, application);
            break;
          default:
            err_obj = {
              error: {
                target: request.originalUrl,
                message: `AI Application type [${application.appType}] is not supported.  Unable to process request.`,
                code: "invalidPayload"
              }
            };

            response = {
              http_code: 400, // Bad request
              data: err_msg
            };
        };
        break;
      default:
        err_obj = {
          error: {
            target: request.originalUrl,
            message: `Server type [${request.targeturis.serverType}] is not supported.  Unable to process request.`,
            code: "invalidPayload"
          }
        };

        response = {
          http_code: 400, // Bad request
          data: err_msg
        };
        break;
    };

    return (response);
  }
}

module.exports = SessionDataHandler;