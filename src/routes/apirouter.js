/**
 * Name: AI Application Gateway/Router (Single Agent)
 * Description: An API router that forwards incoming requests to backend intelligent AI Service processors.
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
 * ID04172025: ganrad: v2.3.2: (Enhancement) Retrieve metrics for an AI Application.
 * ID04302025: ganrad: v2.3.2: (Enhancement) Each AI App (Type=oai/ai_inf/ai_agent) endpoint can (optional) have a unique id ~ assistant id
 * ID05082025: ganrad: v2.3.5: (Enhancement) Introduced memory affinity feature.  Enabling this feature ('affinity') in the memory setting for an AI App will
 * result in all requests tied to a given thread/session to be routed to the same backend uri.
 * ID05122025: ganrad: v2.3.6: (Enhancement) Introduced endpoint health policy feature for AOAI and AI Model Inf. API calls. 
 * ID05142025: ganrad: v2.3.8: (Enhancement) Introduced user personalization feature ~ Long term memory.
 * ID06162025: ganrad: v2.3.9: (Enhancement) Introduced endpoint routing types - Priority (default), LRU, LAC, Random weighted and Latency weighted.
 * ID07242025: ganrad: v2.4.0: (Enhancement + Refactored code) Introduced resource handlers for AI Gateway resources. Added support for retrieving
 * sessions (threads) managed by Azure AI Foundry Agent Service.
 * ID07252025: ganrad: v2.4.0: (Refactored code) Moved all AI App Gateway router endpoint literals to the constants module ~ app-gtwy-constants.js.
 * ID08212025: ganrad: v2.4.0: (Enhancement) Updated code to support metrics collection for AI Foundry Service Agents.
 * ID08222025: ganrad: v2.4.0: (Refactored code) Updated endpoint traffic router factory implementation.
 * ID08252025: ganrad: v2.5.0: (Enhancement) Introduced cost tracking (/ budgeting) for models deployed on Azure AI Foundry.
 * ID08292025: ganrad: v2.5.0: (Enhancement) Introduced BudgetAwareRouter implementation.
 * ID09022025: ganrad: v2.5.0: (Enhancement) Introduced AdaptiveBudgetAwareRouter implementation.
 * ID09152025: ganrad: v2.6.0: (Enhancement) Introduced user feedback capture for models/agents deployed on Azure AI Foundry.
 * ID09162025: ganrad: v2.6.0: (Bugfix) Load the cache metrics object for an AI App only when caching is enabled for this app.
 * ID09172025: ganrad: v2.6.0: (Bugfix) Generate unique uri's for indexing endpoint metrics object.
 * ID09172025: ganrad: v2.6.0: Introduced FeedbackWeightedRandomRouter implementation.
 * ID10032025: ganrad: v2.7.0: (Enhancement) Added support for A2A protocol.
 * ID10132025: ganrad: v2.7.0: (Enhancement) An AI Application can be enabled (active) or disabled.  In the disabled state, the AI gateway will
 * not accept inference requests and will return an exception.
 * ID10162025: ganrad: v2.7.0: (Enhancement) Added support for Microsoft Agent Framework URI's.
 * ID10202025: ganrad: v2.8.0: (Enhancement) Updated long term memory feature to support multiple user groups.
 *  
*/

const path = require('path');
const scriptName = path.basename(__filename);

const express = require("express");
const EndpointMetricsFactory = require("../utilities/ep-metrics-factory.js"); // ID04222024.n
const AppConnections = require("../utilities/app-connection.js");
const AppCacheMetrics = require("../utilities/cache-metrics.js"); // ID02202024.n
const {
  DefaultMaxCompletionTokens, // ID10202025.n
  AzAiServices,
  CustomRequestHeaders,
  AppResourceTypes,
  A2AProtocolAttributes, // ID10032025.n
  AiGatewayInboundReqApiType, // ID10032025.n
  OpenAIChatCompletionMsgRoleTypes, // ID10032025.n
  GatewayRouterEndpoints,
  EndpointMiscConstants, // ID09152025.n
  EndpointRouterTypes // ID09172025.n 
} = require("../utilities/app-gtwy-constants.js"); // ID07242025.n, ID07252025.n
const { retrieveUniqueURI, retrievePersonalizationConfig } = require("../utilities/helper-funcs.js"); // ID09172025.n, ID10202025.n
const AiProcessorFactory = require("../processors/ai-processor-factory.js"); // ID04222024.n
const { TrafficRouterFactory } = require("../utilities/endpoint-routers.js"); // ID08222025.n
const ResourceHandlerFactory = require("../handlers/res-handler-factory.js"); // ID07242025.n
const logger = require("../utilities/logger.js"); // ID04272024.n
const { transformOpenAIToA2AResult } = require('../utilities/a2a-helper-funcs.js');
const router = express.Router();

// const { TblNames, PersistDao } = require("../utilities/persist-dao.js"); // ID11042024.n, ID07242025.o
// const persistdb = require("../services/pp-pg.js"); // ID07242025.o

// Total API calls handled by this router instance
// Includes (successApicalls + cachedCalls)
var instanceCalls = 0;

// Failed API calls ~ when all target endpoints are operating at full capacity ~
// max. pressure
var instanceFailedCalls = 0;

// API calls served from cache (vector db)
var cachedCalls = 0; // ID02202024.n

// ID02132024.n - Init the AppConnection instance (Endpoint objects)
let appConnections = new AppConnections();

// ID02202024.n - Init the AppCacheMetrics instance
let cacheMetrics = new AppCacheMetrics();

// ID06162025.n - Init container for app specific endpoint router
let appRouters = new Map();

// ID07242025.n
// Method: GET
// Description: Get Ai App Gateway Instance info. 
// Endpoint: /aigateway/instanceinfo
router.get(GatewayRouterEndpoints.InstanceInfoEndpoint, (req, res) => { // ID07252025.n
  const response =
    new ResourceHandlerFactory().getDataHandler(AppResourceTypes.AiAppServer).
      handleRequest(req);

  res.status(response.http_code).json(response.data);
});

// Method: GET
// Description: Get metrics for Ai App Gateway / Ai Application
// Endpoint: /aigateway/metrics[/app_id]
// Path Parameters:
//   app_id: (Optional) AI Application ID
router.get([GatewayRouterEndpoints.MetricsEndpoint, GatewayRouterEndpoints.MetricsEndpoint + "/:app_id"], (req, res) => { // ID04172025.n, ID07252025.n
  const response =
    new ResourceHandlerFactory().getDataHandler(AppResourceTypes.AiAppGatewayMetrics).
      handleRequest(req, appConnections, cacheMetrics, [instanceCalls, instanceFailedCalls, cachedCalls]);  // ID07242025.n

  res.status(response.http_code).json(response.data);
});

// ID11042024.sn
// Method: GET
// Description: Get Ai App request info.
// Endpoint: /aigateway/requests/app_id/request_id
// Path Parameters:
//   app_id: AI Application ID
//   request_id: A Request ID generated by AI App Gateway
router.get([GatewayRouterEndpoints.RequestsEndpoint + "/:app_id/:request_id"], async (req, res) => { // ID02142025.n, ID07252025.n
  const response = await new ResourceHandlerFactory().getDataHandler(AppResourceTypes.AiAppGatewayRequest).
    handleRequest(req); // ID07242025.n

  res.status(response.http_code).json(response.data);
});
// ID11042024.en

// ID09152025.sn
// Method: PUT
// Description: Update Ai App request with user feedback ~ Thumbs up / down
// Endpoint: /aigateway/requests/app_id/request_id/feedback_id
// Path Parameters:
//   app_id: AI Application ID
//   request_id: A Request ID generated by AI App Gateway
//   feedback_id: Thumbs up (up) or down (down)
router.put([GatewayRouterEndpoints.RequestsEndpoint + "/:app_id/:request_id/:feedback_id"], async (req, res) => {
  const response = await new ResourceHandlerFactory().getDataHandler(AppResourceTypes.AiAppGatewayRequest).
    handleRequest(req);

  if (response.http_code === 200) {
    const appId = req.params.app_id; // AI Application ID (Has been validated!)
    const eps = req.targeturis; // AI application configurations
    const application = (eps.applications) ? eps.applications.find(app => app.appId === appId) : null;

    let endpointIdx;
    let endpointId = response.record.ret_cols.endpoint_id;
    if (endpointId.startsWith(EndpointMiscConstants.IdIndexPrefix))
      endpointIdx = parseInt(endpointId.split('-')[1]);
    else
      endpointIdx = application.endpoints.findIndex((ep) => ep.id === endpointId);

    if (endpointIdx !== -1) { // For a cached response, -1 will be returned as endpoint id value will be '-cached-'. So skip updating in-memory feedback counts!
      const uri = application.endpoints[endpointIdx].uri;
      const epId = application.endpoints[endpointIdx].id ?? ''; // Ensure endpoint id is specified for AI Foundry models!
      const appEpMetricsObj = appConnections.getConnection(appId);
      if (appEpMetricsObj) { // Update the in-memory ep metrics object only if it is loaded!
        const epMetricsObj = appEpMetricsObj.get(retrieveUniqueURI(uri, application.appType, epId));

        if (epMetricsObj) // If empty, don't throw a runtime exception. Exit the server and continue (just in case)...
          epMetricsObj.updateFeedbackCount(response.feedback);
      };

      // Check if endpoint router configured for this AI App is feedback weighted random.  If so, record the feedback with the router
      // so it can adjust routing weights accordingly.
      const epRouter = appRouters.get(appId);
      if (epRouter && (epRouter.routerType === EndpointRouterTypes.FeedbackWeightedRandomRouter))
        epRouter.recordFeedback(epId, response.feedback);
    }
  };
  res.status(response.http_code).json(response.data);
});
// ID09152025.en

// ID02142025.sn
// Method: GET
// Description: Get Ai App session/thread info.
// Endpoint: /aigateway/sessions/app_id/session_id
// Path Parameters:
//   app_id: AI Application ID
//   session_id: Thread/Session ID
router.get([GatewayRouterEndpoints.SessionsEndpoint + "/:app_id/:session_id"], async (req, res) => { // ID07252025.n
  const response = await new ResourceHandlerFactory().getDataHandler(AppResourceTypes.AiAppGatewaySession).
    handleRequest(req); // ID07242025.n

  res.status(response.http_code).json(response.data);
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

// Method: POST
// Description: Intelligent API router / Load Balancer
// Endpoint: /aigateway/lb
// Path Parameters:
//   app_id: AI Application ID
// router.post("/lb/:app_id", async (req, res) => { // ID03192024.o
// router.post(["/lb/:app_id","/lb/:app_id/*"], async (req, res) => { // ID03192024.n, ID04102024.o
router.post(
  [
    GatewayRouterEndpoints.InferenceEndpoint + "/:app_id",
    GatewayRouterEndpoints.InferenceEndpoint + "/openai/deployments/:app_id/*",
    GatewayRouterEndpoints.InferenceEndpoint + "/deployments/:app_id/chat/completions", // ID10162025.n
    GatewayRouterEndpoints.InferenceEndpoint + "/:app_id/*",
    GatewayRouterEndpoints.A2AEndpoint + "/:app_id/invoke" // ID10032025.n
  ], async (req, res) => { // ID04102024.n, ID07252025.n
    const eps = req.targeturis; // AI application configuration
    const cdb = req.cacheconfig; // Global cache configuration
    const appTypes = [AzAiServices.OAI, AzAiServices.AzAiModelInfApi, AzAiServices.AzAiAgent]; // ID11052024.n; ID03242025.n
    const inboundApiType =
      req.originalUrl.includes(GatewayRouterEndpoints.A2AEndpoint) ? AiGatewayInboundReqApiType.Agent2Agent : AiGatewayInboundReqApiType.OpenAI; // ID10032025.n
    req.inboundApiType = inboundApiType; // ID10032025.n
    const a2aReqId = req.body.id || null; // ID10032025.n
    if (a2aReqId) // ID10032025.n
      req.a2aReqId = a2aReqId;

    let err_obj = null;
    let appId = req.params.app_id; // The AI Application ID
    let application = (eps.applications) ? eps.applications.find(app => app.appId === appId) : null;

    // Check if AI Application loaded in app context
    if (!application) {
      err_obj = {
        http_code: 404, // Resource not found!
        data: (inboundApiType === AiGatewayInboundReqApiType.OpenAI) ? { // ID10032025.n
          error: {
            target: req.originalUrl,
            message: `AI Application [ID=${appId}] not found. Unable to process request.`,
            code: "invalidPayload"
          }
        } : {
          jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
          id: a2aReqId,
          error: { code: -32602, message: `AI Agent [ID=${appId}] not found. Unable to process request.` }
        }
      };

      res.status(err_obj.http_code).json(err_obj.data);
      return;
    };

    // ID10132025.sn
    // Check if AI Application is active.  If it's an A2A request, check to see if this ai application is enabled.
    if (!application.isActive  || ((inboundApiType === AiGatewayInboundReqApiType.Agent2Agent) && !application.exposeA2AEndpoint)) {
      err_obj = {
        http_code: 400, // Bad request
        data: (inboundApiType === AiGatewayInboundReqApiType.OpenAI) ? {
          error: {
            target: req.originalUrl,
            message: `AI Application [ID=${appId}] is currently in-active (in disabled state). Unable to process request.`,
            code: "invalidPayload"
          }
        } : {
          jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
          id: a2aReqId,
          error: { code: -32602, message: `AI Agent [ID=${appId}] is currently either in-active (in disabled state) or not available via A2A protocol. Unable to process request.` }
        }
      };

      res.status(err_obj.http_code).json(err_obj.data);
      return;
    };
    // ID10132025.en

    // let r_stream = req.body.stream; ID03242025.o
    // if (r_stream && req.body.prompt) { // no streaming support for Completions API!
    if (req.body.stream && req.body.prompt) { // no streaming support for Completions API!; ID03242025.n
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
    logger.log({ level: "debug", message: "[%s] apirouter():\n  Request ID: %s\n  Payload:\n%s", splat: [scriptName, req.id, JSON.stringify(req.body, null, 2)] }); // ID10032025.n
    req.normalizeOutput = application.normalizeOutput ? true : false; // ID10142025.n

    // ID10032025.sn
    // If A2A inference request, transform request body
    if (inboundApiType === AiGatewayInboundReqApiType.Agent2Agent) {
      const { jsonrpc, method } = req.body;
      let rpcParams = req.body.params;

      if (jsonrpc !== A2AProtocolAttributes.JsonRpcVersion ||
        (method !== A2AProtocolAttributes.MessageSend && method !== A2AProtocolAttributes.MessageStream)) {
        err_obj = {
          http_code: 400, // Bad request
          data: {
            jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
            id: a2aReqId,
            error: { code: -32600, message: 'Invalid Request (must use jsonrpc=2.0, method=message/send or message/stream)' }
          }
        };

        res.status(err_obj.http_code).json(err_obj.data);
        return;
      };

      const { message, configuration } = rpcParams;
      req.a2aMessage = message; // Save the a2a message in the request context
      if (!message || !message.parts) {
        err_obj = {
          http_code: 400, // Bad request
          data: {
            jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
            id: a2aReqId,
            error: { code: -32600, message: 'Invalid Request (message is empty or null)' }
          }
        };

        res.status(err_obj.http_code).json(err_obj.data);
        return;
      };

      // Extract text content from parts
      const textParts = message.parts.filter(part => part.kind === A2AProtocolAttributes.MessagePartKindText).map(part => part.text).join('\n');

      // Extract model parameters from metadata (allows passing LLM params)
      const modelParams = message.metadata?.modelParams ||
      { // default model params
        max_completion_tokens: DefaultMaxCompletionTokens,
        temperature: 0.7,
        stream: false
      };
      if (method === A2AProtocolAttributes.MessageStream) { // Override method params!
        modelParams.stream = true;
        modelParams.stream_options = { include_usage: true };
      }
      else
        modelParams.stream = false;

      // Transform a2a message to OpenAI format
      const openaiMessages = [{ role: OpenAIChatCompletionMsgRoleTypes.UserMessage, content: textParts }];

      // Create OAI model compatible request body structure
      const reqForBackend = {
        threadId: message.contextId || null,
        messages: openaiMessages,
        ...modelParams
      };

      // Update the request body
      req.body = reqForBackend;
    };
    // ID10032025.en

    // Check embedding app and load the endpoint info. (if not already loaded!)
    if (cdb.cacheResults && (!appConnections.getAllConnections().has(cdb.embeddApp))) {
      const embeddApp = (eps.applications) ? eps.applications.find(app => app.appId === cdb.embeddApp) : null;
      if (embeddApp) {

        // ID08252025.sn
        let budgetConfig = null;
        if (embeddApp.budgetSettings?.useBudget && eps.budgetConfig)
          budgetConfig = eps.budgetConfig.find(budget => budget.budgetName === embeddApp.budgetSettings.budgetName);
        // ID08252025.en

        logger.log({ level: "info", message: "[%s] apirouter():\n  AI Application: %s\n  Description: %s\n  App Type: %s", splat: [scriptName, embeddApp.appId, embeddApp.description, embeddApp.appType] });
        let epinfo = new Map();
        let epmetrics = null;
        for (const element of embeddApp.endpoints) {

          // ID08252025.sn
          let modelInfo = null;
          if (budgetConfig && element.budget?.modelName)
            modelInfo = budgetConfig.models.find(model => model.modelName === element.budget.modelName);
          // ID08252025.en

          // epmetrics = new EndpointMetricsFactory().getMetricsObject(embeddApp.appType, element.uri, element.rpm); ID04302025.o
          // epmetrics = new EndpointMetricsFactory().getMetricsObject(embeddApp.appType, element.uri, element.rpm, element.id); // ID04302025.n
          epmetrics = new EndpointMetricsFactory().getMetricsObject(embeddApp.appType, element.uri, element.rpm, element.id, element.healthPolicy, modelInfo); // ID04302025.n, ID05122025.n, ID08252025.n

          epinfo.set(element.uri, epmetrics);
        };
        appConnections.addConnection(embeddApp.appId, epinfo);
      };
    };

    let appModelCostCatalog = null; // ID08292025.n
    // For each AI App, initialize app connection/endpoint info. & associated cache metrics the FIRST time it is accessed (Lazy loading)
    if (!appConnections.getAllConnections().has(appId)) {

      // ID08252025.sn
      let budgetConfig = null;
      if (application.budgetSettings?.useBudget)
        budgetConfig = eps.budgetConfig.find(budget => budget.budgetName === application.budgetSettings.budgetName);
      // ID08252025.en

      logger.log({ level: "info", message: "[%s] apirouter():\n  AI Application: %s\n  Description: %s\n  App Type: %s", splat: [scriptName, appId, application.description, application.appType] });
      let epinfo = new Map();
      let epmetrics = null;
      for (const element of application.endpoints) {

        // ID08252025.sn
        let modelInfo = null;
        if (budgetConfig && element.budget?.modelName) {
          modelInfo = budgetConfig.models.find(model => model.modelName === element.budget.modelName);
          if (element.budget.costBudgets) { // ID08292025.n
            if (!appModelCostCatalog)
              appModelCostCatalog = []; // Init cost catalog array

            appModelCostCatalog.push(modelInfo);
          };

        };
        // ID08252025.en

        // epmetrics = new EndpointMetricsFactory().getMetricsObject(application.appType, element.uri, element.rpm); ID04302025.o
        epmetrics = new EndpointMetricsFactory().getMetricsObject(application.appType, element.uri, element.rpm, element.id, element.healthPolicy, modelInfo); // ID04302025.n, ID05122025.n, ID08252025.n

        /** ID09172025.so
        if (application.appType === AzAiServices.AzAiAgent) // ID08212025.n
          epinfo.set(element.uri + "/" + element.id, epmetrics);
        else
          epinfo.set(element.uri, epmetrics);
        ID09172025.eo */
        epinfo.set(retrieveUniqueURI(element.uri, application.appType, element.id), epmetrics); // ID09172025.n
      };
      appConnections.addConnection(application.appId, epinfo);
      if (cdb.cacheResults && (application.appId !== cdb.embeddApp) && (appTypes.includes(application.appType)))
        if (application.cacheSettings.useCache) // ID09162025.n Init the cacheMetrics obj. only when caching is enabled for this AI App! 
          cacheMetrics.addAiApplication(application.appId);
    };

    instanceCalls++;

    let appConfig = null;
    let memoryConfig = null;
    let userMemConfig = null; // ID05142025.n
    let routerInstance = null; // ID06162025.n
    if (appTypes.includes(application.appType)) {
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

      if (application?.memorySettings?.useMemory) // ID05062024.n
        memoryConfig = {
          affinity: application.memorySettings.affinity, // ID05082025.n
          useMemory: application.memorySettings.useMemory,
          msgCount: application.memorySettings.msgCount
        };

      /**
       * ID05142025.sn - Check if long term memory obj. has to be populated.
       * ID10202025.sn - Updated logic to support LTM for both individual users and groups
       */
      if (req.body.user && application.personalizationSettings?.userMemory) { // ID10202025.n
        userMemConfig = retrievePersonalizationConfig(req.body.user, application.personalizationSettings);
        if ( userMemConfig )
          logger.log({ level: "debug", message: "[%s] apirouter():\n  Request ID: %s\n  LT Memory Config:\n%s", splat: [scriptName, req.id, JSON.stringify(userMemConfig, null, 2)] });
        // Set the uid and gid on the request object
        if (userMemConfig && userMemConfig.user)
          req.user = userMemConfig.user;
        if (userMemConfig && userMemConfig.group)
          req.group = userMemConfig.group;

        if (userMemConfig) {
          const { user, group, ...umemObj } = userMemConfig;

          userMemConfig = {
            searchAlg: umemObj.searchAlg,
            genFollowupMsgs: umemObj.generateFollowupMsgs,
            aiAppName: application.personalizationSettings.userFactsAppName,
            extractRoles: umemObj.extractRoleValues,
            extractionPrompt: umemObj.extractionPrompt,
            followupPrompt: umemObj.followupPrompt
          };
        };
      };
      /** ID10202025.so
      userMemConfig = {
        genFollowupMsgs: application.personalizationSettings.generateFollowupMsgs,
        aiAppName: application.personalizationSettings.userFactsAppName,
        extractRoles: application.personalizationSettings.extractRoleValues,
        extractionPrompt: application.personalizationSettings.extractionPrompt,
        followupPrompt: application.personalizationSettings.followupPrompt
      };
      ID10202025.eo */
      // ID05142025.en

      /**
       * ID06162025.sn - Populate the endpoint router instance
       */
      if (!appRouters.has(appId)) {
        routerInstance = application.endpointRouterType ?
          TrafficRouterFactory.create(
            application.appId,
            application.endpointRouterType,
            application.endpoints,
            application.adaptiveRouterSettings, // ID09022025.n
            appModelCostCatalog) : null; // ID08222025.n, ID08292025.n

        if (routerInstance)
          appRouters.set(appId, routerInstance);  // A single router instance per AI App!
      }
      else
        routerInstance = appRouters.get(appId);
      // ID06162025.en
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
        case AzAiServices.AzAiAgent: // ID07102025.n
          response = await processor.processRequest(
            req,
            res, // ID06052024.n
            appConfig,
            memoryConfig, // ID05062024.n
            appConnections,
            cacheMetrics,
            userMemConfig, // ID05142025.n
            routerInstance // ID06162025.n
          );
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
      const errMsg = `Application type [${appConfig.appType}] is not supported. Review the router configuration for AI Application [${appId}] and specify correct value for "application type".`; // ID10032025.n
      err_obj = {
        error: (inboundApiType === AiGatewayInboundReqApiType.OpenAI) ? {
          target: req.originalUrl,
          message: errMsg,
          code: "notFound"
        } : {
          code: -32600,
          message: errMsg
        }
      };
      // ID06132024.en

      response = {
        http_code: 400,
        data: (inboundApiType === AiGatewayInboundReqApiType.OpenAI) ? err_obj :
          {
            jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
            id: a2aReqId,
            error: err_obj.error
          }
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

    logger.log({ level: "info", message: "[%s] apirouter(): Request ID=[%s] completed.\n  App. ID: %s\n  Backend URI Index: %d\n  HTTP Status: %d", splat: [scriptName, req.id, appId, response.uri_idx ?? -1, response.http_code] });

    // ID06052024.sn, ID06212024.sn
    if (req.body.stream && // All headers have been sent; close/end the connection
      ((response.http_code === 200) || (response.http_code === 500)))
      res.end();
    else { // Non-streaming mode
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

      if (inboundApiType === AiGatewayInboundReqApiType.Agent2Agent) // ID10032025.n
        response = await transformOpenAIToA2AResult(req, response);

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
    appRouters = new Map(); // ID06162025.n; reset the endpoint router instances for all Ai Apps
    // console.log("apirouter(): Application connections and metrics cache has been successfully reset");
    logger.log({ level: "info", message: "[%s] apirouter.reconfigEndpoints(): Application connections and metrics cache have been successfully reset", splat: [scriptName] });
  },
  reinitAppConnection: function (appId) { // ID01292025.n
    if (appConnections.hasConnection(appId)) {
      appConnections.removeConnection(appId);
      appRouters.delete(appId); // ID06162025.n
    };
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