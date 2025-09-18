/**
 * Name: RequestDataHandler
 * Description: This class retrieves data associated with a user request.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 07-24-2025
 * Version (Introduced): 2.4.0
 *
 * Notes:
 * ID09152025: ganrad: v2.6.0: (Enhancement) Introduced user feedback capture for models/agents deployed on Azure AI Foundry.
 * 
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger');

const { TblNames, PersistDao } = require("../utilities/persist-dao.js");
const persistdb = require("../services/pp-pg.js");
const { ServerTypes, HttpMethods, UserFeedback } = require("../utilities/app-gtwy-constants"); // ID09152025.n
const AbstractDataHandler = require("./abstract-data-handler.js");

class RequestDataHandler extends AbstractDataHandler {
  constructor() {
    super();
  }

  #performSingleDomainAppReqChecks(req) { // ID09152925.n
    let respMessage;
    let err_msg;

    if (!(process.env.API_GATEWAY_PERSIST_PROMPTS === "true")) {
      err_obj = {
        error: {
          endpointUri: req.originalUrl,
          message: `Prompt persistence is not enabled for this AI App Gateway instance! Unable to process request.`,
          code: "invalidPayload"
        }
      };

      respMessage = {
        http_code: 400, // Bad request
        data: err_msg
      };

      return (respMessage);
    };

    const appId = req.params.app_id; // AI Application ID
    const requestId = req.params.request_id; // AI App. Request ID
    logger.log({ level: "info", message: "[%s] %s.#performSingleDomainAppReqChecks():\n  Req ID: %s\n  AI Application ID: %s\n  Request ID: %s", splat: [scriptName, this.constructor.name, req.id, appId, requestId] });

    if (!requestId || !appId) {
      err_obj = {
        error: {
          endpointUri: req.originalUrl,
          message: `AI Application ID [${appId}] and Request ID [${requestId}] are required parameters! Unable to process request.`,
          code: "invalidPayload"
        }
      };

      respMessage = {
        http_code: 400, // Bad request
        data: err_msg
      };

      return (respMessage);
    };

    return(null);  // No exceptions!
  }

  async #getSingleDomainAppReqInfo(req) {
    let respMessage = this.#performSingleDomainAppReqChecks(req);
    if ( respMessage )
      return(respMessage);
    let err_msg;

    const appId = req.params.app_id; // AI Application ID
    const requestId = req.params.request_id; // AI App. Request ID

    let promptsDao = new PersistDao(persistdb, TblNames.Prompts);
    let values = [
      req.targeturis.serverId, // ID09152025.n
      requestId,
      appId
    ];

    const promptTrace = await promptsDao.queryTable(req.id, 1, values);
    if (promptTrace.rCount === 1) {
      respMessage = {
        http_code: 200, // OK
        data: {
          messageTrace: promptTrace.data[0],
          endpointUri: req.originalUrl,
          currentDate: new Date().toLocaleString(),
        }
      };
    }
    else {
      err_msg = {
        error: {
          endpointUri: req.originalUrl,
          message: `Request ID=[${requestId}] for AI Application ID=[${appId}] not found.  Please check the parameter values and try again!`,
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

  async #getMultiDomainAppReqInfo(req) {
    let respMessage;
    let err_msg;

    const appId = req.params.app_id; // AI Application ID
    const requestId = req.params.request_id; // AI App. Request ID
    logger.log({ level: "info", message: "[%s] %s.#getMultiDomainAppReqInfo():\n  Req ID: %s\n  AI Application ID: %s\n  Request ID: %s", splat: [scriptName, this.constructor.name, req.id, appId, requestId] });

    if (!requestId || !appId) {
      err_obj = {
        error: {
          target: req.originalUrl,
          message: `AI Application ID [${appId}] and Request ID [${requestId}] are required parameters! Unable to process request.`,
          code: "invalidPayload"
        }
      };

      respMessage = {
        http_code: 400, // Bad request
        data: err_msg
      };

      return (respMessage);
    };

    let appToolsDao = new PersistDao(persistdb, TblNames.ToolsTrace);
    let values = [
      requestId,
      appId
    ];

    const appTrace = await appToolsDao.queryTable(req.id, 1, values);
    if (appTrace.rCount === 1) {
      respMessage = {
        http_code: 200, // OK
        data: {
          toolExecutionPath: appTrace.data[0],
          endpointUri: req.originalUrl,
          currentDate: new Date().toLocaleString(),
        }
      };
    }
    else {
      err_msg = {
        error: {
          target: req.originalUrl,
          message: `Request ID=[${requestId}] for AI Application ID=[${appId}] not found.  Please check the parameter values and try again!`,
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

  async #updateUserFeedback(req) {
    let respMessage = this.#performSingleDomainAppReqChecks(req);
    if ( respMessage )
      return(respMessage);
    let err_msg;

    const appId = req.params.app_id; // AI Application ID
    const requestId = req.params.request_id; // AI App. Request ID
    // Any value other than 'down' sent in the feedback param will be interpreted as a ThumbsUp!
    const feedbackId = [UserFeedback.ThumbsUp, UserFeedback.ThumbsDown].includes(req.params.feedback_id) ? req.params.feedback_id : UserFeedback.ThumbsUp; // User feedback

    let promptsDao = new PersistDao(persistdb, TblNames.Prompts);
    let values = [
      req.targeturis.serverId,
      requestId,
      appId,
      ( feedbackId === UserFeedback.ThumbsUp ) ? 1 : -1
    ];

    const promptTrace = await promptsDao.storeEntity(req.id, 3, values);
    if (promptTrace.record_id > 0) {
      respMessage = {
        http_code: 200, // OK
        record: promptTrace,  // The db record containing the record_id and ret_cols => {id: , endpoint_id: }
        feedback: ( feedbackId === UserFeedback.ThumbsUp ) ? 1 : -1,  // Return this value so that in-memory ep metrics object can be updated
        data: {
          messageTrace: `Updated prompts table record, ID=${promptTrace.record_id} successfully.`,
          endpointUri: req.originalUrl,
          currentDate: new Date().toLocaleString(),
        }
      };
    }
    else {
      err_msg = {
        error: {
          endpointUri: req.originalUrl,
          message: `Request ID=[${requestId}] for AI Application ID=[${appId}] not found.  Please check the parameter values and try again!`,
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

  async handleRequest(request) {
    let response = null;

    switch (request.method) { // ID09152025.n
      case HttpMethods.GET:
        switch (request.targeturis.serverType) {
          case ServerTypes.SingleDomain:
            response = await this.#getSingleDomainAppReqInfo(request);
            break;
          case ServerTypes.MultiDomain:
            response = await this.#getMultiDomainAppReqInfo(request);
            break;
        };
        break;
      case HttpMethods.PUT: // ID09152025.n
        response = await this.#updateUserFeedback(request);
        break;
    };

    return (response);
  }
}

module.exports = RequestDataHandler;