/**
 * Name: API Gateway/Router
 * Description: An intelligent stateful API gateway that routes incoming requests to backend 
 * OpenAI deployment resources based on 1) Priority and 2) Availability
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 01-28-2024
 *
 * Notes:
 * ID02132024: ganrad : Use a single data plane to server Azure OpenAI models for multiple AI applications.
*/
const fetch = require("node-fetch");
const express = require("express");
const EndpointMetrics = require("./utilities/ep-metrics.js");
const AppConnections = require("./utilities/app-connection.js");
const router = express.Router();

// Total api calls handled by this router instance
var instanceCalls = 0;
// Failed calls ~ when all target endpoints are operating at full capacity ~ max. pressure
var instanceFailedCalls = 0;

// ID02132024.n - Init the AppConnections instance 
let appConnections = new AppConnections();

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
    successApiCalls: (instanceCalls - instanceFailedCalls),
    failedApiCalls: instanceFailedCalls,
    totalApiCalls: instanceCalls,
    endpointUri: req.originalUrl,
    currentDate: new Date().toLocaleString(),
    status: "OK"
  };

  res.status(200).json(res_obj);
});

router.post("/lb/:app_id", async (req, res) => {
  const eps = req.targeturis;
  let response;
  let data;
  let retryAfter = 0;

  let appId = req.params.app_id;
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

  instanceCalls++;
  let epdata = appConnections.getConnection(appId);
  
  let appEndpoints = null;
  for (const application of eps.applications)
    if ( application.appId === appId )
      appEndpoints = application.endpoints;

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

        res.status(200).json(data); // 200 = All OK
        return;
      }
      else if ( status === 429 ) {
	let retryAfterSecs = headers.get('retry-after');
	let retryAfterMs = headers.get('retry-after-ms');

	if ( retryAfter > 0 )
	  retryAfter = (retryAfterSecs < retryAfter) ? retryAfterSecs : retryAfter;
	else
	  retryAfter = retryAfterSecs;

	metricsObj.updateFailedCalls(retryAfterSecs);
        console.log(`*****\napirouter():\nApp Id=${appId}\nTarget Endpoint=${element.uri}\nStatus=${status}\nMessage=${JSON.stringify(data)}\nStatus Text=${statusText}\nRetry MS=${retryAfterMs}\nRetry seconds=${retryAfterSecs}\n*****`);
      };
    }
    catch (error) {
      err_msg = {targetUri: element.uri, cause: error};
      // throw new Error("Encountered exception", {cause: error});
      metricsObj.updateFailedCalls();
      req.log.warn({err: err_msg});
    };
  }; // end of for

  instanceFailedCalls++;
  err_obj = {
    endpointUri: req.originalUrl,
    currentDate: new Date().toLocaleString(),
    err_msg: `All backend servers are too busy! Retry after [${retryAfter}] seconds ...`
  };

  res.set('retry-after', retryAfter); // Set the retry-after response header
  res.status(503).json(err_obj); // 503 = Server is busy
});

module.exports.apirouter = router;
module.exports.reconfigEndpoints = function () {
  // reset total and failed api calls
  instanceCalls = 0;
  instanceFailedCalls = 0;

  appConnections = new AppConnections(); // reset the application connections cache;
  console.log("apirouter(): Application connections cache has been successfully reset");
}
