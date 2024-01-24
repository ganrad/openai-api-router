const fetch = require("node-fetch");
const express = require("express");
const router = express.Router();

router.get("/status", (req, res) => {
  res_obj = { endpoint: "/status", date: new Date().toLocaleString(), status : "OK" };
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
  // eps.endpoints.forEach((element) => {
  for (const element of eps.endpoints) {
    // console.log(`****Router=apirouter()****\nBody=${JSON.stringify(req.body)}\n*****`);
    // console.log(`****Router=apirouter()****\nMethod=${req.method}\nEndpoint=/lb\nUri=${element.uri}\nApi-key=${element.apikey}\n*****`);
    // req.log.info(`Target uri: ${element.uri}`);
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
      // if (response.ok)
        res.status(200).json(data);
        return;
      }
      else if ( status === 429 ) {
        console.log(`*****\napirouter():\nTarget Endpoint=${element.uri}\nStatus=${status}\nMessage=${JSON.stringify(data)}\n*****`);
      };
    }
    catch (error) {
      err_msg = { targetUri: element.uri, msg: error };
      req.log.warn(err_msg);
      // console.log(`****Router=apirouter()****\nEndpoint=/lb\nuri=${element.uri}\nerror=${error}\n*****`);
    };
  };
  err_obj = { endpoint: "/lb", date: new Date().toLocaleString(), err_msg: "All backend servers are too busy! Retry after some time..." }
  res.status(503).json(err_obj);
});

module.exports = router;
