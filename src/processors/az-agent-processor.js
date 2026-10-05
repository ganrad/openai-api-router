/**
 * Name: A multi-agent driver
 * Description: This class implements a multi-agent processor/driver which orchestrates the sequential execution of 
 * multiple tools and agents configured for an AI application.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 07-12-2024
 *
 * Notes:
 *
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger');

// const fetch = require("node-fetch"); ID06052024.o
const CacheDao = require("../utilities/cache-dao.js"); // ID02202024.n
const cachedb = require("../services/cp-pg.js"); // ID02202024.n
const { TblNames, PersistDao } = require("../utilities/persist-dao.js"); // ID03012024.n
const persistdb = require("../services/pp-pg.js"); // ID03012024.n
const pgvector = require("pgvector/pg"); // ID02202024.n
const { CustomRequestHeaders } = require("../utilities/app-gtwy-constants.js"); // ID05062024.n
const { randomUUID } = require('node:crypto'); // ID05062024.n

class AzAgentDriver {

  constructor() {
  }

  async processRequest(
    req, // 0
    res, // 1
    config) { // 2

    let apps = req.targeturis; // Ai applications object
    let cacheConfig = req.cacheconfig; // global cache config
    let memoryConfig = arguments[3]; // AI application state management config
    let appConnections = arguments[4]; // EP metrics obj for all apps
    let cacheMetrics = arguments[5]; // Cache hit metrics obj for all apps
    let toolChain = config.tools; // Tools to execute
    let manageState = (process.env.API_GATEWAY_STATE_MGMT === 'true') ? true : false
	
    // State management is only supported for chat completion API!
    if ( memoryConfig && (! req.body.messages) ) // If the request is not of type == chat completion
      memoryConfig = null;

    // 1. Check thread ID in request header
    let threadId = req.get(CustomRequestHeaders.ThreadId);

    // console.log(`*****\nAzOaiProcessor.processRequest():\n  URI: ${req.originalUrl}\n  Request ID: ${req.id}\n  Application ID: ${config.appId}\n  Type: ${config.appType}`);
    logger.log({level: "info", message: "[%s] %s.processRequest(): Request ID: %s\n  URL: %s\n  Thread ID: %s\n  Application ID: %s\n  Type: %s\n Request Payload: %s", splat: [scriptName,this.constructor.name,req.id,req.originalUrl,threadId,config.appId,config.appType,JSON.stringify(req.body)]});
    
    let respMessage = null; // Populate this var before returning!
    // for ( const tool of toolChain.
    

    return(respMessage);
  } // end of processRequest()
}

module.exports = AzAgentDriver;
