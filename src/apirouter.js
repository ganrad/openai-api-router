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
  // eps.endpoints.forEach((element) => {
  for (const element of eps.endpoints) {
    console.log(`****Router=apirouter()****\nMethod=${req.method}\nBody=${req.body}\nEndpoint=/lb\nuri=${element.uri}\napikey=${element.apikey}\n*****`);
    try {
      // req.pipe(request(targetUrl)).pipe(res);
      response = await fetch(element.uri, {
        method: req.method,
	headers: {'Content-Type': 'application/json', 'api-key': element.apikey},
        body: req.body
      });
      if (response.ok)
        break;
    }
    catch (error) {
      console.log(`****Router=apirouter()****\nEndpoint=/lb\nuri=${element.uri}\nerror=${error}\n*****`);
    };
  };
  if (response) {
    const data = await response.json();
    res.status(200).json(response);
  }
  else {
    err_obj = { endpoint: "/lb", date: new Date().toLocaleString(), err_msg: "Servers are too busy!" }
    res.status(503).json(err_obj);
  };
  // res_obj = { endpoint: "/lb", date: new Date().toLocaleString(), status : "OK" };
  // res.status(200).json(res_obj);
});

module.exports = router;
