const fs = require("fs");
const express = require("express");
const apirouter = require("./apirouter");
const app = express();
var bodyParser = require('body-parser');
var morgan = require('morgan');

const host = "localhost";
const port = 8000;
const endpoint = "/api/v1/" + process.env.API_ROUTER_ENV;

var context;
fs.readFile("./api-router-config.json", (error, data) => {
  if (error) {
    console.log(error);
    return; // exit program
  };
  context = JSON.parse(data);
  /*
  context.endpoints.forEach((element) => {
    for (var key in element)
      console.log(key,element[key]);
  });
  */
});

const log_mode = process.env.API_ROUTER_LOG_MODE;
app.use(morgan(log_mode ? log_mode : 'combined'));
app.use(bodyParser.json());

app.get(endpoint + "/healthz", (req, res) => {
  resp_obj = { endpoint: "/healthz", date: new Date().toLocaleString(), status : "OK" };
  res.status(200).json(resp_obj);
});

app.use(endpoint + "/apirouter", function(req, res, next) {
  // Add the target uri's to the request object
  req.targeturis = context;
  next();
}, apirouter);

app.listen(port, () => {
  console.log(`Server(): OpenAI API Gateway server started successfully. Endpoint uri: http://${host}:${port}${endpoint}`);
});

