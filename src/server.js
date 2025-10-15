/**
 * Name: AI Application Gateway Server
 * Description: A light-weight intelligent AI Application Gateway / Server
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 01-26-2024
 * Version: 1.0.0
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
 * ID01312025: ganrad: v2.1.1-v2.2.0: (Bugfix) Rolled back update introduced in ID11052024. This env variable (name) is defined by Azure Monitor 
 * OpenTelemetry library. Also, Azure Monitor is initialized manually and the init code has been moved to global space.  This fixes 
 * the telemetry ingestion issue.
 * ID01232025: ganrad: v2.2.0: (Enhancement) Introduced control plane API to support AI Application server, Single and multi domain AI Apps & RAG Apps. 
 * ID01242025: ganrad: v2.2.0: (Enhancement) Modularized Json Schema files for single and multi domain AI Gateways.  Switched to 'ajv' json schema 
 * parser (from 'jsonschema').
 * ID01292025: ganrad: v2.2.0: (Enhancement) AI server and app context can now be persisted in a db table (aiappservers) in addition to a config file.
 * ID01302025: ganrad: v2.2.0: Re-factored code.
 * ID02202025: ganrad: v2.3.0: (Bugfix) By default body-parser sets a limit of approx. 100KB for JSON and URL-encoded data.
 * Updated body-parser to accept up to 600Kb ~ 150K TPMs for JSON data (request payload).
 * ID03122025: ganrad: v2.3.0: (Enhancement) When AppInsights logging is enabled, the unique request ID will be stored within the span. This should
 * help with troubleshooting performance issues.
 * ID03262025: ganrad: v2.3.1: (Bugfix) Patch release.
 * ID03282025: ganrad: v2.3.2: (Optimization) Added server status to the startup log message.
 * ID05082025: ganrad: v2.3.5: (Enhancement) Introduced memory affinity feature.
 * ID05122025: ganrad: v2.3.6: (Enhancement) Introduced endpoint health policy feature for AOAI and AI Model Inf. API calls.
 * ID05142025: ganrad: v2.3.8: (Enhancement) Introduced long term user memory ~ personalization feature.
 * ID06162025: ganrad: v2.3.9: (Enhancement) Introduced multiple endpoint routing types - Priority (default), LRU, Least Active Connections, Random Weighted and Latency weighted.
 * ID07242025: ganrad: v2.4.0: (Refactored code) Moved instance info endpoint into the corresponding router implementation.
 * ID07252025: ganrad: v2.4.0: (Refactored code) Moved all server literals to the constants module ~ app-gtwy-constants.js.
 * ID07312025: ganrad: v2.4.0: (Refactored code) Globally unique ID's are generated using a single function defined in module ~ app-gtwy-constants.js.
 * ID08212025: ganrad: v2.4.0: (Enhancement) Updated code to support AI Foundry Service Agents.
 * ID08252025: ganrad: v2.5.0: (Enhancement) Introduced cost tracking (/ budgeting) for models deployed on Azure AI Foundry.
 * ID10032025: ganrad: v2.7.0: (Enhancement) Added support for A2A protocol.
 * ID10132025: ganrad: v2.7.0: (Enhancement) An AI Application can be enabled (active) or disabled.  In the disabled state, the AI gateway will
 * not accept inference requests and will return an exception. 
*/

// ID04272024.sn
const path = require('path');
const scriptName = path.basename(__filename);
const wlogger = require('./utilities/logger.js');
wlogger.log({ level: "info", message: "[%s] Starting initialization of AI Application Gateway ...", splat: [scriptName] });
// ID04272024.en

const {
  generateGUID, // ID07312025.n 
  AiAppGateway, // ID07252025.n
  ServerDefaults, 
  CustomRequestHeaders, 
  SchedulerTypes, 
  AzAiServices, 
  ServerTypes, 
  AppServerStatus, 
  ConfigProviderType,
  DefaultJsonParserCharLimit,
  EndpointRouterTypes,
  GatewayRouterEndpoints} = require("./utilities/app-gtwy-constants"); // ID02202025.n, ID07252025.n

// Server version v2.3.9 ~ ID06162025.n
// const srvVersion = "2.3.9"; ID07252025.o

// ID02082024.sn: Configure Azure Monitor OpenTelemetry for instrumenting API gateway requests.
// const { useAzureMonitor } = require("@azure/monitor-opentelemetry"); ID01312025.o
const { initializeTelemetry, addCustomPropertiesToSpan } = require("./config/monitor/azureMonitorManualInstru.js"); // ID01312025.n, ID03122025.n
const azAppInsightsConString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING; // ID01312025.n
// let azAppInsightsConString = process.env.APPLICATION_INSIGHTS_CONNECTION_STRING; // ID11052024.n, ID01312025.o
if (azAppInsightsConString) {
  // useAzureMonitor(); ID01312025.o
  // initializeTelemetry(srvVersion); // ID01312025.n, ID07252025.o
  initializeTelemetry(AiAppGateway.Version); // ID07252025.n
  wlogger.log({ level: "info", message: "[%s] Azure Application Monitor OpenTelemetry configured.", splat: [scriptName] });
}
else
  wlogger.log({ level: "info", message: "[%s] Azure Application Insights 'Connection string' not found. No telemetry data will be sent to App Insights.", splat: [scriptName] });
// ID02082024.en

const fs = require("fs");
const express = require("express");
const cors = require("cors"); // ID05222024.n
const { apirouter, reconfigEndpoints } = require("./routes/apirouter"); // Single domain AI App Gateway
const { mdapirouter, reconfigAppMetrics } = require("./routes/md-apirouter"); // ID09042024.n; Multi domain distributed AI App Engine
const { createA2AGatewayRouter } = require("./routes/a2a-router.js"); // ID10032025.n
const cprouter = require("./routes/control-plane.js"); // ID01232025.n; AI App Gateway control plane route
const pgdb = require("./services/cp-pg.js");
const CacheConfig = require("./utilities/cache-config");
// const runCacheInvalidator = require("./utilities/cache-invalidator"); ID05062024.o
const SchedulerFactory = require("./utilities/scheduler-factory"); // ID05062024.n
const sFactory = new SchedulerFactory(); // ID05062024.n

const { initAuth } = require("./auth/bootstrap-auth"); // ID07292024.n
const { validateAiServerSchema } = require("./schemas/validate-json-config"); // ID01242025.n, ID09202024.n

// const https = require("https"); // IDTest
const app = express();
let bodyParser = require('body-parser');

// AI Application Gateway API version - ID11152024.n
// const apiVersion = "/api/v1/"; ID07252025.o
// Server start date
const srvStartDate = new Date().toLocaleString();

// Init. random uuid generator
// const { randomUUID } = require('node:crypto'); ID07312025.o
const persistdb = require("./services/pp-pg.js");
const { TblNames,PersistDao } = require('./utilities/persist-dao.js');

// Configure pinojs logger - logs http request/response only
const logger = require('pino-http')({
  // Define a custom request id function
  genReqId: function (req, res) {
    const existingID = req.id ?? req.headers[CustomRequestHeaders.RequestId];
    if (existingID) return existingID;
    // const id = randomUUID(); ID07312025.o
    const id = generateGUID("request"); // ID07312025.n
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

let host; // App Gateway host
let port; // App Gateway listen port
let endpoint; // AI App Gateway base URI - /api/v1/{env}/apirouter ID11152024.n
let pkey; // App Gateway private key (used only for reconfiguring endpoints)
// ID02202024.sn
async function readAiAppGatewayEnvVars() {
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
    endpoint = AiAppGateway.ApiVersion + process.env.API_GATEWAY_ENV + AiAppGateway.RouterContextPath; // ID11152024.n, ID07252025.n
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

  await checkDbConnectionStatus(); // ID06282024.n

  let persistPrompts = process.env.API_GATEWAY_PERSIST_PROMPTS; // ID03012024.n
  let cacheResults = process.env.API_GATEWAY_USE_CACHE;
  let manageState = process.env.API_GATEWAY_STATE_MGMT;
  if ((cacheResults === "true") || (persistPrompts === "true") || (manageState === "true")) {
    // let retval = await pgdb.checkDbConnection(); // ID06282024.o
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

let configType; // AI App Server Configuration provider type ID02072025.n
let context; // Server AI Applications Context
async function populateServerContext(initialize) { // ID01312025.n
  // Retrieve ai apps from persistent store
  const cfgFile = process.env.API_GATEWAY_CONFIG_FILE;
  if ( (configType == ConfigProviderType.File) && (cfgFile) && (fs.existsSync(cfgFile)) ) { // File store
    let data = fs.readFileSync(cfgFile, { encoding: 'utf8', flag: 'r' });
    let ctx = JSON.parse(data);

    const valResults = validateAiServerSchema(ctx);
    if ( ! valResults.schema_compliant ) { // ID01212025.n
      wlogger.log({ level: "error", message: "[%s] Error parsing AI Application Gateway configuration file, aborting ...", splat: [scriptName] });
      if ( initialize )
        // exit program
        process.exit(1);
      else
        return {
          http_code: 400, // Bad request
          data: {
            endpointUri: req.originalUrl,
            error: {
              message: "Encountered schema validation errors. Unable to process request.",
              errors: valResults.errors,
              code: "schemaValidationFailed"
            }
          }
        };
    };

    if ( (ctx.serverId !== context.serverId) || (ctx.serverType !== context.serverType) ) {
      wlogger.log({ level: "error", message: "[%s] Server Id / Type [%s: %s] does not match Id / Type specified in config file [%s: %s]!. Aborting server initialization ...", splat: [scriptName, context.serverId, context.serverType, ctx.serverId, ctx.serverType] });
      if ( initialize )
        // exit program
        process.exit(1);
      else
        return {
          http_code: 400, // Bad request
          data: {
            endpointUri: req.originalUrl,
            error: {
              message: "Server ID or Type does not match! Unable to process request.",
              code: "badRequest"
            }
          }
        };
    };

    context.applications = ctx.applications;
    if ( ctx.budgetConfig ) // ID08252025.n
      context.budgetConfig = ctx.budgetConfig;

    if ( context.serverType === ServerTypes.MultiDomain )
      context.aiGatewayUri = ctx.aiGatewayUri;
  }
  else { // Default to SQL DB store when 1) Env var is empty or not set 2) Config file does not exist
    let aiServersDao = new PersistDao(persistdb, TblNames.AiAppServers);
    let values = [ context.serverId ];
    const srvData = await aiServersDao.queryTable("(Init-0) Loading Context", 1, values); // Retrieve the AI app server data
    if ( srvData.rCount === 1 ) {
      if ( srvData.data[0].srv_type !== context.serverType ) {  // Unlikely this will occur!
        wlogger.log({ level: "error", message: "[%s] Server type [%s] does not match type specified in DB record [%s]!. Aborting server initialization ...", splat: [scriptName, context.serverType, srvData.data[0].srv_type] });
        if ( initialize )
          // exit program
          process.exit(1);
        else
          return {
            http_code: 400, // Bad request
            data: {
              endpointUri: req.originalUrl,
              error: {
                message: "Server Type does not match! Unable to process request.",
                code: "badRequest"
              }
            }
          };
      };

      if ( srvData.data[0].app_conf ) {
        context.applications = srvData.data[0].app_conf.applications;
        if ( srvData.data[0].app_conf.budgetConfig ) // ID08252025.n
          context.budgetConfig = srvData.data[0].app_conf.budgetConfig;
      };

      if ( context.serverType === ServerTypes.MultiDomain )
        context.aiGatewayUri = srvData.data[0].def_gateway_uri;
    }
    else {
      if ( srvData.errors ) {
        wlogger.log({ level: "error", message: "[%s] Unable to load AI App Gateway configuration.  Check server logs.  Aborting server initialization ...", splat: [scriptName] });
        if ( initialize )
          // exit program
          process.exit(1);
        else
          return {
            http_code: 500, // Internal server error!
            data: {
              endpointUri: req.originalUrl,
              error: {
                message: "Unable to reload AI App Gateway configuration.  Check server logs.",
                code: "internalServerError"
              }
            }
          };
      }
    };
  };

  return(null);
}

let cacheConfig;
let cacheInvalidator = null; // ID11112024.n ~ Cache entry invalidator instance
let memoryInvalidator = null; // ID11112024.n ~ Memory entry evictor instance
async function readAiAppGatewayConfig() { // ID01292025.n
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

  const srvId = process.env.API_GATEWAY_ID;
  if (!srvId) { // ID01292025.n
    wlogger.log({ level: "error", message: "[%s] Env. variable [API_GATEWAY_ID] not set, aborting ...", splat: [scriptName] });
    // exit program
    process.exit(1);
  };
  const srvType = process.env.API_GATEWAY_TYPE;
  if (!srvType) { // ID01292025.n
    wlogger.log({ level: "error", message: "[%s] Env. variable [API_GATEWAY_TYPE] not set, aborting ...", splat: [scriptName] });
    // exit program
    process.exit(1);
  }
  else {
    if ( (srvType !== ServerTypes.SingleDomain) && (srvType !== ServerTypes.MultiDomain) ) {
      wlogger.log({ level: "error", message: "[%s] Unsupported Server Type [API_GATEWAY_TYPE: %s] specified in configuration file.  Supported server types are - %s & %s, aborting ...", splat: [scriptName, srvType, ServerTypes.SingleDomain, ServerTypes.MultiDomain] });
      // exit program
      process.exit(1);
    };
  }

  if ( process.env.API_GATEWAY_CONFIG_FILE ) // If a file is specified, then use file based config
    configType = ConfigProviderType.File;
  else // Otherwise use Sql DB based config
    configType = ConfigProviderType.SqlDB;

  try {
    context = {
      serverId: srvId,
      serverType: srvType,
      serverConfigType: configType
    };
      
    await populateServerContext(true); // No need to receive config reload errors!

    if (context.serverType === ServerTypes.SingleDomain) { // ID09042024.n
      // console.log("Server(): AI Application backend (Azure OpenAI Service) endpoints:");
      wlogger.log({ level: "info", message: "[%s] Listing AI Applications:", splat: [scriptName] });
      context.applications?.forEach((app) => {
        let pidx = 0;
        if ((app.appType === AzAiServices.OAI) || (app.appType === AzAiServices.AzAiModelInfApi))
          console.log(`\nApplication ID: ${app.appId}\n  Type: ${app.appType}\n  Active: ${app.isActive}\n  Config:\n    useCache=${app?.cacheSettings?.useCache ?? false}\n    useMemory=${app?.memorySettings?.useMemory ?? false}\n    personalization=${app?.personalizationSettings?.userMemory ?? false}\n    budgeting=${app?.budgetSettings?.useBudget ?? false}`); // ID05142025.n; ID08252025.n
        else
          console.log(`\nApplication ID: ${app.appId}\n  Type: ${app.appType}\n  Active: ${app.isActive}`);

        if ((cacheConfig.cacheResults) && (app.appId === cacheConfig.embeddApp))
          vectorAppFound = true;

        console.log(`  Endpoint Router Type: ${app.endpointRouterType ?? EndpointRouterTypes.PriorityRouter}\n  Endpoints:`);
        app.endpoints.forEach((element) => {
          if ( app.appType === AzAiServices.AzAiAgent ) // ID08212025.n
            console.log(`    Priority: ${pidx}\tUri: ${element.uri}/${element.id}`);
          else
            console.log(`    Priority: ${pidx}\tUri: ${element.uri}`);
          pidx++;
        });
      });
    }
    else if (context.serverType === ServerTypes.MultiDomain) {
      const aiGatewayUri = context.aiGatewayUri;
      wlogger.log({ level: "info", message: "[%s] Listing AI Applications:", splat: [scriptName] });
      context.applications?.forEach((app) => {
        console.log(`--------\nApplication ID: ${app.appId}\nDescription: ${app.description}`);

        app.appTools.forEach((element) => {
          console.log(`----\n  Tool Name: ${element.toolName}\n  Type: ${element.toolType}\n  URI: ${element.targetUri ? element.targetUri : aiGatewayUri}\n  AI App Name: ${element.appName}`);
        });
      });
      console.log("--------");
    };

    if (cacheConfig.cacheResults && !vectorAppFound)
      wlogger.log({ level: "warn", message: "[%s] WARNING!!\n  Details:\n    AI Embedding Application [%s] not found in AI Application Gateway configuration!\n    Deploy an AI Application for vectorizing data.  Otherwise prompt caching feature will not work!", splat: [scriptName, cacheConfig.embeddApp] });

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
    };
  }
  catch (error) {
    wlogger.log({ level: "error", message: "[%s] Error initializing AI Application Gateway. Error=%s", splat: [scriptName, error] });
    // exit program
    process.exit(1);
  };
};

// ID01302025.sn
function updateAiServerFile() {
  delete context.serverConfigType; // Remove the config provider type!

  try {
    fs.writeFileSync(process.env.API_GATEWAY_CONFIG_FILE, JSON.stringify(context, null, 2));
  }
  catch ( err ) {
    wlogger.log({level: "error", message: "[%s] updateAiServerFile():\n  AI App Gateway: %s\n  Encountered exception:\n%s", splat: [scriptName,context.serverId,err.stack]});
  };
}

async function updateAiServerDB(srvStamp, qid, values) {
  let aiServersDao = new PersistDao(persistdb, TblNames.AiAppServers);
  await aiServersDao.storeEntity( // Save the ai app server configuration
    srvStamp,
    qid,
    values);
}
// ID01302025.en

// ID12192024.sn
function interceptSignals() {
  process.on('SIGINT', async () => {
    // Update server status and stop time
    if ( configType === ConfigProviderType.File )
      updateAiServerFile();
    else
      await updateAiServerDB(AppServerStatus.Stopped, 2, [process.env.API_GATEWAY_ID, AppServerStatus.Stopped]);

    wlogger.log({level: "info", message: "[%s] interceptSignals():\n  Received [SIGINT] signal. Azure AI Application Gateway [%s] shutting down ...", splat: [scriptName,context.serverId]});
    process.exit();
  });

  process.on('SIGTERM', async () => {
    // Update server status and stop time
    if ( configType === ConfigProviderType.File )
      updateAiServerFile();
    else
      await updateAiServerDB(AppServerStatus.Stopped, 2, [process.env.API_GATEWAY_ID, AppServerStatus.Stopped]);

    wlogger.log({level: "info", message: "[%s] interceptSignals():\n  Received [SIGTERM] signal. Azure AI Application Gateway [%s] shutting down ...", splat: [scriptName,context.serverId]});
    process.exit();
  })
}
// ID12192024.en

// ID06092024.sn
async function initServer() { // ID01302025.n
  await readAiAppGatewayEnvVars();
  await readAiAppGatewayConfig(); // ID01292025.n
  interceptSignals(); // ID12192024.n

  // Set the server status and startup time
  if ( configType == ConfigProviderType.SqlDB )
    await updateAiServerDB(AppServerStatus.Started, 3, [process.env.API_GATEWAY_ID, AppServerStatus.Running, new Date().toISOString()]);
}
// ID06092024.en

function initializeAuth() {
  let secureApis = process.env.API_GATEWAY_AUTH;
  if (secureApis === "true")
    // initAuth(app, endpoint + "/apirouter"); // ID11152024.o
    initAuth(app, endpoint); // ID11152024.n
  else
    wlogger.log({ level: "warn", message: "[%s] AI Application Gateway endpoints are not secured by Microsoft Entra ID!", splat: [scriptName] });
}

initServer().then(() => { // ID01302025.n
  app.use(cors()); // ID05222024.n

  // app.use(bodyParser.json()); // ID02202025.o
  app.use(bodyParser.json({limit: DefaultJsonParserCharLimit})); // ID02202025.n
  app.use(bodyParser.urlencoded({limit: DefaultJsonParserCharLimit, extended: true})); // ID02202025.n

  // ID07292024.sn
  // Generate request id prior to invoking router middleware (endpoints)
  // app.use(endpoint + "/apirouter", (req, res, next) => { ID11152024.o
  app.use(endpoint, (req, res, next) => { // ID11152024.n
    logger(req, res);

    if ( azAppInsightsConString ) { // Is AppInsights logging is enabled; ID03122025.n
      // Add the request ID to the context span
      let spanProperties = new Map();
      spanProperties.set('x-request-id', req.id);
      addCustomPropertiesToSpan(spanProperties);
    };
    next();
  });

  initializeAuth(); // Initialize OAuth flow
  // ID07292024.en

  // GET - API Gateway/Server Health Check endpoint
  // Endpoint: /apirouter/healthz
  // app.get(endpoint + "/apirouter/healthz", (req, res) => { ID11152024.o
  app.get(endpoint + GatewayRouterEndpoints.HealthEndpoint, (req, res) => { // ID11152024.n, ID07252025.n
    // logger(req,res); ID07292024.o

    let resp_obj = {
      http_status: ( !dbConnectionStatus ) ? 500 : 200,
      data: {
        endpointUri: req.originalUrl,
        currentDate: new Date().toLocaleString(),
        dbConnectionStatus: (dbConnectionStatus > 0) ? "OK" : "Error", // ID06282024.n
        dbLastCheckTime: dbCheckTime,
        serverStatus: (dbConnectionStatus > 0) ? AppServerStatus.Running : AppServerStatus.Degraded // ID07242025.n
      }
    };

    res.status(resp_obj.http_status).json(resp_obj.data);
  });

  // API Gateway/Server reconfiguration endpoint
  // Endpoint: /apirouter/reconfig
  // app.use(endpoint + "/apirouter/reconfig/:pkey", function (req, res, next) { ID11152024.o
  app.use(endpoint + GatewayRouterEndpoints.ReconfigureEndpoint + "/:pkey", async function (req, res, next) { // ID11152024.n, ID07252025.n
    // logger(req,res); ID07292024.o

    let resp_obj;
    // ID01212025.sn
    if ( process.env.POD_NAME ) {
      resp_obj = {
        http_status: 400, // Bad Request
        data: {
          endpointUri: req.baseUrl.substring(0, req.baseUrl.lastIndexOf("/")),
          error: {
            message: "AI Application Gateway cannot be reconfigured when run in multi processor mode!  Stop all gateway server instances and restart them.",
            code: "badRequest"
          }
        }
      };

      res.status(resp_obj.http_status).json(resp_obj.data); // 400 = Bad Request
      return;
    };
    // ID01212025.en

    if (req.params.pkey !== pkey) { // Check if key matches gateway secret key
      resp_obj = {
        http_status: 400, // Bad Request
        data: {
          endpointUri: req.baseUrl.substring(0, req.baseUrl.lastIndexOf("/")),
          error: {
            message: `Invalid AI Application Gateway Key=[${req.params.pkey}]`,
            code: "badRequest"
          }
        }
      };

      res.status(resp_obj.http_status).json(resp_obj.data); // 400 = Bad Request
      return;
    };

    resp_obj = await populateServerContext(false);

    if ( ! resp_obj ) { // null means all OK
      if (context.serverType === ServerTypes.SingleDomain) // Reset single-domain gateway server app info.
        reconfigEndpoints();
      else // Reset multi-domain gateway server app info.
        reconfigAppMetrics(null);

      resp_obj = {
        http_status: 200,
        data: {
          endpointUri: req.baseUrl.substring(0, req.baseUrl.lastIndexOf("/")),
          currentDate: new Date().toLocaleString(),
          status: "AI App Gateway has been reconfigured successfully."
        }
      };
    }

    res.status(resp_obj.http_status).json(resp_obj.data);
  });

  // API Gateway/Server Control Plane endpoint
  // Endpoint: /apirouter/cp
  app.use(endpoint, function (req, res, next) { // ID01232025.n
    // Add the AI App Server configuration to the request object
    req.srvconf = context;

    next();
  }, cprouter);

  // API Gateway 'load balancer' endpoint
  // Endpoint: /apirouter
  // app.use(endpoint + "/apirouter", function (req, res, next) { ID11152024.o
  app.use(endpoint, function (req, res, next) { // ID11152024.n
    // Add logger
    // logger(req,res); ID07292024.o

    // Add cache config to the request object
    req.cacheconfig = cacheConfig;

    // Add the AI Apps context to the request object
    req.targeturis = context;

    // Add the server context to the request object
    req.srvctx = { // ID07242025.n
      host: host,
      port: port,
      endpoint: endpoint,
      srvStartDate: srvStartDate,
      serverStatus: (dbConnectionStatus > 0) ? AppServerStatus.Running : AppServerStatus.Degraded
    };

    // console.log(`Server type: ${context.serverType}`);
    next();
  }, (context.serverType === ServerTypes.SingleDomain) ? apirouter : mdapirouter);

  app.use(endpoint, createA2AGatewayRouter(context.applications)); // ID10032025.n
  
  app.listen(port, () => {
    wlogger.log({
      level: "info", 
      message: "[%s] Server(): Azure AI Application Gateway started successfully.\n-----\nDetails:\n  Server Name: %s\n  Server Type: %s\n  Version: %s\n  Config. Provider Type: %s\n  Endpoint URI: http://%s:%s%s\n  Status: %s\n  Start Date: %s\n-----\n",
      splat: [scriptName,context.serverId,context.serverType,AiAppGateway.Version,configType,host,port,endpoint,AppServerStatus.Running,srvStartDate]
    }); // ID03282024.n, ID07252025.n
  });
  
  /** IDTest
  https.createServer(
    {
      key: fs.readFileSync("server.key"),
      cert: fs.readFileSync("server.cert"),
    },
    app
  )
  .listen(port, function () {
    console.log(
      "Server(): Azure AI Application Gateway started successfully."
    );
  }); */
});