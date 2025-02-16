/**
 * Name: API Gateway/Router (Single Agent)
 * Description: An intelligent stateful API gateway that routes incoming requests to backend 
 * OpenAI deployment resources based on 1) Priority and 2) Availability
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 01-28-2024
 *
 * Notes:
 * ID02132024: ganrad: Use a single data plane to serve Azure OpenAI models for multiple AI applications.
 * ID02202024: ganrad: Introduced semantic caching / retrieval functionality.
 * ID03012024: ganrad: Introduced prompt persistence.
 * ID03192024: ganrad: Added support for LangChain SDK (OpenAI)
 * ID04102024: ganrad: Added support for Azure OpenAI SDK, PromptFlow SDK (Azure AI Studio)
 * ID04112024: ganrad: Save completion (OAI Response) and user in 'apigtwyprompts' table
 * ID04172024: ganrad: Return http status 429 when all backend endpoints are busy (instead of 503 ~ server busy). Azure OAI SDK expects 429 for retries!
 * ID04222024: ganrad: Implemented multiple enhancements:
 * 			- Renamed solution to Azure 'AI Application' API Gateway
 * 			- Router config updates - added appType and description fields to router config
 * 			- Added support for AI Language service APIs
 * 			- Added support for AI Translator service APIs
 * 			- Added support for AI Search service APIs
 * 			- More robust exception handling
 * 			- Re-structured and streamlined code
 * ID04272024: ganrad: Centralized logging with winstonjs
 * ID05032024: ganrad: Added traffic routing support for Azure AI Content Safety service APIs
 * ID05062024: ganrad: Introduced memory (state management) for appType = Azure OpenAI Service
 * ID05282024: ganrad: (Enhancement) Implemented rate limiting feature for appType = Azure OpenAI Service.
 * ID05302024: ganrad: (Bugfix) For CORS requests, the thread ID (x-thread-id) is not set in the response header.
 * ID06042024: ganrad: (Enhancement) Allow SPA's to invoke AOAI OYD calls by specifying AI Search application name instead of AI Search API Key.
 * ID06052024: ganrad: (Enhancement) Added streaming support for Azure OpenAI Chat Completion API call.
 * ID06132024: ganrad: (Enhancement) Adapted gateway error messages to be compliant with AOAI Service error messages.
 * ID06212024: ganrad: (Bugfix) Fixed an issue with returning 400's in stream mode.  Cleaned up the code.
 * ID09032024: ganrad: v2.0.0: (Enhancement) AI Application Gateway name is now included in the configuration file.  Introduced server (agent) type attribute - single / multi
 * ID10232024: ganrad: v2.0.1: (Enhancement) For OYD calls, support system assigned managed identity for authenticating AOAI service with AI search service.
 * ID11042024: ganrad: v2.1.0: (Enhancement) Introduced 'apprequests' end-point.
 * ID11052024: ganrad: v2.1.0: (Enhancement) Added support for LLMs which use Azure AI Model Inference API (Chat completion).
 * ID01292025: ganrad: v2.2.0: (Refactored code) + AI server and app context can now be persisted in a db table (aiappservers) in addition 
 * to a config file.
 * ID02142025: ganrad: v2.2.0: (Enhancement) Introduced 'sessions' end-point to query all requests created in a user session.  Updated
 * 'apprequests' endpoint to 'requests'.
*/

const path = require('path');
const scriptName = path.basename(__filename);

const express = require("express");
const EndpointMetricsFactory = require("../utilities/ep-metrics-factory.js"); // ID04222024.n
const AppConnections = require("../utilities/app-connection.js");
const AppCacheMetrics = require("../utilities/cache-metrics.js"); // ID02202024.n
const { AzAiServices, CustomRequestHeaders } = require("../utilities/app-gtwy-constants.js");
const AiProcessorFactory = require("../processors/ai-processor-factory.js"); // ID04222024.n
const logger = require("../utilities/logger.js"); // ID04272024.n
const router = express.Router();

const { TblNames, PersistDao } = require("../utilities/persist-dao.js"); // ID11042024.n
const persistdb = require("../services/pp-pg.js");

// Total API calls handled by this router instance
// Includes (successApicalls + cachedCalls)
var instanceCalls = 0;

// Failed API calls ~ when all target endpoints are operating at full capacity ~
// max. pressure
var instanceFailedCalls = 0;

// API calls served from cache (vector db)
var cachedCalls = 0; // ID02202024.n

// ID02132024.n - Init the AppConnections instance 
let appConnections = new AppConnections();

// ID02202024.n - Init the AppCacheMetrics instance
let cacheMetrics = new AppCacheMetrics();

// Endpoint: /apirouter/metrics
router.get("/metrics", (req, res) => {
  let conList = [];
  appConnections.getAllConnections().forEach(function (epdata, ky) {
    let priorityIdx = 0;
    let epDict = [];
    epdata.forEach(function (value, key) {
      let dict = {
        endpoint: key,
        priority: priorityIdx,
        metrics: value.toJSON()
      };
      epDict.push(dict);
      priorityIdx++;
    });

    let conObject = {
      applicationId: ky,
      cacheMetrics: cacheMetrics.getCacheMetrics(ky),
      endpointMetrics: epDict
    };
    conList.push(conObject);
  });

  let res_obj = {
    hostName: process.env.API_GATEWAY_HOST,
    listenPort: process.env.API_GATEWAY_PORT,
    // instanceName: process.env.API_GATEWAY_NAME, ID09032024.o
    serverName: req.targeturis.serverId, // ID09032024.n (+ To be consistent with server, changed 'instanceName' to 'serverName')
    serverType: req.targeturis.serverType, // ID09032024.n
    // ID09032024.sn
    containerInfo: {
      imageID: process.env.IMAGE_ID,
      nodeName: process.env.NODE_NAME,
      podName: process.env.POD_NAME,
    },
    // ID09032024.en
    collectionIntervalMins: Number(process.env.API_GATEWAY_METRICS_CINTERVAL),
    historyCount: Number(process.env.API_GATEWAY_METRICS_CHISTORY),
    applicationMetrics: conList,
    successApiCalls: (instanceCalls - instanceFailedCalls) - cachedCalls, // ID04222024.n
    cachedApiCalls: cachedCalls, // ID02202024.n
    failedApiCalls: instanceFailedCalls,
    totalApiCalls: instanceCalls,
    endpointUri: req.originalUrl,
    currentDate: new Date().toLocaleString(),
    serverStatus: "OK"
  };

  res.status(200).json(res_obj);
});

// ID11042024.sn
// Endpoint: /apirouter/requests
router.get(["/requests/:app_id/:request_id"], async (req, res) => { // ID02142025.n
  if ( ! (process.env.API_GATEWAY_PERSIST_PROMPTS === "true") ) {
    err_obj = {
      error: {
        endpointUri: req.originalUrl,
        message: `Prompt persistence is not enabled for this AI App Gateway instance! Unable to process request.`,
        code: "invalidPayload"
      }
    };

    res.status(400).json(err_obj); // 400 = Bad request
    return;
  };

  const appId = req.params.app_id; // AI Application ID
  const requestId = req.params.request_id; // AI App. Request ID
  logger.log({ level: "info", message: "[%s] apirouter():\n  Req ID: %s\n  AI Application ID: %s\n  Request ID: %s", splat: [scriptName, req.id, appId, requestId] });

  if (!requestId || !appId) {
    err_obj = {
      error: {
        endpointUri: req.originalUrl,
        message: `AI Application ID [${appId}] and Request ID [${requestId}] are required parameters! Unable to process request.`,
        code: "invalidPayload"
      }
    };

    res.status(400).json(err_obj); // 400 = Bad request
    return;
  };

  let respMessage;

  let promptsDao = new PersistDao(persistdb, TblNames.Prompts);
  let values = [
    requestId,
    appId
  ];
  const promptTrace = await promptsDao.queryTable(req.id, 1, values)
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

  res.status(respMessage.http_code).json(respMessage.data);
});
// ID11042024.en

// ID02142025.sn
// Endpoint: /apirouter/sessions
router.get(["/sessions/:app_id/:session_id"], async (req, res) => {
  if ( ! (process.env.API_GATEWAY_PERSIST_PROMPTS === "true") ) {
    err_obj = {
      error: {
        endpointUri: req.originalUrl,
        message: `Prompt persistence is not enabled for this AI App Gateway instance! Unable to process request.`,
        code: "invalidPayload"
      }
    };

    res.status(400).json(err_obj); // 400 = Bad request
    return;
  };

  const appId = req.params.app_id; // AI Application ID
  const threadId = req.params.session_id; // User session (/Thread) ID
  logger.log({ level: "info", message: "[%s] apirouter():\n  Req ID: %s\n  AI Application ID: %s\n  Thread ID: %s", splat: [scriptName, req.id, appId, threadId] });

  if (!threadId || !appId) {
    err_obj = {
      error: {
        endpointUri: req.originalUrl,
        message: `AI Application ID [${appId}] and Session ID [${threadId}] are required parameters! Unable to process request.`,
        code: "invalidPayload"
      }
    };

    res.status(400).json(err_obj); // 400 = Bad request
    return;
  };

  let respMessage;

  let promptsDao = new PersistDao(persistdb, TblNames.Prompts);
  let values = [
    appId,
    threadId
  ];
  const sessionTrace = await promptsDao.queryTable(req.id, 2, values)
  if (sessionTrace.rCount >= 1) {
    respMessage = {
      http_code: 200, // OK
      data: {
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

  res.status(respMessage.http_code).json(respMessage.data);
});
// ID02142025.en

// ID06042024.sn
function getAiSearchAppApikey(ctx, appName) {
  let appKey = null;
  for (const application of ctx.applications) {
    if (application.appId === appName) {
      appKey = application.endpoints[0].apikey;
      break;
    };
  };

  return (appKey);
}
// ID06042024.sn

function getAiApplication(appName, ctx) { // ID01292025.n
  let application = null;
  
  for ( const app of ctx.applications ) {
    if ( app.appId === appName ) {
      application = app;
      break;
    }
  };
  
  return(application);
}

// Intelligent API router / Load Balancer
// Endpoint: /apirouter/lb
// router.post("/lb/:app_id", async (req, res) => { // ID03192024.o
// router.post(["/lb/:app_id","/lb/:app_id/*"], async (req, res) => { // ID03192024.n, ID04102024.o
router.post(["/lb/:app_id", "/lb/openai/deployments/:app_id/*", "/lb/:app_id/*"], async (req, res) => { // ID04102024.n
  const eps = req.targeturis; // AI application configuration
  const cdb = req.cacheconfig; // Global cache configuration
  const appTypes = [ AzAiServices.OAI, AzAiServices.AzAiModelInfApi ]; // ID11052024.n

  let err_obj = null;
  let appId = req.params.app_id; // The AI Application ID
  let application = (eps.applications) ? getAiApplication(appId, eps) : null;

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

  // Check embedding app and load the endpoint info. (if not already loaded!)
  if ( cdb.cacheResults && (! appConnections.getAllConnections().has(cdb.embeddApp)) ) {
    const embeddApp = getAiApplication(cdb.embeddApp, eps);
    if ( embeddApp ) {
      logger.log({ level: "info", message: "[%s] apirouter():\n  AI Application: %s\n  Description: %s\n  App Type: %s", splat: [scriptName, embeddApp.appId, embeddApp.description, embeddApp.appType] });
      let epinfo = new Map();
      let epmetrics = null;
      for (const element of embeddApp.endpoints) {
        epmetrics = new EndpointMetricsFactory().getMetricsObject(embeddApp.appType, element.uri, element.rpm);

        epinfo.set(element.uri, epmetrics);
      };
      appConnections.addConnection(embeddApp.appId, epinfo);
    };
  };

  // For each AI App, initialize app connection/endpoint info. & associated metrics
  if (!appConnections.getAllConnections().has(appId)) {
    logger.log({ level: "info", message: "[%s] apirouter():\n  AI Application: %s\n  Description: %s\n  App Type: %s", splat: [scriptName, appId, application.description, application.appType] });
    let epinfo = new Map();
    let epmetrics = null;
    for (const element of application.endpoints) {
      epmetrics = new EndpointMetricsFactory().getMetricsObject(application.appType, element.uri, element.rpm);

      epinfo.set(element.uri, epmetrics);
    };
    appConnections.addConnection(application.appId, epinfo);
    if ( cdb.cacheResults && (application.appId !== cdb.embeddApp) && (appTypes.includes(application.appType)) )
      cacheMetrics.addAiApplication(application.appId);
  };

  let r_stream = req.body.stream;
  if (r_stream && req.body.prompt) { // no streaming support for Completions API!
    /* ID06132024.so
      err_obj = {
      endpointUri: req.originalUrl,
      currentDate: new Date().toLocaleString(),
      errorMessage: "Stream mode is not yet supported! Unable to process request."
    }; ID06132024.eo */
    // ID06132024.sn
    err_obj = {
      error: {
        target: req.originalUrl,
        message: "Stream mode is not yet supported for 'Completions API'! Unable to process request.",
        code: "invalidPayload"
      }
    };
    // ID06132024.en

    res.status(400).json(err_obj); // 400 = Bad request
    return;
  };

  instanceCalls++;

  let appConfig = null;
  let memoryConfig = null;
  if ( appTypes.includes(application.appType) ) {
    if (req.body.data_sources && (req.body.data_sources[0].parameters.authentication.type === "api_key"))
      if (application.searchAiApp === req.body.data_sources[0].parameters.authentication.key)
        req.body.data_sources[0].parameters.authentication.key = getAiSearchAppApikey(eps, application.searchAiApp);
    
    appConfig = {
      appId: application.appId,
      appType: application.appType,
      appEndpoints: application.endpoints,
      useCache: application.cacheSettings.useCache,
      srchType: application.cacheSettings.searchType,
      srchDistance: application.cacheSettings.searchDistance,
      srchContent: application.cacheSettings.searchContent
    };

    if (application?.memorySettings?.useMemory) // ID050620204.n
      memoryConfig = {
        useMemory: application.memorySettings.useMemory,
        msgCount: application.memorySettings.msgCount
      };
  }
  else
    appConfig = {
      appId: application.appId,
      appType: application.appType,
      appEndpoints: application.endpoints
    };

  let response;
  let processor = new AiProcessorFactory().getProcessor(appConfig.appType);
  if (processor) {
    switch (appConfig.appType) {
      case AzAiServices.OAI:
      case AzAiServices.AzAiModelInfApi: // ID11052024.n
        response = await processor.processRequest(
          req,
          res, // ID06052024.n
          appConfig,
          memoryConfig, // ID05062024.n
          appConnections,
          cacheMetrics);
        break;
      case AzAiServices.AiSearch:
      case AzAiServices.Language:
      case AzAiServices.Translator:
      case AzAiServices.ContentSafety:
        response = await processor.processRequest(
          req,
          appConfig,
          appConnections);
        break;
    };
  }
  else {
    /* ID06132024.so
     err_obj = {
       endpointUri: req.originalUrl,
       currentDate: new Date().toLocaleString(),
       errorMessage: `Application type [${appConfig.appType}] is not yet supported. Check the router configuration for AI Application [${appId}].`
    };
    ID06132024.eo */
    // ID06132024.sn
    err_obj = {
      error: {
        target: req.originalUrl,
        message: `Application type [${appConfig.appType}] is incorrect and not supported. Review the router configuration for AI Application [${appId}] and specify correct value for "application type".`,
        code: "notFound"
      }
    };
    // ID06132024.en

    response = {
      http_code: 400,
      data: err_obj
    };
  };

  if (response.cached)
    cachedCalls++;

  if (response.http_code !== 200)
    instanceFailedCalls++;

  /* let res_hdrs = CustomRequestHeaders.RequestId; // ID06212024.so
  if ( response.http_code !== 200 ) {
    instanceFailedCalls++;

    if ( response.http_code === 429 ) {
      res_hdrs += ', retry-after';
      // res.set("Access-Control-Expose-Headers", 'retry-after'); // ID05302024.n
      res.set('retry-after', response.retry_after); // Set the retry-after response header
    };
  }
  else {
    if ( !req.body.stream ) { // ID06052024.n
      if ( response.threadId ) {
  res_hdrs += ', ' + CustomRequestHeaders.ThreadId;
        res.set(CustomRequestHeaders.ThreadId, response.threadId);
      };
      // res.set(CustomRequestHeaders.RequestId, req.id);
    };
  };
  if ( !req.body.stream || response.http_code === 429 ) { // ID06052024.n
    res.set(CustomRequestHeaders.RequestId, req.id);
    res.set("Access-Control-Expose-Headers", res_hdrs);
  }; ID06212024.eo */

  logger.log({ level: "info", message: "[%s] apirouter(): Request ID=[%s] completed.\n  App. ID: %s\n  Backend URI Index: %d\n  HTTP Status: %d", splat: [scriptName, req.id, appId, response.uri_idx, response.http_code] });

  // ID06052024.sn, ID06212024.sn
  if (req.body.stream && // All headers have been sent; close/end the connection
    ((response.http_code === 200) || (response.http_code === 500)))
    res.end();
  else {
    let res_hdrs = CustomRequestHeaders.RequestId;
    res.set(CustomRequestHeaders.RequestId, req.id); // Set the request id header
    if (response.http_code === 429) {
      res_hdrs += ', retry-after';
      res.set('retry-after', response.retry_after); // Set the retry-after response header
    };
    if (response.threadId) {
      res_hdrs += ', ' + CustomRequestHeaders.ThreadId;
      res.set(CustomRequestHeaders.ThreadId, response.threadId); // Set the thread/session id header
    };
    res.set("Access-Control-Expose-Headers", res_hdrs);
    // ID06052024.en
    res.status(response.http_code).json(response.data);
  }; // ID06212024.en
});

module.exports = { // ID01292025.n
  apirouter: router,
  reconfigEndpoints: function () {
    // reset total, cached and failed api calls
    instanceCalls = 0;
    cachedCalls = 0;
    instanceFailedCalls = 0;
  
    appConnections = new AppConnections(); // reset the application connections cache;
    cacheMetrics = new AppCacheMetrics(); // reset the application cache metrics
    // console.log("apirouter(): Application connections and metrics cache has been successfully reset");
    logger.log({ level: "info", message: "[%s] apirouter.reconfigEndpoints(): Application connections and metrics cache have been successfully reset", splat: [scriptName] });
  },
  reinitAppConnection: function (appId) { // ID01292025.n
    if ( appConnections.hasConnection(appId) )
      appConnections.removeConnection(appId);
  }
}

/** ID01292025.o
module.exports.apirouter = router;
module.exports.reconfigEndpoints = function () {
  // reset total, cached and failed api calls
  instanceCalls = 0;
  cachedCalls = 0;
  instanceFailedCalls = 0;

  appConnections = new AppConnections(); // reset the application connections cache;
  cacheMetrics = new AppCacheMetrics(); // reset the application cache metrics
  // console.log("apirouter(): Application connections and metrics cache has been successfully reset");
  logger.log({ level: "info", message: "[%s] apirouter(): Application connections and metrics cache have been successfully reset", splat: [scriptName] });
}
*/