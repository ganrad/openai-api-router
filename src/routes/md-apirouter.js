/**
 * Name: Multi Domain API Gateway/Router (Multiple Distributed Agents Architecture)
 * Description: An intelligent API gateway that orchestrates the execution of multiple 
 * single domain AI applications (/tools) while supporting a highly scalable distributed
 * architecture.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 09-04-2024
 * Version: v2.1.0
 *
 * Notes:
 * ID02092025: ganrad: v2.2.0:  Lazy load AI Apps into MD metrics container.
 * ID02142025: ganrad: v2.2.0: (Enhancement) Updated 'apprequests' endpoint to 'requests'.
*/

const path = require('path');
const scriptName = path.basename(__filename);

const express = require("express");
// const AiAppsContainer = require("../utilities/ai-apps-container.js");
const { CustomRequestHeaders, AiWorkflowEngines } = require("../utilities/app-gtwy-constants.js");
const AiProcessorFactory = require("../processors/ai-processor-factory.js");
const { TblNames, PersistDao } = require("../utilities/persist-dao.js");
const persistdb = require("../services/pp-pg.js");

const logger = require("../utilities/logger.js");
const { AiAppMetricsContainer } = require('../utilities/ai-app-metrics.js');

const router = express.Router();

// Total API calls handled by this router instance
var instanceCalls = 0;

// Failed API calls
var instanceFailedCalls = 0;

// Init AI Applications container
// let aiApps = new AiAppsContainer();

// Init Ai App Metrics Container
let metricsContainer = new AiAppMetricsContainer();

// Endpoint: /apirouter/metrics
router.get("/metrics", (req, res) => { // Endpoint: /apirouter/metrics
  let appCtx = req.targeturis;
  let appList = [];

  for (const application of appCtx.applications) {
    const appDetails = {
      appId: application.appId,
      description: application.description,
      metrics: metricsContainer.getAiAppMetrics(application.appId)
    }
    appList.push(appDetails);
  };

  let res_obj = {
    hostName: process.env.API_GATEWAY_HOST,
    listenPort: process.env.API_GATEWAY_PORT,
    serverName: appCtx.serverId,
    serverType: appCtx.serverType,
    containerInfo: {
      imageID: process.env.IMAGE_ID,
      nodeName: process.env.NODE_NAME,
      podName: process.env.POD_NAME,
    },
    applicationMetrics: appList,
    successApiCalls: instanceCalls,
    failedApiCalls: instanceFailedCalls,
    totalApiCalls: instanceCalls + instanceFailedCalls,
    endpointUri: req.originalUrl,
    currentDate: new Date().toLocaleString(),
    status: "OK"
  };

  res.status(200).json(res_obj);
});

// Endpoint: /apirouter/requests
router.get(["/requests/:app_id/:request_id"], async (req, res) => { // ID02142025.n
  const appId = req.params.app_id; // AI Application ID
  const requestId = req.params.request_id; // AI App. Request ID
  logger.log({ level: "info", message: "[%s] md-apirouter():\n  Req ID: %s\n  AI Application ID: %s\n  Request ID: %s", splat: [scriptName, req.id, appId, requestId] });

  if (!requestId || !appId) {
    err_obj = {
      error: {
        target: req.originalUrl,
        message: `AI Application ID [${appId}] and Request ID [${requestId}] are required parameters! Unable to process request.`,
        code: "invalidPayload"
      }
    };

    res.status(400).json(err_obj); // 400 = Bad request
    return;
  };

  let respMessage;

  let appToolsDao = new PersistDao(persistdb, TblNames.ToolsTrace);
  let values = [
    requestId,
    appId
  ];
  const appTrace = await appToolsDao.queryTable(req.id, 1, values)
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

  res.status(respMessage.http_code).json(respMessage.data);
});

function getAiApplication(appName, ctx) { // ID02092025.n
  let application = null;
  
  for ( const app of ctx.applications ) {
    if ( app.appId === appName ) {
      application = app;
      break;
    }
  };
  
  return(application);
}

// API Router / Load Balancer endpoint
// Endpoint: /apirouter/lb
router.post(["/lb/:app_id", "/lb/openai/deployments/:app_id/*", "/lb/:app_id/*"], async (req, res) => {
  const ctx = req.targeturis; // Set the context object

  let err_obj = null;
  let appId = req.params.app_id; // The AI Application ID
  let application = (ctx.applications) ? getAiApplication(appId, ctx) : null; // ID02092025.n

  // Check if AI Application loaded in app context
  if ( !application ) {
    err_obj = {
      http_code: 404, // Resource not found!
      data: {
        error: {
          target: req.originalUrl,
          message: `AI Application ID [${appId}] not found. Unable to process request.`,
          code: "invalidPayload"
        }
      }
    };

    res.status(err_obj.http_code).json(err_obj.data);
    return;
  };
  
  // if ( !aiApps.getAllApplications().get(appId) ) {  // lazy load AI Application into in-memory container ID02092025.n
  if ( !metricsContainer.getAiAppMetrics(appId) ) { // lazy load AI Application into in-memory container ID02092025.n
    logger.log({ level: "info", message: "[%s] md-apirouter():\n  AI Application: %s\n  Description: %s\n  Message: Initialized metrics", splat: [scriptName, application.appId, application.description] });

    // aiApps.addApplication(application.appId, application);
    metricsContainer.addAiApplication(application.appId);
  };

  let engine = new AiProcessorFactory().getProcessor(AiWorkflowEngines.SeqAiEngine);
  let response = await engine.processRequest(req, application, metricsContainer.getAiAppMetrics(appId));

  let res_hdrs = CustomRequestHeaders.RequestId;
  res.set(CustomRequestHeaders.RequestId, req.id); // Set the request id header
  if (response.threadId) {
    res_hdrs += ', ' + CustomRequestHeaders.ThreadId;
    res.set(CustomRequestHeaders.ThreadId, response.threadId); // Set the thread/session id header
  };
  res.set("Access-Control-Expose-Headers", res_hdrs);

  if (response.http_code !== 200)
    instanceFailedCalls++;
  else {
    instanceCalls++;
  };

  logger.log({ level: "info", message: "[%s] md-apirouter(): Request ID=[%s] completed.\n  App. ID: %s\n  HTTP Status: %d", splat: [scriptName, req.id, appId, response.http_code] });

  res.status(response.http_code).json(response.data);
});

module.exports = { // ID02092025.n
  mdapirouter: router,
  reconfigAppMetrics: function (appName) {
    // reset total and failed api calls
    instanceCalls = 0;
    instanceFailedCalls = 0;
  
    if ( !appName )
      // Reset Ai App Metrics Container
      metricsContainer = new AiAppMetricsContainer();
    else // Reset metrics for Ai App
      metricsContainer.deleteAiAppMetrics(appName);
  
    logger.log({ level: "info", message: "[%s] md-apirouter.reconfigAppMetrics(): AI Application metrics data has been successfully reset", splat: [scriptName] });
  }
}

/** ID02092025.o
module.exports.mdapirouter = router;
module.exports.reconfigApps = function () {
  // reset total and failed api calls
  instanceCalls = 0;
  instanceFailedCalls = 0;

  // Reset AI Applications container
  // aiApps = new AiAppsContainer();

  // Reset Ai App Metrics Container
  metricsContainer = new AiAppMetricsContainer();

  logger.log({ level: "info", message: "[%s] md-apirouter(): Active threads, AI Applications and associated metrics data have been successfully reset", splat: [scriptName] });
}
*/