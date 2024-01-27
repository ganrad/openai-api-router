const fetch = require("node-fetch");
const express = require("express");
const EndpointMetrics = require("./utilities/ep-metrics.js");
const router = express.Router();

// Target endpoint metrics cache -
const epdata = new Map();

// Total api calls handled by this router instance
var instanceCalls = 0;
// Failed calls ~ when all target endpoints are operating at full capacity ~ max. pressure
var instanceFailedCalls = 0;

router.get("/metrics", (req, res) => {
  let epDict = [];
  epdata.forEach(function(value, key) {
    dict = {
      endpoint: key,
      inferenceTokens: value.apiTokens,
      apiCalls: value.apiCalls,
      failedCalls: value.failedCalls,
      totalCalls: value.totalCalls
    };
    epDict.push(dict);
  });

  let instName = process.env.API_GATEWAY_NAME;
  let metricsObj = { metrics: epDict };
  let res_obj = {
    hostName: process.env.API_GATEWAY_HOST,
    listenPort: process.env.API_GATEWAY_PORT,
    instanceName: instName,
    endpoint: "/metrics",
    data: metricsObj,
    totalCalls: instanceCalls,
    failedCalls: instanceFailedCalls,
    date: new Date().toLocaleString(),
    status: "OK"
  };

  res.status(200).json(res_obj);
});

router.get("/reconfig", (req, res) => {
  res_obj = { endpoint: "/reconfig", date: new Date().toLocaleString(), status : "OK" };

  res.status(200).json(res_obj);
});

router.post("/lb", async (req, res) => {
  const eps = req.targeturis;
  let response;
  let data;

  instanceCalls++;

  for (const element of eps.endpoints) {
    if ( ! epdata.has(element.uri) )
      epdata.set(element.uri, new EndpointMetrics(element.uri));

    let metricsObj = epdata.get(element.uri);
    metricsObj.incrementTotalCalls();

    try {
      // req.pipe(request(targetUrl)).pipe(res);
      response = await fetch(element.uri, {
        method: req.method,
	headers: {'Content-Type': 'application/json', 'api-key': element.apikey},
        body: JSON.stringify(req.body)
      });
      data = await response.json();

      let { status } = response;
      if ( status === 200 ) {
	metricsObj.incrementApiCalls();

        metricsObj.apiTokens = data.usage.total_tokens;

        res.status(200).json(data);
        return;
      }
      else if ( status === 429 ) {
	metricsObj.incrementFailedCalls();
        console.log(`*****\napirouter():\nTarget Endpoint=${element.uri}\nStatus=${status}\nMessage=${JSON.stringify(data)}\n*****`);
      };
    }
    catch (error) {
      err_msg = {targetUri: element.uri, cause: error};
      // throw new Error("Encountered exception", {cause: error});
      metricsObj.incrementFailedCalls();
      req.log.warn({err: err_msg});
    };
  };

  instanceFailedCalls++;
  err_obj = { endpoint: "/lb", date: new Date().toLocaleString(), err_msg: "All backend servers are too busy! Retry after some time..." }

  res.status(503).json(err_obj);
});

module.exports = router;
