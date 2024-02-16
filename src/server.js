/**
 * Name: Azure OpenAI API Gateway/Router
 * Description: A light-weight API Gateway that intelligently distributes incoming OpenAI requests
 * to backend model deployments on Azure.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 01-26-2024
 *
 * Notes:
 * ID02082024: ganrad : Added support for capturing gateway metrics using Azure Monitor OpenTelemetry.
 * ID02132024: ganrad : Provide a single data plane for multiple AI applications.
*/

// ID05082024.sn: Configure Azure Monitor OpenTelemetry for instrumenting API gateway requests.
const { useAzureMonitor } = require("@azure/monitor-opentelemetry");
let azAppInsightsConString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
if ( azAppInsightsConString ) {
   useAzureMonitor();
   console.log("Server(): Azure Application Monitor OpenTelemetry configured.");
}
else
   console.log("Server(): Azure Application Insights 'connection string' not found. No telemetry data will be sent to App Insights.");
// ID05082024.en

const fs = require("fs");
const express = require("express");
const { apirouter, reconfigEndpoints } = require("./apirouter");
const app = express();
var bodyParser = require('body-parser');
// var morgan = require('morgan');

// Server version
const srvVersion = "1.0.0";
// Server start date
const srvStartDate = new Date().toLocaleString();

// Init. random uuid generator
const { randomUUID } = require('node:crypto');

// Configure pinojs logger
const pino = require('pino');

const log_level = process.env.API_GATEWAY_LOG_LEVEL;
const logger = require('pino-http')({
  useLevel: log_level ? log_level : 'info',
  // Define a custom request id function
  genReqId: function (req, res) {
    const existingID = req.id ?? req.headers["x-request-id"]
    if (existingID) return existingID
    const id = randomUUID()
    res.setHeader('X-Request-Id', id)
    return id
  },
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
  console.log("Server(): Env. variable [API_GATEWAY_ENV] not set, aborting ...");
  // exit program
  process.exit(1);
};

var pkey; // API Gateway private key (used for reconfiguring endpoints)
if ( process.env.API_GATEWAY_KEY )
  pkey = process.env.API_GATEWAY_KEY;
else {
  console.log("Server(): Env. variable [API_GATEWAY_KEY] not set, aborting ...");
  // exit program
  process.exit(1);
};

var context;
function readApiGatewayConfigFile() {
  fs.readFile(process.env.API_GATEWAY_CONFIG_FILE, (error, data) => {
    if (error) {
      console.log(`Server(): Error loading gateway config file. Error=${error}`);
      // exit program
      process.exit(1);
    };
    context = JSON.parse(data);
  
    console.log("Server(): AI Application backend (Azure OpenAI Service) endpoints:");
    context.applications.forEach((app) => {
      let pidx = 0;
      console.log(`applicationId: ${app.appId}`);
      app.endpoints.forEach((element) => {
        console.log(`  Priority: ${pidx}\turi: ${element.uri}`);
	pidx++;
      });
    });

    console.log("Server(): Loaded backend Azure OpenAI API endpoints for applications");
  });
};
readApiGatewayConfigFile();

// app.use(morgan(log_mode ? log_mode : 'combined'));
app.use(bodyParser.json());

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
    let appeps = new Map();
    appeps.set("applicationId", app.appId);
    appeps.set("oaiEndpoints", Object.fromEntries(eps));
    appcons.push(Object.fromEntries(appeps));
  });

  let envvars = {
    apiGatewayHost: host,
    apiGatewayListenPort: port,
    apiGatewayEnv: process.env.API_GATEWAY_ENV,
    apiGatewayCollectInterval: Number(process.env.API_GATEWAY_METRICS_CINTERVAL),
    apiGatewayCollectHistoryCount: Number(process.env.API_GATEWAY_METRICS_CHISTORY),
    apiGatewayConfigFile: process.env.API_GATEWAY_CONFIG_FILE
  };

  let platformInfo = {
    imageID: process.env.IMAGE_ID,
    nodeName: process.env.NODE_NAME,
    podName: process.env.POD_NAME,
    podNamespace: process.env.POD_NAMESPACE,
    podServiceAccount: process.env.POD_SVC_ACCOUNT
  };

  resp_obj = {
    serverName: process.env.API_GATEWAY_NAME,
    serverVersion: srvVersion,
    envVars: envvars,
    containerInfo: platformInfo,
    nodejs: process.versions,
    appConnections: appcons,
    apiGatewayUri: endpoint + "/apirouter",
    endpointUri: req.url,
    serverStartDate: srvStartDate,
    status : "OK"
  };

  res.status(200).json(resp_obj);
});

app.get(endpoint + "/apirouter/healthz", (req, res) => {
  logger(req,res);

  resp_obj = {
    endpointUri: req.url,
    currentDate: new Date().toLocaleString(),
    status : "OK"
  };
  res.status(200).json(resp_obj);
});

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

  readApiGatewayConfigFile();
  reconfigEndpoints();

  resp_obj = {
    endpointUri: req.originalUrl,
    currentDate: new Date().toLocaleString(),
    status : "Reloaded router config ..."
  };
  res.status(200).json(resp_obj);
});

app.use(endpoint + "/apirouter", function(req, res, next) {
  // Add logger
  logger(req,res);

  // Add the target uri's to the request object
  req.targeturis = context;

  next();
}, apirouter);

app.listen(port, () => {
  console.log(`Server(): OpenAI API Gateway server started successfully.\nGateway uri: http://${host}:${port}${endpoint}`);
});
