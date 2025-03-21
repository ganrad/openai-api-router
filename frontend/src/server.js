/**
 * Name: AI Chatbot Application Server
 * Description: A light-weight Nodejs application that acts as a backend for the AI Chatbot (frontend) application (SPA ~ single page application).
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 06-27-2024
 *
 * Notes:
 * ID07302024: ganrad: Introduced client authentication.  This features uses MSFT Entra ID to authenticate users.
 * ID11122024: ganrad: v2.1.0-v1.1.0: Introduced multiple UI updates.
 * ID11132024: ganrad: v2.1.0-v1.1.0: AI App Gateway URI(s) are now contained within the configuration file.
 * ID11192024: ganrad: v2.1.0-v1.1.0: (Bugfix) When auth is enabled, check all required variables and throw an 
 * exception if any one of them is not set!
 * ID02272025: ganrad: v2.3.0-v1.2.0: (Improvements) Implemented multiple UI refinements.
 * ID03102025: ganrad: v2.3.0-v1.2.0: (Enhancement) a) Restructured server initialization code. b) Added body parser to 
 * handle requests containing JSON payload & c) Added new API endpoint
 * to save new AI App definition.
 */

require('console-stamp')(console, {
  format: ':date(yyyy/mm/dd HH:MM:ss.l) :label'
});
const express = require('express');
const fs = require('fs');

const srvVersion = "1.2.0"; // ID02272025.n
const srvUriPrefix = "/ais-chatbot/ui/";
const srvStartTime = new Date().toLocaleString();

const app = express();
let bodyParser = require('body-parser'); // ID03102025.n

let host; // AOAI frontend server host
let port; // AOAI frontend server listen port
// let aisGtwyEndpoint; // Azure AI Application API Gateway URL/Endpoint ID11132024.o
let aisGtwyAuth; // Is security enabled on AI Application Gateway APIs? ID07302024.n
let configFile; // AOAI frontend server configuration file location (Full path)
let configObject; // Frontend configuration object

function readFrontendEnvVars() {
  if (process.env.FRONTEND_SRV_HOST)
    host = process.env.FRONTEND_SRV_HOST;
  else
    host = "localhost";

  if (process.env.FRONTEND_SRV_PORT)
    port = Number(process.env.FRONTEND_SRV_PORT);
  else
    port = 8000; // default listen port

  /* ID11132024.so
  if (process.env.API_GATEWAY_URI) {
    aisGtwyEndpoint = process.env.API_GATEWAY_URI;
    console.log(`Server(): Azure AI Application Gateway URI: [${aisGtwyEndpoint}]`);
  }
  else {
    console.log("Server(): Env. variable [API_GATEWAY_URI] not set, aborting ...");
    // exit program
    process.exit(1);
  };
  ID11132024.eo */

  if (process.env.FRONTEND_SRV_CONFIG_FILE) {
    configFile = process.env.FRONTEND_SRV_CONFIG_FILE;
    if (!fs.existsSync(configFile)) {
      console.log(`Server(): Server configuration file: [${configFile}] not found! Aborting initialization.`);
      process.exit(1);
    };
    console.log(`Server(): Server configuration file: [${configFile}]`);
  }
  else {
    console.log("Server(): Env. Variable [FRONTEND_SRV_CONFIG_FILE] not set, aborting ...");
    // exit program
    process.exit(1);
  };

  aisGtwyAuth = (process.env.API_GATEWAY_AUTH === "true") ? true : false; // ID07302024.n
  console.log(`Server(): Azure AI Application Gateway API security: [${aisGtwyAuth}]`);
}

// async function readConfigFile() { ID03102025.o
function readConfigFile() { // ID03102025.n
  const content = fs.readFileSync(configFile, { encoding: 'utf8', flag: 'r' });

  configObject = JSON.parse(content);
  // configObject.aisGtwyEndpoint = aisGtwyEndpoint; ID11132024.o
  configObject.aisGtwyAuth = aisGtwyAuth;
  if ( aisGtwyAuth ) { // ID07302024.n
    configObject.azTenantId = process.env.AZURE_TENANT_ID;
    if ( ! configObject.azTenantId ) { // ID11192024.n
      console.log("Server(): Env. Variable [AZURE_TENANT_ID] not set, aborting ...");
      process.exit(1);
    };
    configObject.appClientId = process.env.FRONTEND_CLIENT_ID;
    if ( ! configObject.appClientId ) { // ID11192024.n
      console.log("Server(): Env. Variable [FRONTEND_CLIENT_ID] not set, aborting ...");
      process.exit(1);
    };
    configObject.apiGatewayAppId = process.env.API_GATEWAY_APP_ID;
    if ( ! configObject.apiGatewayAppId ) { // ID11192024.n
      console.log("Server(): Env. Variable [API_GATEWAY_APP_ID] not set, aborting ...");
      process.exit(1);
    };
    // ID11192024.en
  };
}

// ID03102025.sn
function addAiAppToConfigFile(def) {
  let retVal = true;
  const gatewayList = configObject.ai_app_gateways;
  for ( const gateway of gatewayList ) {
    if ( gateway.name === def.aiGateway ) {
      gateway.ai_apps.push(def.aiAppDef); // Append the new ai app definition to the end
      break;
    };
  };
  try {
    // write the Ai App Gateway config file to disk -
    fs.writeFileSync(configFile, JSON.stringify(configObject, null, 2), { encoding: 'utf8', flag: 'w' });
    console.log('addAiAppToConfigFile(): Server config file updated successfully');
  } 
  catch (err) {
    console.error('addAiAppToConfigFile(): Encountered error while writing server config file:\n', err);
    retVal = false;
  };

  return(retVal);
}
// ID03102025.en

async function init_server() {
  readFrontendEnvVars(); // Read the env vars
  // await readConfigFile(); // Read the frontend configuration file; ID03102025.o
  readConfigFile(); // ID03102025.n
}
init_server(); // Initialize the server

app.use(bodyParser.json()); // ID03102025.n

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.use(srvUriPrefix, express.static('public'));
app.use(srvUriPrefix, express.static('jscripts'));

app.get(srvUriPrefix.concat("healthz"), (req, res) => {
  let resp_obj = {
    endpointUri: req.url,
    currentDate: new Date().toLocaleString(),
    startDate: srvStartTime,
    serverVersion: srvVersion,
    serverStatus: "OK"
  };

  res.status(200).json(resp_obj);
});

app.get(srvUriPrefix.concat('appconfig'), (req, res) => {
  res.json(configObject);
});

app.post(srvUriPrefix.concat("registerapp"),  (req,res) => { // ID03102025.n
  let resp_obj = {
    endpointUri: req.url,
    currentDate: new Date().toLocaleString(),
  };
  console.log(`Payload received:\n  ${JSON.stringify(req.body, null ,2 )}`);

  const status = addAiAppToConfigFile(req.body);
  resp_obj.status = status ? 200 : 500;

  res.status(resp_obj.status).json(resp_obj);
});

// app.listen(port,() => console.log(`Server(): AI Services API Gateway frontend server is listening on ${host}:${port}.`));
app.listen(port, host, function (err) {
  if (err)
    console.error("Encountered exception:\n", err);
  else
    console.log(`Server(): AI Chatbot Application server is listening on ${host}:${port}.`);
});