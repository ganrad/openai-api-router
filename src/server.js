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
 * ID05062024: ganrad : Introduced memory (state management) for appType = Azure OpenAI Service.
 * ID05222024: ganrad : Enabled CORS
 * ID06092024: ganrad : Refactored code
 * ID06282024: ganrad : Check db connection status every 60 minutes and return result when '/healthz' endpoint is invoked. 
*/

// ID04272024.sn
const path = require('path');
const scriptName = path.basename(__filename);
const wlogger = require('./utilities/logger.js');

wlogger.log({level: "info", message: "[%s] Starting initialization of Azure AI Services API Gateway ...", splat: [scriptName]});
// ID04272024.en

// ID02082024.sn: Configure Azure Monitor OpenTelemetry for instrumenting API gateway requests.
const { useAzureMonitor } = require("@azure/monitor-opentelemetry");
// ID02082024.en

const fs = require("fs");
const express = require("express");
const cors = require("cors"); // ID05222024.n
const { ServerDefaults, CustomRequestHeaders, SchedulerTypes, AzAiServices } = require("./utilities/app-gtwy-constants");
const { apirouter, reconfigEndpoints } = require("./apirouter");
const pgdb = require("./services/cp-pg.js");
const CacheConfig = require("./utilities/cache-config");
// const runCacheInvalidator = require("./utilities/cache-invalidator"); ID05062024.o
const SchedulerFactory = require("./utilities/scheduler-factory"); // ID05062024.n
const sFactory = new SchedulerFactory(); // ID05062024.n

const app = express();
var bodyParser = require('body-parser');
// var morgan = require('morgan');

// Server version v1.8.0 ~ 06052024.n
const srvVersion = "1.8.2";
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
  setInterval(async function() {
    dbConnectionStatus = await pgdb.checkDbConnection();
    dbCheckTime = new Date().toLocaleString();
  }, 60 * 60000); // Check DB connection once every 60 minutes
}
// ID06282024.en

var host; // API Gateway host
var port; // API Gateway listen port
var endpoint; // API Gateway base URI
var pkey; // API Gateway private key (used for reconfiguring endpoints)
// ID02202024.sn
async function readApiGatewayEnvVars() {
  if ( process.env.API_GATEWAY_HOST )
    host = process.env.API_GATEWAY_HOST;
  else
    host = "localhost";

  if ( process.env.API_GATEWAY_PORT )
    port = Number(process.env.API_GATEWAY_PORT);
  else
    port = 8000;

  if ( process.env.API_GATEWAY_ENV )
    endpoint = "/api/v1/" + process.env.API_GATEWAY_ENV;
  else {
    wlogger.log({level: "error", message: "[%s] Env. variable [API_GATEWAY_ENV] not set, aborting ...", splat: [scriptName]});
    // exit program
    process.exit(1);
  };

  if ( process.env.API_GATEWAY_KEY )
    pkey = process.env.API_GATEWAY_KEY;
  else {
    wlogger.log({level: "error", message: "[%s] Env. variable [API_GATEWAY_KEY] not set, aborting ...", splat: [scriptName]});
    // exit program
    process.exit(1);
  };

  let azAppInsightsConString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if ( azAppInsightsConString ) {
    useAzureMonitor();
    wlogger.log({level: "info", message: "[%s] Azure Application Monitor OpenTelemetry configured.", splat: [scriptName]});
  }
  else
    wlogger.log({level: "info", message: "[%s] Azure Application Insights 'Connection string' not found. No telemetry data will be sent to App Insights.", splat: [scriptName]});

  let persistPrompts = process.env.API_GATEWAY_PERSIST_PROMPTS; // ID03012024.n
  let cacheResults = process.env.API_GATEWAY_USE_CACHE;
  let manageState = process.env.API_GATEWAY_STATE_MGMT;
  if ( (cacheResults === "true") || (persistPrompts === "true") || (manageState === "true") ) {
    // let retval = await pgdb.checkDbConnection(); // ID06282024.o
    checkDbConnectionStatus(); // ID06282024.n
    if ( dbConnectionStatus ) {
      if ( cacheResults === "true" )
        wlogger.log({level: "info", message: "[%s] Completions will be cached", splat: [scriptName]});
      else
        wlogger.log({level: "info", message: "[%s] Completions will not be cached", splat: [scriptName]});

      if ( persistPrompts === "true" )
        wlogger.log({level: "info", message: "[%s] Prompts will be persisted", splat: [scriptName]});
      else
        wlogger.log({level: "info", message: "[%s] Prompts will not be persisted", splat: [scriptName]});

      if ( manageState === "true" )
        wlogger.log({level: "info", message: "[%s] Conversational state will be managed", splat: [scriptName]});
      else
        wlogger.log({level: "info", message: "[%s] Conversational state will not be managed", splat: [scriptName]});
    }
    else
      process.exit(1);
  }
  else {
    wlogger.log({level: "info", message: "[%s] Completions will not be cached", splat: [scriptName]});
    wlogger.log({level: "info", message: "[%s] Conversational state will not be managed", splat: [scriptName]});
    wlogger.log({level: "info", message: "[%s] Prompts will not be persisted", splat: [scriptName]});
  };
}

var context; // AI Applications Context
var cacheConfig;
async function readApiGatewayConfigFile(startScheduler) {
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

  await fs.readFile(process.env.API_GATEWAY_CONFIG_FILE, async (error, data) => {
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
        console.log(`Application ID: ${app.appId}; Type: ${app.appType}; useCache=${ app?.cacheSettings?.useCache ?? false }; useMemory=${ app?.memorySettings?.useMemory ?? false }`);
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
    wlogger.log({level: "info", message: "[%s] Successfully loaded backend API endpoints for AI applications", splat: [scriptName]});

    if ( cacheConfig.cacheResults && !vectorAppFound ) {
      // console.log(`Server(): AI Embedding Application [${cacheConfig.embeddApp}] not defined in API Gateway Configuration file! Aborting server initialization.`); 
      wlogger.log({level: "error", message: "[%s] AI Embedding Application [%s] not defined in AI Services Gateway Configuration file! Aborting server initialization.", splat: [scriptName, cacheConfig.embeddApp]}); 

      process.exit(1);
    };

    if ( cacheConfig.cacheResults && startScheduler ) {
      // Start the cache entry invalidator cron job and set it's run schedule
      let schedule = process.env.API_GATEWAY_CACHE_INVAL_SCHEDULE;
      if ( ! schedule ) // schedule is empty, undefined, null
        schedule = ServerDefaults.CacheEntryInvalidateSchedule;
      // console.log(`Server(): Cache invalidator run schedule (Cron) - ${schedule}`);
      wlogger.log({level: "info", message: "[%s] Cache entry invalidate run schedule (Cron) - %s", splat: [scriptName, schedule]});

      // await runCacheInvalidator(schedule, context); ID05062024.o
      sFactory.getScheduler(SchedulerTypes.InvalidateCacheEntry).runSchedule(schedule, context); // ID05062024.n
    };

    // ID05062024.sn
    let manageState = (process.env.API_GATEWAY_STATE_MGMT === 'true') ? true : false
    if ( manageState && startScheduler ) {
      // Start the memory state invalidator cron job and set it's run schedule
      let schedule = process.env.API_GATEWAY_MEMORY_INVAL_SCHEDULE;
      if ( ! schedule ) // schedule is empty, undefined, null
        schedule = ServerDefaults.MemoryInvalidateSchedule;

      wlogger.log({level: "info", message: "[%s] Memory (State) invalidate run schedule (Cron) - %s", splat: [scriptName, schedule]});

      sFactory.getScheduler(SchedulerTypes.ManageMemory).runSchedule(schedule, context); // ID05062024.n
    }
    // ID05062024.en
  });
};
// ID02202024.en
// readApiGatewayConfigFile(); // ID04302024.o

// ID06092024.sn
async function initServer() { 
  await readApiGatewayEnvVars();
  await readApiGatewayConfigFile(true); // ID04302024.n
}
initServer();// Initialize the server
// ID06092024.en

app.use(cors()); // ID05222024.n

// app.use(morgan(log_mode ? log_mode : 'combined'));
app.use(bodyParser.json());

// GET - Instance info. endpoint
app.get(endpoint + "/apirouter/instanceinfo", (req, res) => {
  logger(req,res);

  let appcons = [];
  context.applications.forEach((aiapp) => {
    let epIdx = 0; // Priority index
    let eps = new Map();
    aiapp.endpoints.forEach((element) => {
      let ep = {
	rpm: element.rpm,
        uri: element.uri
      };
      eps.set(epIdx,ep);
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
    if ( aiapp.memorySettings )
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
    serverName: process.env.API_GATEWAY_NAME,
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

  let resp_obj = {
    endpointUri: req.url,
    currentDate: new Date().toLocaleString(),
    dbConnectionStatus: (dbConnectionStatus > 0) ? "OK" : "Error", // ID06282024.n
    dbLastCheckTime: dbCheckTime,
    serverStatus : "OK"
  };
  let http_status = 200;
  if ( ! dbConnectionStatus )
    http_status = 500; // Internal server error!

  res.status(http_status).json(resp_obj);
});

// API Gateway/Server reconfiguration endpoint
app.use(endpoint + "/apirouter/reconfig/:pkey", function(req, res, next) {
  logger(req,res);

  let resp_obj;
  if ( req.params.pkey !== pkey ) { // Check if key matches gateway secret key
    resp_obj = {
      endpointUri: req.originalUrl,
      currentDate: new Date().toLocaleString(),
      status : `Incorrect AI Services API Gateway Key=[${req.params.pkey}]`
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
  console.log(`Server(): Azure AI Services API Gateway server started successfully.\nGateway uri: http://${host}:${port}${endpoint}`);
});
