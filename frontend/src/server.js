/**
 * Name: AI Services API Gateway frontend server
 * Description: A light-weight Nodejs server that serves AI Services API Gateway frontend application (single page application)
 * to clients. 
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 06-27-2024
 *
 * Notes:
 *
 */

require('console-stamp')(console, {
	format: ':date(yyyy/mm/dd HH:MM:ss.l) :label'
});
const express = require('express');
const fs = require('fs');

const srvVersion = "1.0.0";
const srvUriPrefix = "/ais-chatbot/ui/";
const srvStartTime = new Date().toLocaleString();

const app = express();

let host; // AOAI frontend server host
let port; // AOAI frontend server listen port
let aisGtwyEndpoint; // Azure AI Services API Gateway URL/Endpoint
let configFile; // AOAI frontend server configuration file location (Full path)
let configObject; // Frontend configuration object

function readFrontendEnvVars() {
  if ( process.env.FRONTEND_SRV_HOST )
    host = process.env.FRONTEND_SRV_HOST;
  else
    host = "localhost";

  if ( process.env.FRONTEND_SRV_PORT )
    port = Number(process.env.FRONTEND_SRV_PORT);
  else
    port = 8000;

  if ( process.env.AIS_API_GATEWAY_URI ) {
    aisGtwyEndpoint = process.env.AIS_API_GATEWAY_URI;
    console.log(`Server(): Azure AI Services Gateway URI: [${aisGtwyEndpoint}]`);
  }
  else {
    console.log("Server(): Env. variable [AIS_API_GATEWAY_URI] not set, aborting ...");
    // exit program
    process.exit(1);
  };

  if ( process.env.FRONTEND_SRV_CONFIG_FILE ) {
    configFile = process.env.FRONTEND_SRV_CONFIG_FILE;
    if ( ! fs.existsSync(configFile) ) {
      console.log(`Server(): Server configuration file: [${configFile}] not found! Aborting initialization.`);
      process.exit(1);
    };
    console.log(`Server(): Server configuration file: [${configFile}]`);
  }
  else {
    console.log("Server(): Env. variable [FRONTEND_SRV_CONFIG_FILE] not set, aborting ...");
    // exit program
    process.exit(1);
  };
}

function readConfigFile() {
  const content = fs.readFileSync(configFile,{ encoding: 'utf8', flag: 'r' });  

  configObject = JSON.parse(content);
  configObject.aisGtwyEndpoint = aisGtwyEndpoint;
}

function init_server() {
  readFrontendEnvVars(); // Read the env vars
  readConfigFile(); // Read the frontend configuration file
}
init_server(); // Initialize the server

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.use(srvUriPrefix,express.static('public'));
app.use(srvUriPrefix,express.static('jscripts'));

app.get(srvUriPrefix.concat("healthz"), (req, res) => {
  let resp_obj = {
    endpointUri: req.url,
    currentDate: new Date().toLocaleString(),
    startDate: srvStartTime,
    serverVersion: srvVersion,
    serverStatus : "OK"
  };

  res.status(200).json(resp_obj);
});

app.get(srvUriPrefix.concat('appconfig'), (req, res) => {
  res.json(configObject);
});

// app.listen(port,() => console.log(`Server(): AI Services API Gateway frontend server is listening on ${host}:${port}.`));
app.listen(port,host, function(err) {
  if (err)
    console.error("Encountered exception:\n",err);
  else
    console.log(`Server(): AI Services API Gateway frontend server is listening on ${host}:${port}.`);
});
