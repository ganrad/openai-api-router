/**
 * Name: AI Application API Gateway/Router
 * Description: A light-weight API Gateway that intelligently distributes AI Application API requests
 * to backend AI Services endpoints on Azure.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 01-26-2024
 *
 * Notes:
 * ID02082024: ganrad : Added support for capturing gateway metrics using Azure Monitor OpenTelemetry.
 * ID02132024: ganrad : Provide a single data plane for multiple AI applications.
 * ID02202024: ganrad : Introduced semantic caching / retrieval functionality.
 * ID03012024: ganrad : Introduced prompt persistence.
 * ID04272024: ganrad : 90% server logging moved to winstonjs.
 * ID04302024: ganrad : (Bugfix) Each time 'reconfig' endpoint is invoked, a new cron scheduler is started. There should only
 * be one cache invalidator running per gateway/router instance.
*/

// ID04272024.sn
const path = require('path');
const scriptName = path.basename(__filename);

const wlogger = require('./utilities/logger.js');
wlogger.log({level: "info", message: "[%s] Starting initialization of Azure AI Services Gateway ...", splat: [scriptName]});
// ID04272024.sn

// ID02082024.sn: Configure Azure Monitor OpenTelemetry for instrumenting API gateway requests.
const { useAzureMonitor } = require("@azure/monitor-opentelemetry");
let azAppInsightsConString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
if ( azAppInsightsConString ) {
   useAzureMonitor();
   // console.log("Server(): Azure Application Monitor OpenTelemetry configured.");
   wlogger.log({level: "info", message: "[%s] Azure Application Monitor OpenTelemetry configured.", splat: [scriptName]});
}
else
   // console.log("Server(): Azure Application Insights 'connection string' not found. No telemetry data will be sent to App Insights.");
   wlogger.log({level: "info", message: "[%s] Azure Application Insights 'Connection string' not found. No telemetry data will be sent to App Insights.", splat: [scriptName]});
// ID02082024.en

const fs = require("fs");
const express = require("express");
const { ServerDefaults, AzAiServices } = require("./utilities/app-gtwy-constants");
const { apirouter, reconfigEndpoints } = require("./apirouter");
const pgdb = require("./services/cp-pg.js");
const CacheConfig = require("./utilities/cache-config");
const runCacheInvalidator = require("./utilities/cache-invalidator");

const app = express();
var bodyParser = require('body-parser');
// var morgan = require('morgan');

// Server version v1.6 ~ 04272024
const srvVersion = "1.6.0";
// Server start date
const srvStartDate = new Date().toLocaleString();

// Init. random uuid generator
const { randomUUID } = require('node:crypto');

// Configure pinojs logger - logs http request/response only
// const pino = require('pino');

const logger = require('pino-http')({
  // Define a custom request id function
  genReqId: function (req, res) {
    const existingID = req.id ?? req.headers["x-request-id"]
    if (existingID) return existingID
    const id = randomUUID()
    res.setHeader('X-Request-Id', id)
    return id
  },
  useLevel: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

var host;
if ( process.env.API_GATEWAY_HOST )
  host = process.env.API_GATEWAY_HOST;
else
  host = "localhost";

var port;
if ( process.env.API_GATEWAY_PORT )
  port = Number(process.env.API_GATEWAY_PORT);
else
  port = 8000;

var endpoint; // API Gateway base URI
if ( process.env.API_GATEWAY_ENV )
  endpoint = "/api/v1/" + process.env.API_GATEWAY_ENV;
else {
  // console.log("Server(): Env. variable [API_GATEWAY_ENV] not set, aborting ...");
  wlogger.log({level: "error", message: "[%s] Env. variable [API_GATEWAY_ENV] not set, aborting ...", splat: [scriptName]});
  // exit program
  process.exit(1);
};

var pkey; // API Gateway private key (used for reconfiguring endpoints)
if ( process.env.API_GATEWAY_KEY )
  pkey = process.env.API_GATEWAY_KEY;
else {
  // console.log("Server(): Env. variable [API_GATEWAY_KEY] not set, aborting ...");
  wlogger.log({level: "error", message: "[%s] Env. variable [API_GATEWAY_KEY] not set, aborting ...", splat: [scriptName]});
  // exit program
  process.exit(1);
};

// ID02202024.sn
// console.log(`*** ${cacheResults}; ${typeof cacheResults} ***`);
(async () => {
  let persistPrompts = process.env.API_GATEWAY_PERSIST_PROMPTS; // ID03012024.n
  let cacheResults = process.env.API_GATEWAY_USE_CACHE;
  if ( (cacheResults === "true") || (persistPrompts === "true") ) {
    let retval = await pgdb.checkDbConnection();
    if ( retval ) {
      if ( cacheResults === "true" )
        // console.log("Server(): Completions will be cached");
        wlogger.log({level: "info", message: "[%s] Completions will be cached", splat: [scriptName]});
      else
        wlogger.log({level: "info", message: "[%s] Completions will not be cached", splat: [scriptName]});
      if ( persistPrompts === "true" )
        // console.log("Server(): Prompts will be persisted");
        wlogger.log({level: "info", message: "[%s] Prompts will be persisted", splat: [scriptName]});
      else
        wlogger.log({level: "info", message: "[%s] Prompts will not be persisted", splat: [scriptName]});
    }
    else
      process.exit(1);
  }
  else {
    // console.log("Server(): Completions will not be cached");
    // console.log("Server(): Prompts will not be persisted");
    wlogger.log({level: "info", message: "[%s] Completions will not be cached", splat: [scriptName]});
    wlogger.log({level: "info", message: "[%s] Prompts will not be persisted", splat: [scriptName]});
  };
}
)();

var context; // AI Applications Context
var cacheConfig;
function readApiGatewayConfigFile(startCacheInvalidator) {
  let vectorAppFound = false;

  let cacheResults = process.env.API_GATEWAY_USE_CACHE;
  if ( cacheResults === "true" ) {
    let embeddApp;
    if  ( process.env.API_GATEWAY_VECTOR_AIAPP ) 
      embeddApp = process.env.API_GATEWAY_VECTOR_AIAPP;
    else {
      // console.log("Server(): AI Embedding Application cannot be empty! Aborting server initialization.");
      wlogger.log({level: "error", message: "[%s] Env. variable for AI Embedding Application [API_GATEWAY_VECTOR_AIAPP] not set, aborting ...", splat: [scriptName]});
      process.exit(1);
    };

    let srchEngine = process.env.API_GATEWAY_SRCH_ENGINE ?? "Postgresql/pgvector";

    cacheConfig = new CacheConfig(true,embeddApp,srchEngine);
  }
  else 
    cacheConfig = new CacheConfig(false,null,null);

  if ( ! process.env.API_GATEWAY_CONFIG_FILE ) {
      wlogger.log({level: "error", message: "[%s] Env. variable [API_GATEWAY_CONFIG_FILE] not set, aborting ...", splat: [scriptName]});
      // exit program
      process.exit(1);
  };

  fs.readFile(process.env.API_GATEWAY_CONFIG_FILE, async (error, data) => {
    if (error) {
      // console.log(`Server(): Error loading gateway config file. Error=${error}`);
      wlogger.log({level: "error", message: "[%s] Error loading gateway config file. Error=%s", splat: [scriptName, error]});
      // exit program
      process.exit(1);
    };
    context = JSON.parse(data);
  
    // console.log("Server(): AI Application backend (Azure OpenAI Service) endpoints:");
    wlogger.log({level: "info", message: "[%s] AI Application backend (Azure AI Service) endpoints:", splat: [scriptName]});
    context.applications.forEach((app) => {
      let pidx = 0;
      if ( app.appType === AzAiServices.OAI )
        console.log(`Application ID: ${app.appId}; Type: ${app.appType}; useCache=${app.cacheSettings.useCache}`);
      else
        console.log(`Application ID: ${app.appId}; Type: ${app.appType}`);

      if ( (cacheConfig.cacheResults) && (app.appId === cacheConfig.embeddApp) )
        vectorAppFound = true;

      app.endpoints.forEach((element) => {
        console.log(`  Priority: ${pidx}\tUri: ${element.uri}`);
	pidx++;
      });
    });

    // console.log("Server(): Loaded backend Azure OpenAI API endpoints for applications");
    wlogger.log({level: "info", message: "[%s] Loaded backend Azure OpenAI API endpoints for applications", splat: [scriptName]});

    if ( cacheConfig.cacheResults && !vectorAppFound ) {
      // console.log(`Server(): AI Embedding Application [${cacheConfig.embeddApp}] not defined in API Gateway Configuration file! Aborting server initialization.`); 
      wlogger.log({level: "error", message: "[%s] AI Embedding Application [%s] not defined in API Gateway Configuration file! Aborting server initialization.", splat: [scriptName, cacheConfig.embeddApp]}); 

      process.exit(1);
    };

    if ( cacheConfig.cacheResults && startCacheInvalidator ) {
      // Start the cache invalidator cron job and set it's run schedule
      let schedule = process.env.API_GATEWAY_CACHE_INVAL_SCHEDULE;
      if ( ! schedule ) // schedule is empty, undefined, null
        schedule = ServerDefaults.runSchedule;
      // console.log(`Server(): Cache invalidator run schedule (Cron) - ${schedule}`);
      wlogger.log({level: "info", message: "[%s] Cache invalidator run schedule (Cron) - %s", splat: [scriptName, schedule]});

      await runCacheInvalidator(schedule, context);
    };
  });
};
// ID02202024.en
// readApiGatewayConfigFile(); // ID04302024.o
readApiGatewayConfigFile(true); // ID04302024.n

// app.use(morgan(log_mode ? log_mode : 'combined'));
app.use(bodyParser.json());

// Instance info. endpoint
app.get(endpoint + "/apirouter/instanceinfo", (req, res) => {
  logger(req,res);

  let appcons = [];
  context.applications.forEach((app) => {
    let epIdx = 0; // Priority index
    let eps = new Map();
    app.endpoints.forEach((element) => {
      eps.set(epIdx,element.uri);
      epIdx++;
    });

    let csettings = {
      useCache: app.cacheSettings.useCache,
      searchType: app.cacheSettings.searchType,
      searchDistance: app.cacheSettings.searchDistance,
      searchContent: app.cacheSettings.searchContent,
      entryExpiry: app.cacheSettings.entryExpiry
    };

    let appeps = new Map();
    appeps.set("applicationId", app.appId);
    appeps.set("description", app.description);
    appeps.set("type", app.appType);
    appeps.set("cacheSettings", csettings);
    appeps.set("endpoints", Object.fromEntries(eps));
    appcons.push(Object.fromEntries(appeps));
  });

  let envvars = {
    host: host,
    listenPort: port,
    environment: process.env.API_GATEWAY_ENV,
    persistPrompts: process.env.API_GATEWAY_PERSIST_PROMPTS,
    collectInterval: Number(process.env.API_GATEWAY_METRICS_CINTERVAL),
    collectHistoryCount: Number(process.env.API_GATEWAY_METRICS_CHISTORY),
    configFile: process.env.API_GATEWAY_CONFIG_FILE
  };

  let platformInfo = {
    imageID: process.env.IMAGE_ID,
    nodeName: process.env.NODE_NAME,
    podName: process.env.POD_NAME,
    podNamespace: process.env.POD_NAMESPACE,
    podServiceAccount: process.env.POD_SVC_ACCOUNT
  };

  let resultsConfig = {
    cacheEnabled: cacheConfig.cacheResults,
    embeddAiApp: cacheConfig.embeddApp,
    searchEngine: cacheConfig.srchEngine,
    cacheInvalidationSchedule: process.env.API_GATEWAY_CACHE_INVAL_SCHEDULE,
  };

  resp_obj = {
    serverName: process.env.API_GATEWAY_NAME,
    serverVersion: srvVersion,
    serverConfig: envvars,
    cacheSettings: resultsConfig,
    aiApplications: appcons,
    containerInfo: platformInfo,
    nodejs: process.versions,
    apiGatewayUri: endpoint + "/apirouter",
    endpointUri: req.url,
    serverStartDate: srvStartDate,
    status : "OK"
  };

  res.status(200).json(resp_obj);
});

// Health endpoint
app.get(endpoint + "/apirouter/healthz", (req, res) => {
  logger(req,res);

  resp_obj = {
    endpointUri: req.url,
    currentDate: new Date().toLocaleString(),
    status : "OK"
  };
  res.status(200).json(resp_obj);
});

// API Gateway/Server reconfiguration endpoint
app.use(endpoint + "/apirouter/reconfig/:pkey", function(req, res, next) {
  logger(req,res);

  if ( req.params.pkey !== pkey ) { // Check if key matches gateway secret key
    resp_obj = {
      endpointUri: req.originalUrl,
      currentDate: new Date().toLocaleString(),
      status : `Incorrect API Gateway Key=[${req.params.pkey}]`
    };
    res.status(400).json(resp_obj); // 400 = Bad Request
    return;
  };

  // readApiGatewayConfigFile(); // ID04302024.o
  readApiGatewayConfigFile(false); // ID04302024.n
  reconfigEndpoints();

  resp_obj = {
    endpointUri: req.originalUrl,
    currentDate: new Date().toLocaleString(),
    status : "Reloaded router config ..."
  };
  res.status(200).json(resp_obj);
});

// API Gateway 'root' endpoint
app.use(endpoint + "/apirouter", function(req, res, next) {
  // Add logger
  logger(req,res);

  // Add cache config
  req.cacheconfig = cacheConfig;

  // Add the target uri's to the request object
  req.targeturis = context;

  next();
}, apirouter);

app.listen(port, () => {
  console.log(`Server(): OpenAI API Gateway server started successfully.\nGateway uri: http://${host}:${port}${endpoint}`);
});
