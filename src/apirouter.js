const express = require("express")
const router = express.Router();

router.get("/status", (req, res) => {
  res_obj = { endpoint: "/status", date: new Date().toLocaleString(), status : "OK" };
  res.status(200).json(res_obj);
});

router.get("/reconfig", (req, res) => {
  res_obj = { endpoint: "/reconfig", date: new Date().toLocaleString(), status : "OK" };
  res.status(200).json(res_obj);
});

router.get("/lb", (req, res) => {
  const eps = req.targeturis;
  eps.endpoints.forEach((element) => {
      console.log(`Router=apirouter()\nEndpoint=/lb\nuri=${element.uri}\napikey=${element.apikey}`);
  });
  // err_obj = { endpoint: "/lb", date: new Date().toLocaleString(), err_msg: "Server is too busy!" }
  // res.status(503).json(err_obj);
  res_obj = { endpoint: "/lb", date: new Date().toLocaleString(), status : "OK" };
  res.status(200).json(res_obj);
});

module.exports = router;
