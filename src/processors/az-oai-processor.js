/**
 * Name: Azure OAI processor
 * Description: This class implements a processor for executing Azure Open AI API requests.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 04-24-2024
 *
 * Notes:
 * ID04272024: ganrad: Centralized logging with winstonjs
 *
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger');

const fetch = require("node-fetch");
const CacheDao = require("../utilities/cache-dao.js"); // ID02202024.n
const cachedb = require("../services/cp-pg.js"); // ID02202024.n
const { tblNames, PersistDao } = require("../utilities/persist-dao.js"); // ID03012024.n
const persistdb = require("../services/pp-pg.js"); // ID03012024.n
const pgvector = require("pgvector/pg"); // ID02202024.n

class AzOaiProcessor {

  constructor() {
  }
 
  async processRequest(
    req, // 0
    config) { // 1

    let apps = req.targeturis; // Ai applications object
    let cacheConfig = req.cacheconfig; // global cache config
    let appConnections = arguments[2]; // EP metrics obj for all apps
    let cacheMetrics = arguments[3]; // Cache hit metrics obj for all apps
    // console.log(`*****\nAzOaiProcessor.processRequest():\n  URI: ${req.originalUrl}\n  Request ID: ${req.id}\n  Application ID: ${config.appId}\n  Type: ${config.appType}`);
    logger.log({level: "info", message: "[%s] %s.processRequest():\n  URI: %s\n  Request ID: %s\n  Application ID: %s\n  Type: %s", splat: [scriptName,this.constructor.name,req.originalUrl,req.id,config.appId,config.appType]});
    
    let respMessage = null; // Populate this var before returning!
    let useCache = config.useCache;

    // Has caching been disabled on the request using query param ~
    // 'use_cache=false' ?
    if ( useCache && req.query.use_cache )
      useCache = req.query.use_cache === 'false' ? false : useCache;

    let vecEndpoints = null;
    let embeddedPrompt = null;
    let cacheDao = null;
    if ( cacheConfig.cacheResults && useCache ) { // Is caching enabled?
      for ( const application of apps.applications) {
        if ( application.appId == cacheConfig.embeddApp ) {
          vecEndpoints = application.endpoints;

          break;
        };
      };

      // Perform semantic search using input prompt
      cacheDao = new CacheDao(
        appConnections.getConnection(cacheConfig.embeddApp),
        vecEndpoints,
        config.srchType,
        config.srchDistance,
        config.srchContent);

      const {rowCount, simScore, completion, embeddings} =
        await cacheDao.queryVectorDB(
          req.id,
          config.appId,
          req.body,
          cachedb
        );

      if ( rowCount === 1 ) { // Cache hit!
        cacheMetrics.updateCacheMetrics(config.appId, simScore);

	respMessage = {
	  http_code: 200, // All ok. Serving completion from cache.
	  cached: true,
	  data: completion
	};

        return(respMessage);
      }
      else
        embeddedPrompt = embeddings;
    };

    let epdata = appConnections.getConnection(config.appId);
    let stTime = Date.now();

    let response;
    let retryAfter = 0;
    let data;
    let err_msg;
    for (const element of config.appEndpoints) { // start of endpoint loop
      let metricsObj = epdata.get(element.uri); 
      let healthArr = metricsObj.isEndpointHealthy();
      // console.log(`******isAvailable=${healthArr[0]}; retryAfter=${healthArr[1]}`);
      if ( ! healthArr[0] ) {
        if ( retryAfter > 0 )
  	  retryAfter = (healthArr[1] < retryAfter) ? healthArr[1] : retryAfter;
	else
	  retryAfter = healthArr[1];
        continue;
      };

      try {
        const meta = new Map();
        meta.set('Content-Type','application/json');
        meta.set('api-key',element.apikey);

        response = await fetch(element.uri, {
          method: req.method,
	  headers: meta,
          body: JSON.stringify(req.body)
        });

        // let { status, statusText, headers } = response;
	let status = response.status;
        if ( status === 200 ) { // All Ok
          data = await response.json();

          let respTime = Date.now() - stTime;
	  metricsObj.updateApiCallsAndTokens(
            data.usage.total_tokens,
            respTime);

          // ID02202024.sn
          if ( cacheDao && embeddedPrompt ) { // Cache results ?
            let prompt = req.body.prompt;
            if ( ! prompt )
              prompt = JSON.stringify(req.body.messages);

            let values = [
              req.id,
              config.appId,
              prompt,
              pgvector.toSql(embeddedPrompt),
              data
            ];

            await cacheDao.storeEntity(
              0,
              values,
              cachedb
            );
          };
          // ID02202024.en

          // ID03012024.sn
          let persistPrompts = (process.env.API_GATEWAY_PERSIST_PROMPTS === 'true') ? true : false
          if ( persistPrompts ) { // Persist prompts ?
            let promptDao = new PersistDao(persistdb, tblNames.prompts);
            let values = [
              req.id,
              config.appId,
              req.body,
	      data, // ID04112024.n
	      req.body.user // ID04112024.n
            ];

            await promptDao.storeEntity(
              0,
              values
            );
          };
          // ID03012024.en

	  respMessage = {
	    http_code: status,
	    cached: false,
	    data: data
	  };

          return(respMessage);
        }
        else if ( status === 429 ) { // endpoint is busy so try next one
          data = await response.json();

	  let retryAfterSecs = response.headers.get('retry-after');
	  // let retryAfterMs = headers.get('retry-after-ms');

	  if ( retryAfter > 0 )
	    retryAfter = (retryAfterSecs < retryAfter) ? retryAfterSecs : retryAfter;
	  else
	    retryAfter = retryAfterSecs;

	  metricsObj.updateFailedCalls(status,retryAfterSecs);

          // console.log(`*****\nAzOaiProcessor.processRequest():\n  App Id: ${config.appId}\n  Request ID: ${req.id}\n  Target Endpoint: ${element.uri}\n  Status: ${status}\n  Message: ${JSON.stringify(data)}\n  Status Text: ${statusText}\n  Retry seconds: ${retryAfterSecs}\n*****`);
	  logger.log({level: "warn", message: "[%s] %s.processRequest():\n  App Id: %s\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Message: %s\n  Retry seconds: %d", splat: [scriptName,this.constructor.name,config.appId,req.id,element.uri,status,response.statusText,data,retryAfterSecs]});
        }
        else if ( status === 400 ) { // Invalid prompt ~ content filtered
          data = await response.json();

          // ID03012024.sn
          let persistPrompts = (process.env.API_GATEWAY_PERSIST_PROMPTS === 'true') ? true : false
          if ( persistPrompts ) { // Persist prompts ?
            let promptDao = new PersistDao(persistdb, tblNames.prompts);
            let values = [
              req.id,
              config.appId,
              req.body,
	      data, // ID04112024.n
	      req.body.user // ID04112024.n
            ];

            await promptDao.storeEntity(
              0,
              values
            );
          };
          // ID03012024.en

          // console.log(`*****\nAzOaiProcessor.processRequest():\n  App Id: ${config.appId}\n  Request ID: ${req.id}\n  Target Endpoint: ${element.uri}\n  Status: ${status}\n  Message: ${JSON.stringify(data)}\n  Status Text: ${statusText}\n*****`);
	  logger.log({level: "warn", message: "[%s] %s.processRequest():\n  App Id: %s\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Message: %s", splat: [scriptName,this.constructor.name,config.appId,req.id,element.uri,status,response.statusText,data]});

	  metricsObj.updateFailedCalls(status,0);
	  respMessage = {
	    http_code: status,
	    status_text: response.statusText,
	    data: data
	  };

          break;
        }
        else { // Authz failed
          data = await response.text();

          // console.log(`*****\nAzOaiProcessor.processRequest():\n  App Id: ${config.appId}\n  Request ID: ${req.id}\n  Target Endpoint: ${element.uri}\n  Status: ${status}\n  Message: ${JSON.stringify(data)}\n*****`);
	  logger.log({level: "warn", message: "[%s] %s.processRequest():\n  App Id: %s\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Message: %s", splat: [scriptName,this.constructor.name,config.appId,req.id,element.uri,status,response.statusText,data]});

	  metricsObj.updateFailedCalls(status,0);

	  err_msg = {
            appId: config.appId,
            reqId: req.id,
            targetUri: element.uri,
            http_code: status,
	    status_text: response.statusText,
	    data: data,
            cause: `AI Service endpoint returned exception message [${response.statusText}]`
          };
	
	  respMessage = {
	    http_code: status,
	    data: err_msg
	  };
        };
      }
      catch (error) {
        err_msg = {
	  appId: config.appId,
	  reqId: req.id,
	  targetUri: element.uri,
	  cause: error
	};
        // console.log(`*****\nAzOaiProcessor.processRequest():\n  Encountered exception:\n  ${JSON.stringify(err_msg)}\n*****`)
	logger.log({level: "error", message: "[%s] %s.processRequest():\n  Encountered exception:\n  %s", splat: [scriptName,this.constructor.name,err_msg]});

	respMessage = {
          http_code: 500,
	  data: err_msg
	};

        break; // ID04172024.n
      };
    }; // end of endpoint loop

    // instanceFailedCalls++;

    if ( retryAfter > 0 ) {
      err_msg = {
        endpointUri: req.originalUrl,
        currentDate: new Date().toLocaleString(),
        errorMessage: `All backend OAI endpoints are too busy! Retry after [${retryAfter}] seconds ...`
      };

      // res.set('retry-after', retryAfter); // Set the retry-after response header
      respMessage = {
        http_code: 429, // Server is busy, retry later!
        data: err_msg,
	retry_after: retryAfter
      };
    }
    else {
      if ( respMessage == null ) {
        err_msg = {
          endpointUri: req.originalUrl,
          currentDate: new Date().toLocaleString(),
          errorMessage: "Internal server error. Unable to process request. Check server logs."
        };
	respMessage = {
	  http_code: 500, // Internal API Gateway server error!
	  data: err_msg
	};
      };
    };

    return(respMessage);
  } // end of processRequest()
}

module.exports = AzOaiProcessor;
