/**
 * Name: AI Application Gateway/Router
 * Description: A light-weight intelligent AI Application Gateway / Server
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 01-26-2024
 *
 * Notes:
 * ID02082024: ganrad: Added support for capturing gateway metrics using Azure Monitor OpenTelemetry.
 * ID02132024: ganrad: Provide a single data plane for multiple AI applications.
 * ID02202024: ganrad: Introduced semantic caching / retrieval functionality.
 * ID03012024: ganrad: Introduced prompt persistence.
 * ID04272024: ganrad: 90% server logging moved to winstonjs.
 * ID04302024: ganrad: (Bugfix) Each time 'reconfig' endpoint is invoked, a new cron scheduler is started. There should only
 * be one cache invalidator running per gateway/router instance.
 * ID05062024: ganrad: Introduced memory (state management) for appType = Azure OpenAI Service.
 * ID05222024: ganrad: Enabled CORS
 * ID06092024: ganrad: Refactored code
 * ID06282024: ganrad: Check db connection status every 60 minutes and return result when '/healthz' endpoint is invoked. 
 * ID07292024: ganrad: Gateway REST APIs can be secured using Microsoft Entra ID.  This is an optional feature.
 * ID09032024: ganrad: AI Application Gateway name is now specified in the configuration file.  Introduced server (agent) domain type 
 * attribute - single-domain / multi-domain
 * ID09042024: ganrad: v2.1.0: Introduced multi domain AI App Engine (Distributed server).  Restructured code.
 * ID09202024: ganrad: v2.1.0: Introduced JSON configuration file schema validation.
 * ID11052024: rashedtalukder: v2.1.0: Renamed Azure App Insights env variable.
 * ID11112024: ganrad: v2.1.0: (Bugfix) After re-configuring the server, the cache and memory invalidation schedulers were still using 
 * the old app config. memory and state eviction intervals!
 * ID11112024: ganrad: v2.1.0: (Enhancement) Introduced instanceName (server ID + '-' + Pod Name).  Instance name will be stored along with cache, memory, prompt & 
 * tool trace records. This will allow cache and memory invalidators associated with an instance to only operate on records created by self. 
 * Users can also easily identify which server instance served a request.  This feature is important when multiple server instances are deployed
 * on a container platform ~ Kubernetes.
 * ID11152024: ganrad: v2.1.0: (Cleanup) Updated 'endpoint' variable (uri) to point to '/../apirouter'.  Introduced separate var for 
 * API version 'apiVersion'.
 * ID12192024: ganrad: v2.1.0: Introduced function to capture termination signal(s).  Use this function to perform cleanup tasks prior to
 * exiting the server (Terminate gracefully).
 * ID01212025: ganrad: v2.1.0: AI Gateway can only be reconfigured when run in single process/instance standalone mode. 
 * ID01312025: ganrad: v2.1.1: (Bugfix) Rolled back update introduced in ID11052024. This env variable (name) is defined by Azure Monitor OpenTelemetry library.
 * Also, Azure Monitor initialization code has been moved to global space.  This fixes the telemetry ingestion issue.
*/

// ID04272024.sn
const path = require('path');
const scriptName = path.basename(__filename);
const wlogger = require('./utilities/logger.js');

wlogger.log({ level: "info", message: "[%s] Starting initialization of AI Application Gateway ...", splat: [scriptName] });
// ID04272024.en

// ID02082024.sn: Configure Azure Monitor OpenTelemetry for instrumenting API gateway requests.
const { useAzureMonitor } = require("@azure/monitor-opentelemetry");
// ID02082024.en

let azAppInsightsConString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING; // ID01312025.n, ID11052024.o
// let azAppInsightsConString = process.env.APPLICATION_INSIGHTS_CONNECTION_STRING; // ID01312025.o, ID11052024.n
// ID01312025.sn
if (azAppInsightsConString) {
  useAzureMonitor();
  wlogger.log({ level: "info", message: "[%s] Azure Application Monitor OpenTelemetry configured.", splat: [scriptName] });
}
else
  wlogger.log({ level: "info", message: "[%s] Azure Application Insights 'Connection string' not found. No telemetry data will be sent to App Insights.", splat: [scriptName] });
// ID01312025.en

const fs = require("fs");
const express = require("express");
const cors = require("cors"); // ID05222024.n
const { ServerDefaults, CustomRequestHeaders, SchedulerTypes, AzAiServices, ServerTypes } = require("./utilities/app-gtwy-constants");
const { apirouter, reconfigEndpoints } = require("./routes/apirouter"); // Single domain AI App Gateway
const { mdapirouter, reconfigApps } = require("./routes/md-apirouter"); // ID09042024.n; Multi domain distributed AI App Engine
const pgdb = require("./services/cp-pg.js");
const CacheConfig = require("./utilities/cache-config");
// const runCacheInvalidator = require("./utilities/cache-invalidator"); ID05062024.o
const SchedulerFactory = require("./utilities/scheduler-factory"); // ID05062024.n
const sFactory = new SchedulerFactory(); // ID05062024.n

const initAuth = require("./auth/bootstrap-auth"); // ID07292024.n
const { validateSchema } = require("./schemas/validate-config"); // ID09202024.n

const app = express();
var bodyParser = require('body-parser');
// var morgan = require('morgan');

// Server version v2.1.0 ~ ID11142024.n
const srvVersion = "2.1.0";
// AI Application Gateway API version - ID11152024.n
const apiVersion = "/api/v1/";
// Server start date
const srvStartDate = new Date().toLocaleString();

// Init. random uuid generator
const { randomUUID } = require('node:crypto');

// Configure pinojs logger - logs http request/response only
const logger = require('pino-http')({
  // Define a custom request id function
  genReqId: function (req, res) {
    const existingID = req.id ?? req.headers[CustomRequestHeaders.RequestId];
    if (existingID) return existingID;
    const id = randomUUID();
    res.setHeader(CustomRequestHeaders.RequestId, id);

    return id;
  },
  useLevel: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

// ID06282024.sn
let dbConnectionStatus = 1;
let dbCheckTime = srvStartDate;
async function checkDbConnectionStatus() {
  dbConnectionStatus = await pgdb.checkDbConnection();

  if ( !dbConnectionStatus ) {
    wlogger.log({ level: "error", message: "[%s] Could not connect to PostgreSQL DB. Aborting server ...", splat: [scriptName] });
    process.exit(1);
  };

  setInterval(async function () {
    dbConnectionStatus = await pgdb.checkDbConnection();
    dbCheckTime = new Date().toLocaleString();
  }, 60 * 60000); // Check DB connection once every 60 minutes
}
// ID06282024.en

var host; // API Gateway host
var port; // API Gateway listen port
var endpoint; // API Gateway base URI - /api/v1/{env}/apirouter ID11152024.n
var pkey; // API Gateway private key (used for reconfiguring endpoints)
// ID02202024.sn
function readApiGatewayEnvVars() {
  if (process.env.API_GATEWAY_HOST)
    host = process.env.API_GATEWAY_HOST;
  else
    host = "localhost";

  if (process.env.API_GATEWAY_PORT)
    port = Number(process.env.API_GATEWAY_PORT);
  else
    port = 8000;

  if (process.env.API_GATEWAY_ENV)
    // endpoint = "/api/v1/" + process.env.API_GATEWAY_ENV; ID11152024.o
    endpoint = apiVersion + process.env.API_GATEWAY_ENV + "/apirouter"; // ID11152024.n
  else {
    wlogger.log({ level: "error", message: "[%s] Env. variable [API_GATEWAY_ENV] not set, aborting ...", splat: [scriptName] });
    // exit program
    process.exit(1);
  };

  if (process.env.API_GATEWAY_KEY)
    pkey = process.env.API_GATEWAY_KEY;
  else {
    wlogger.log({ level: "error", message: "[%s] Env. variable [API_GATEWAY_KEY] not set, aborting ...", splat: [scriptName] });
    // exit program
    process.exit(1);
  };

  let persistPrompts = process.env.API_GATEWAY_PERSIST_PROMPTS; // ID03012024.n
  let cacheResults = process.env.API_GATEWAY_USE_CACHE;
  let manageState = process.env.API_GATEWAY_STATE_MGMT;
  if ((cacheResults === "true") || (persistPrompts === "true") || (manageState === "true")) {
    // let retval = await pgdb.checkDbConnection(); // ID06282024.o
    checkDbConnectionStatus(); // ID06282024.n
    if (cacheResults === "true")
      wlogger.log({ level: "info", message: "[%s] Completions will be cached", splat: [scriptName] });
    else
      wlogger.log({ level: "info", message: "[%s] Completions will not be cached", splat: [scriptName] });

    if (persistPrompts === "true")
      wlogger.log({ level: "info", message: "[%s] Prompts will be persisted", splat: [scriptName] });
    else
      wlogger.log({ level: "info", message: "[%s] Prompts will not be persisted", splat: [scriptName] });

    if (manageState === "true")
      wlogger.log({ level: "info", message: "[%s] Conversational state will be managed", splat: [scriptName] });
    else
      wlogger.log({ level: "info", message: "[%s] Conversational state will not be managed", splat: [scriptName] });
  };
}

var context; // AI Applications Context
var cacheConfig;
let cacheInvalidator = null; // ID11112024.n ~ Cache entry invalidator instance
let memoryInvalidator = null; // ID11112024.n ~ Memory entry evictor instance
function readApiGatewayConfigFile(reconfig) { // ID09042024.n - Restructured this function. Made this function sync!; ID11112024.n; ID01212025.n
  let vectorAppFound = false;

  let cacheResults = process.env.API_GATEWAY_USE_CACHE;
  if (cacheResults === "true") {
    let embeddApp;
    if (process.env.API_GATEWAY_VECTOR_AIAPP)
      embeddApp = process.env.API_GATEWAY_VECTOR_AIAPP;
    else {
      // console.log("Server(): AI Embedding Application cannot be empty! Aborting server initialization.");
      wlogger.log({ level: "error", message: "[%s] Env. variable for AI Embedding Application [API_GATEWAY_VECTOR_AIAPP] not set, aborting ...", splat: [scriptName] });
      process.exit(1);
    };

    let srchEngine = process.env.API_GATEWAY_SRCH_ENGINE ?? "Postgresql/pgvector";

    cacheConfig = new CacheConfig(true, embeddApp, srchEngine);
  }
  else
    cacheConfig = new CacheConfig(false, null, null);

  if (!process.env.API_GATEWAY_CONFIG_FILE) {
    wlogger.log({ level: "error", message: "[%s] Env. variable [API_GATEWAY_CONFIG_FILE] not set, aborting ...", splat: [scriptName] });
    // exit program
    process.exit(1);
  };

  try {
    let data = fs.readFileSync(process.env.API_GATEWAY_CONFIG_FILE, { encoding: 'utf8', flag: 'r' });
    // context = JSON.parse(data); ID01212025.o
    let ctx = JSON.parse(data); // ID01212025.n
    // ID09202024.sn
    // if (!validateSchema(context)) { ID01212025.o
    if (!validateSchema(ctx)) { // ID01212025.n
      wlogger.log({ level: "error", message: "[%s] Error parsing AI Application Gateway configuration file, aborting ...", splat: [scriptName] });

      if ( reconfig ) // ID01212025.n
        return(false);
      else
        process.exit(1);
    };
    context = ctx; // ID01212025.n; Set global context variable!
    // ID09202024.en

    if (context.serverType === ServerTypes.SingleDomain) { // ID09042024.n
      // console.log("Server(): AI Application backend (Azure OpenAI Service) endpoints:");
      wlogger.log({ level: "info", message: "[%s] Listing AI Application backend (Azure AI Service) endpoints:", splat: [scriptName] });
      context.applications.forEach((app) => {
        let pidx = 0;
        if ((app.appType === AzAiServices.OAI) || (app.appType === AzAiServices.AzAiModelInfApi))
          console.log(`Application ID: ${app.appId}; Type: ${app.appType}; useCache=${app?.cacheSettings?.useCache ?? false}; useMemory=${app?.memorySettings?.useMemory ?? false}`);
        else
          console.log(`Application ID: ${app.appId}; Type: ${app.appType}`);

        if ((cacheConfig.cacheResults) && (app.appId === cacheConfig.embeddApp))
          vectorAppFound = true;

        app.endpoints.forEach((element) => {
          console.log(`  Priority: ${pidx}\tUri: ${element.uri}`);
          pidx++;
        });
      });
      // console.log("Server(): Loaded backend Azure OpenAI API endpoints for applications");
      wlogger.log({ level: "info", message: "[%s] Successfully loaded backend API endpoints for AI applications", splat: [scriptName] });
    }
    else if (context.serverType === ServerTypes.MultiDomain) {
      if ( ! reconfig ) // ID01212025.n (Start the db connection check thread only on init!)
        checkDbConnectionStatus(); // AI Apps can enable tool tracing; Check DB status

      const aiGatewayUri = context.aiGatewayUri;
      wlogger.log({ level: "info", message: "[%s] Listing AI Applications:", splat: [scriptName] });
      context.applications.forEach((app) => {
        console.log(`--------\nApplication ID: ${app.appId}\nDescription: ${app.description}`);

        app.appTools.forEach((element) => {
          console.log(`----\n  Tool Name: ${element.toolName}\n  Type: ${element.toolType}\n  URI: ${element.targetUri ? element.targetUri : aiGatewayUri}\n  AI App Name: ${element.appName}`);
        });
      });
      console.log("--------");
    }
    else {
      wlogger.log({ level: "error", message: "[%s] Unsupported Server Type [%s] specified in configuration file.  Supported server types are - %s & %s, aborting ...", splat: [scriptName, context.serverType, ServerTypes.SingleDomain, ServerTypes.MultiDomain] });
      // exit program
      process.exit(1);
    };

    if (cacheConfig.cacheResults && !vectorAppFound) {
      // console.log(`Server(): AI Embedding Application [${cacheConfig.embeddApp}] not defined in API Gateway Configuration file! Aborting server initialization.`); 
      wlogger.log({ level: "error", message: "[%s] AI Embedding Application [%s] not defined in AI Services Gateway Configuration file! Aborting server initialization.", splat: [scriptName, cacheConfig.embeddApp] });

      process.exit(1);
    };

    // if (cacheConfig.cacheResults && startScheduler) { ID11112024.o
    if (cacheConfig.cacheResults) { // ID11112024.n
      if ( ! cacheInvalidator ) { // ID11112024.n
        // Start the cache entry invalidator cron job and set it's run schedule
        let schedule = process.env.API_GATEWAY_CACHE_INVAL_SCHEDULE;
        if (!schedule) // schedule is empty, undefined, null
          schedule = ServerDefaults.CacheEntryInvalidateSchedule;
        // console.log(`Server(): Cache invalidator run schedule (Cron) - ${schedule}`);
        wlogger.log({ level: "info", message: "[%s] Cache entry invalidate run schedule (Cron) - %s", splat: [scriptName, schedule] });

        // await runCacheInvalidator(schedule, context); ID05062024.o
        // sFactory.getScheduler(SchedulerTypes.InvalidateCacheEntry).runSchedule(schedule, context); // ID05062024.n, ID11112024.o
        cacheInvalidator = sFactory.getScheduler(SchedulerTypes.InvalidateCacheEntry); // ID11112024.n
        cacheInvalidator.runSchedule(schedule,context);
      }
      else // ID11112024.n
        // Replace the context if scheduler is already running!
        cacheInvalidator.replaceContext(context);
    };

    // ID05062024.sn
    let manageState = (process.env.API_GATEWAY_STATE_MGMT === 'true') ? true : false
    // if (manageState && startScheduler) { ID11112024.o
    if ( manageState ) { // ID11112024.n
      if ( ! memoryInvalidator ) {
        // Start the memory state invalidator cron job and set it's run schedule
        let schedule = process.env.API_GATEWAY_MEMORY_INVAL_SCHEDULE;
        if (!schedule) // schedule is empty, undefined, null
          schedule = ServerDefaults.MemoryInvalidateSchedule;

        wlogger.log({ level: "info", message: "[%s] Memory (State) invalidate run schedule (Cron) - %s", splat: [scriptName, schedule] });

        // sFactory.getScheduler(SchedulerTypes.ManageMemory).runSchedule(schedule, context); // ID05062024.n, ID11112024.o
        memoryInvalidator = sFactory.getScheduler(SchedulerTypes.ManageMemory); // ID11112024.n
        memoryInvalidator.runSchedule(schedule,context);
      }
      else // ID11112024.n
        // Replace the context if scheduler is already running!
        memoryInvalidator.replaceContext(context);
    }
  }
  catch (error) {
    wlogger.log({ level: "error", message: "[%s] Error loading gateway config file. Error=%s", splat: [scriptName, error] });
    // exit program
    if ( reconfig ) // ID01212025.n
      return(false);
    else
      process.exit(1);
  };

  return(true); // ID01212025.n
};
// readApiGatewayConfigFile(); // ID04302024.o

// ID12192024.sn
function configureSignals() {
  process.on('SIGINT', () => {
    // Perform cleanup tasks

    console.log(`Server(): Received [SIGINT] signal. Azure AI Application Gateway [${context.serverId}] shutting down ...`);
    process.exit();
  });

  process.on('SIGTERM', () => {
    // Perform cleanup tasks

    console.log(`Server(): Received [SIGTERM] signal. Azure AI Application Gateway [${context.serverId}] shutting down ...`);
    process.exit();
  })
}
// ID12192024.en

// ID06092024.sn
function initServer() {
  readApiGatewayEnvVars();
  readApiGatewayConfigFile(false); // ID01212025.n
  configureSignals(); // ID12192024.n
}
initServer();// Initialize the server
// ID06092024.en

app.use(cors()); // ID05222024.n

// app.use(morgan(log_mode ? log_mode : 'combined'));
app.use(bodyParser.json());

// ID07292024.sn
// Generate request id prior to invoking router middleware (endpoints)
// app.use(endpoint + "/apirouter", (req, res, next) => { ID11152024.o
app.use(endpoint, (req, res, next) => { // ID11152024.n
  logger(req, res);
  next();
});

function initializeAuth() {
  let secureApis = process.env.API_GATEWAY_AUTH;
  if (secureApis === "true")
    // initAuth(app, endpoint + "/apirouter"); // ID11152024.o
    initAuth(app, endpoint); // ID11152024.n
  else
    wlogger.log({ level: "warn", message: "[%s] API Gateway endpoints are not secured by Microsoft Entra ID!", splat: [scriptName] });
}
initializeAuth(); // Initialize OAuth flow
// ID07292024.en

// ID09042024.sn
function getSingleDomainAgentMetadata(req) {
  let appcons = [];
  context.applications.forEach((aiapp) => {
    let epIdx = 0; // Priority index
    let eps = new Map();
    aiapp.endpoints.forEach((element) => {
      let ep = {
        rpm: element.rpm,
        uri: element.uri
      };
      eps.set(epIdx, ep);
      epIdx++;
    });

    let appeps = new Map();
    appeps.set("applicationId", aiapp.appId);
    appeps.set("description", aiapp.description);
    appeps.set("type", aiapp.appType);
    if (aiapp.searchAiApp)
      appeps.set("searchAiApp", aiapp.searchAiApp);
    appeps.set("cacheSettings", {
      useCache: aiapp.cacheSettings.useCache,
      searchType: aiapp.cacheSettings.searchType,
      searchDistance: aiapp.cacheSettings.searchDistance,
      searchContent: aiapp.cacheSettings.searchContent,
      entryExpiry: aiapp.cacheSettings.entryExpiry
    });
    // ID05062024.sn
    if (aiapp.memorySettings)
      appeps.set("memorySettings", {
        useMemory: aiapp.memorySettings.useMemory,
        msgCount: aiapp.memorySettings.msgCount,
        entryExpiry: aiapp.memorySettings.entryExpiry
      });
    // ID05062024.en
    appeps.set("endpoints", Object.fromEntries(eps));
    appcons.push(Object.fromEntries(appeps));
  });

  let resp_obj = {
    // serverName: process.env.API_GATEWAY_NAME, ID09032024.o
    serverName: context.serverId, // ID09032024.n
    serverType: context.serverType, // ID09032024.n
    serverVersion: srvVersion,
    serverConfig: {
      host: host,
      listenPort: port,
      environment: process.env.API_GATEWAY_ENV,
      persistPrompts: process.env.API_GATEWAY_PERSIST_PROMPTS,
      collectInterval: Number(process.env.API_GATEWAY_METRICS_CINTERVAL),
      collectHistoryCount: Number(process.env.API_GATEWAY_METRICS_CHISTORY),
      configFile: process.env.API_GATEWAY_CONFIG_FILE
    },
    cacheSettings: {
      cacheEnabled: cacheConfig.cacheResults,
      embeddAiApp: cacheConfig.embeddApp,
      searchEngine: cacheConfig.srchEngine,
      cacheInvalidationSchedule: process.env.API_GATEWAY_CACHE_INVAL_SCHEDULE,
    },
    memorySettings: {
      memoryEnabled: process.env.API_GATEWAY_STATE_MGMT,
      memoryInvalidationSchedule: process.env.API_GATEWAY_MEMORY_INVAL_SCHEDULE
    },
    aiApplications: appcons,
    containerInfo: {
      imageID: process.env.IMAGE_ID,
      nodeName: process.env.NODE_NAME,
      podName: process.env.POD_NAME,
      podNamespace: process.env.POD_NAMESPACE,
      podServiceAccount: process.env.POD_SVC_ACCOUNT
    },
    // nodejs: process.versions,
    // aiAppGatewayUri: endpoint + "/apirouter", ID11152024.o
    aiAppGatewayUri: endpoint, // ID11152024.n
    endpointUri: req.url,
    serverStartDate: srvStartDate,
    status: "OK"
  };

  return (resp_obj);
}

function getMultiDomainAgentMetadata(req) {
  let apps = [];
  context.applications.forEach((aiapp) => {
    let appcont = new Map();
    appcont.set("applicationId", aiapp.appId);
    appcont.set("description", aiapp.description);
    appcont.set("enableToolTrace", aiapp.enableToolTrace);

    let tools = [];
    aiapp.appTools.forEach((tool) => {
      let tooldef = new Map();
      tooldef.set("toolName", tool.toolName);
      tooldef.set("description", tool.description);
      tooldef.set("toolType", tool.toolType);
      tooldef.set("targetUri", tool.targetUri);
      tooldef.set("aiApplicationName", tool.appName);
      tooldef.set("statefulAiApp", tool.stateful);
      tooldef.set("condition", tool.condition);
      tooldef.set("payloadToolId", tool.payloadToolId);

      tools.push(Object.fromEntries(tooldef));
    });
    appcont.set("appTools", tools);

    apps.push(Object.fromEntries(appcont));
  });

  let resp_obj = {
    serverName: context.serverId,
    serverType: context.serverType,
    serverVersion: srvVersion,
    defaultAiGatewayUri: context.aiGatewayUri,
    serverConfig: {
      host: host,
      listenPort: port,
      environment: process.env.API_GATEWAY_ENV,
      configFile: process.env.API_GATEWAY_CONFIG_FILE
    },
    aiApplications: apps,
    containerInfo: {
      imageID: process.env.IMAGE_ID,
      nodeName: process.env.NODE_NAME,
      podName: process.env.POD_NAME,
      podNamespace: process.env.POD_NAMESPACE,
      podServiceAccount: process.env.POD_SVC_ACCOUNT
    },
    // nodejs: process.versions,
    // aiAppGatewayUri: endpoint + "/apirouter", ID11152024.o
    aiAppGatewayUri: endpoint, // ID11152024.n
    endpointUri: req.url,
    serverStartDate: srvStartDate,
    status: "OK"
  };

  return (resp_obj);
}
// ID09042024.en

// GET - Instance info. endpoint
// Endpoint: /apirouter/instanceinfo
// app.get(endpoint + "/apirouter/instanceinfo", (req, res) => { ID11152024.o
app.get(endpoint + "/instanceinfo", (req, res) => { // ID11152024.n
  // logger(req,res); ID07292024.o


  // res.status(200).json(resp_obj); ID09042024.o
  res.status(200).json(
    (context.serverType === ServerTypes.SingleDomain) ? getSingleDomainAgentMetadata(req) : getMultiDomainAgentMetadata(req)); // ID09042024.n
});

// API Gateway/Server Health Check endpoint
// Endpoint: /apirouter/healthz
// app.get(endpoint + "/apirouter/healthz", (req, res) => { ID11152024.o
app.get(endpoint + "/healthz", (req, res) => { // ID11152024.n
  // logger(req,res); ID07292024.o

  let resp_obj = {
    endpointUri: req.url,
    currentDate: new Date().toLocaleString(),
    dbConnectionStatus: (dbConnectionStatus > 0) ? "OK" : "Error", // ID06282024.n
    dbLastCheckTime: dbCheckTime,
    serverStatus: "OK"
  };
  let http_status = 200;
  if (!dbConnectionStatus)
    http_status = 500; // Internal server error!

  res.status(http_status).json(resp_obj);
});

// API Gateway/Server reconfiguration endpoint
// Endpoint: /apirouter/reconfig
// app.use(endpoint + "/apirouter/reconfig/:pkey", function (req, res, next) { ID11152024.o
app.use(endpoint + "/reconfig/:pkey", function (req, res, next) { // ID11152024.n
  // logger(req,res); ID07292024.o

  let resp_obj;
  // ID01212025.sn
  if ( process.env.POD_NAME ) {
    resp_obj = {
      endpointUri: req.originalUrl,
      currentDate: new Date().toLocaleString(),
      status: "AI Application Gateway cannot be reconfigured when run in multi processor mode!  Stop all gateway server instances and restart them."
    };
    res.status(400).json(resp_obj); // 400 = Bad Request
    return;
  };
  // ID01212025.en

  if (req.params.pkey !== pkey) { // Check if key matches gateway secret key
    resp_obj = {
      endpointUri: req.originalUrl,
      currentDate: new Date().toLocaleString(),
      status: `Invalid AI Application Gateway Key=[${req.params.pkey}]`
    };
    res.status(400).json(resp_obj); // 400 = Bad Request
    return;
  };

  // readApiGatewayConfigFile(); // ID04302024.o
  if ( ! readApiGatewayConfigFile(true) ) { // ID11112024.n, ID01212025.n
    resp_obj = {
      endpointUri: req.originalUrl,
      currentDate: new Date().toLocaleString(),
      status: "Error parsing AI Application Gateway configuration file. Validation failed!  Refer to server logs."
    };
    res.status(422).json(resp_obj); // 422 = Unprocessable Entity
    return;
  };

  if (context.serverType === ServerTypes.SingleDomain) // Reconfigure single-domain gateway server
    reconfigEndpoints();
  else // Reconfigure multi-domain gateway server
    reconfigApps();

  resp_obj = {
    endpointUri: req.originalUrl,
    currentDate: new Date().toLocaleString(),
    status: "AI App Gateway has been reconfigured successfully."
  };
  res.status(200).json(resp_obj);
});

// API Gateway 'root' endpoint
// app.use(endpoint + "/apirouter", function (req, res, next) { ID11152024.o
app.use(endpoint, function (req, res, next) { // ID11152024.n
  // Add logger
  // logger(req,res); ID07292024.o

  // Add cache config
  req.cacheconfig = cacheConfig;

  // Add the AI Apps context to the request object
  req.targeturis = context;

  // console.log(`Server type: ${context.serverType}`);
  next();
}, (context.serverType === ServerTypes.SingleDomain) ? apirouter : mdapirouter);

app.listen(port, () => {
  console.log(`Server(): Azure AI Application Gateway started successfully.\nDetails:\n  Name: ${context.serverId}\n  Type: ${context.serverType}\n  Endpoint URI: http://${host}:${port}${endpoint}`);
});
