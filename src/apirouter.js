/**
 * Name: API Gateway/Router
 * Description: An intelligent stateful API gateway that routes incoming requests to backend 
 * OpenAI deployment resources based on 1) Priority and 2) Availability
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 01-28-2024
 *
 * Notes:
 * ID02132024: ganrad : Use a single data plane to serve Azure OpenAI models for multiple AI applications.
 * ID02202024: ganrad : Introduced semantic caching / retrieval functionality.
*/
const fetch = require("node-fetch");
const express = require("express");
const EndpointMetrics = require("./utilities/ep-metrics.js");
const AppConnections = require("./utilities/app-connection.js");
const AppCacheMetrics = require("./utilities/cache-metrics.js"); // ID02202024.n
const CacheDao = require("./utilities/cache-dao.js"); // ID02202024.n
const pgdb = require("./services/cp-pg.js"); // ID02202024.n
const pgvector = require("pgvector/pg"); // ID02202024.n
const router = express.Router();

// Total API calls handled by this router instance
// Includes (successApicalls + cachedCalls)
var instanceCalls = 0;

// Failed API calls ~ when all target endpoints are operating at full capacity ~
// max. pressure
var instanceFailedCalls = 0;

// API calls served from cache (vector db)
var cachedCalls = 0; // ID02202024.n

// ID02132024.n - Init the AppConnections instance 
let appConnections = new AppConnections();

// ID02202024.n - Init the AppCacheMetrics instance
let cacheMetrics = new AppCacheMetrics();

// Metrics endpoint
router.get("/metrics", (req, res) => {
  let conList = [];
  appConnections.getAllConnections().forEach(function(epdata, ky) {
    let priorityIdx = 0;
    let epDict = [];
    epdata.forEach(function(value, key) {
      let dict = {
        endpoint: key,
        priority: priorityIdx,
        metrics: value.toJSON()
      };
      epDict.push(dict);
      priorityIdx++;
    });

    let conObject = {
      applicationId: ky,
      endpointMetrics: epDict
    };
    conList.push(conObject);
  });

  let res_obj = {
    hostName: process.env.API_GATEWAY_HOST,
    listenPort: process.env.API_GATEWAY_PORT,
    instanceName: process.env.API_GATEWAY_NAME,
    collectionInterval: Number(process.env.API_GATEWAY_METRICS_CINTERVAL),
    historyCount: Number(process.env.API_GATEWAY_METRICS_CHISTORY),
    applicationMetrics: conList,
    cacheMetrics: cacheMetrics.getCacheMetrics(),
    successApiCalls: (instanceCalls - instanceFailedCalls),
    cachedApiCalls: cachedCalls, // ID02202024.n
    failedApiCalls: instanceFailedCalls,
    totalApiCalls: instanceCalls,
    endpointUri: req.originalUrl,
    currentDate: new Date().toLocaleString(),
    status: "OK"
  };

  res.status(200).json(res_obj);
});

// Intelligent router endpoint
router.post("/lb/:app_id", async (req, res) => {
  const eps = req.targeturis;
  const cdb = req.cacheconfig;

  let response;
  let data;
  let retryAfter = 0;
  let err_obj = null;

  let appId = req.params.app_id; // The AI Application ID
  if ( ! appConnections.loaded ) {
    for (const application of eps.applications) {
      // Target endpoint metrics cache -
      let epinfo = new Map();
      for (const element of application.endpoints) {
        epinfo.set(
          element.uri,
          new EndpointMetrics(
            element.uri,
            process.env.API_GATEWAY_METRICS_CINTERVAL,
            process.env.API_GATEWAY_METRICS_CHISTORY));
      };
      appConnections.addConnection(application.appId, epinfo);
      if ( cdb.cacheResults && (application.appId !== cdb.embeddApp) )
        cacheMetrics.addAiApplication(application.appId); // ID02202024.n
    };
    appConnections.loaded = true;
  };

  if ( ! appConnections.getAllConnections().has(appId) ) {
    err_obj = {
      endpointUri: req.originalUrl,
      currentDate: new Date().toLocaleString(),
      err_msg: `Application ID [${appId}] not found. Unable to process request.`
    };

    res.status(400).json(err_obj); // 400 = Bad request
    return;
  };

  let r_stream = req.body.stream;
  if ( r_stream ) { // no streaming support!
    err_obj = {
      endpointUri: req.originalUrl,
      currentDate: new Date().toLocaleString(),
      err_msg: "Stream mode is not yet supported! Unable to process request."
    };

    res.status(400).json(err_obj); // 400 = Bad request
    return;
  }; 

  instanceCalls++;
  
  // ID02202024.sn
  let appEndpoints = null;
  let useCache = false;
  let srchType = null;
  let srchDistance = null;
  let srchContent = null;
  for (const application of eps.applications) {
    if ( application.appId === appId ) {
      appEndpoints = application.endpoints;
      useCache = application.cacheSettings.useCache;
      srchType = application.cacheSettings.searchType;
      srchDistance = application.cacheSettings.searchDistance;
      srchContent = application.cacheSettings.searchContent;

      break;
    };
  };

  // Has caching been disabled on the request using query param ~
  // 'use_cache=false' ?
  if ( useCache && req.query.use_cache )
    useCache = req.query.use_cache == 'false' ? false : useCache;  

  let vecEndpoints = null;
  let embeddedPrompt = null;
  let dao = null;
  if ( cdb.cacheResults && useCache ) { // Is caching enabled?
    for ( const application of eps.applications) {
      if ( application.appId == cdb.embeddApp ) {
        vecEndpoints = application.endpoints;

        break;
      };
    };

    // Perform semantic search using input prompt
    dao = new CacheDao(
      appConnections.getConnection(cdb.embeddApp),
      vecEndpoints,
      srchType,
      srchDistance,
      srchContent);

    const {rowCount, simScore, completion, embeddings} = 
      // await dao.queryDB(req.body.prompt,pgdb);
      await dao.queryVectorDB(
        req.id,
        appId,
        req.body,
        pgdb);

    if ( rowCount === 1 ) { // Cache hit!
      cachedCalls++;
      cacheMetrics.updateCacheMetrics(appId, simScore);

      res.status(200).json(completion); // 200 = All OK

      return;
    }
    else
      embeddedPrompt = embeddings;
  };
  // ID02202024.en

  let epdata = appConnections.getConnection(appId);
  let stTime = Date.now();
  for (const element of appEndpoints) {
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
      // req.pipe(request(targetUrl)).pipe(res);
      response = await fetch(element.uri, {
        method: req.method,
	headers: {'Content-Type': 'application/json', 'api-key': element.apikey},
        body: JSON.stringify(req.body)
      });
      data = await response.json();

      let { status, statusText, headers } = response;
      if ( status === 200 ) {
        let respTime = Date.now() - stTime;
	metricsObj.updateApiCallsAndTokens(
          data.usage.total_tokens,
          respTime);

        if ( dao && embeddedPrompt ) { // Cache results ?
          let values = [
            appId,
            req.body.prompt,
            pgvector.toSql(embeddedPrompt),
            data
          ];
          await dao.storeEntity(0,values,pgdb);
        };

        res.status(200).json(data); // 200 = All OK

        return;
      }
      else if ( status === 429 ) {
	let retryAfterSecs = headers.get('retry-after');
	// let retryAfterMs = headers.get('retry-after-ms');

	if ( retryAfter > 0 )
	  retryAfter = (retryAfterSecs < retryAfter) ? retryAfterSecs : retryAfter;
	else
	  retryAfter = retryAfterSecs;

	metricsObj.updateFailedCalls(retryAfterSecs);

        console.log(`*****\napirouter():\n  App Id=${appId}\n  Target Endpoint=${element.uri}\n  Status=${status}\n  Message=${JSON.stringify(data)}\n  Status Text=${statusText}\n  Retry seconds=${retryAfterSecs}\n*****`);
      };
    }
    catch (error) {
      err_msg = {targetUri: element.uri, cause: error};
      // throw new Error("Encountered exception", {cause: error});
      // metricsObj.updateFailedCalls();
      req.log.warn({err: err_msg});
    };
  }; // end of for

  instanceFailedCalls++;
  let http_code = 503; // 503 = (Default) Server is busy!

  if ( retryAfter > 0 ) {
    err_obj = {
      endpointUri: req.originalUrl,
      currentDate: new Date().toLocaleString(),
      err_msg: `All backend servers are too busy! Retry after [${retryAfter}] seconds ...`
    };

    res.set('retry-after', retryAfter); // Set the retry-after response header
  }
  else {
    err_obj = {
      endpointUri: req.originalUrl,
      currentDate: new Date().toLocaleString(),
      err_msg: "Internal server error. Unable to process request. Check logs."
    };

    http_code = 500 // 500 = Internal server error
  };
    
  res.status(http_code).json(err_obj);
});

module.exports.apirouter = router;
module.exports.reconfigEndpoints = function () {
  // reset total, cached and failed api calls
  instanceCalls = 0;
  cachedCalls = 0;
  instanceFailedCalls = 0;

  appConnections = new AppConnections(); // reset the application connections cache;
  cacheMetrics = new AppCacheMetrics(); // reset the application cache metrics
  console.log("apirouter(): Application connections and metrics cache has been successfully reset");
}
