const fs = require("fs");
const express = require("express");
const apirouter = require("./apirouter");
const app = express();
var bodyParser = require('body-parser');
// var morgan = require('morgan');

// Configure pinojs logger
const log_level = process.env.API_GATEWAY_LOG_LEVEL;
// console.log(`Log level set to: ${log_level ? log_level : 'info'}`);
const logger = require('pino-http')({
  useLevel: log_level ? log_level : 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

const host = process.env.API_GATEWAY_HOST;
const port = process.env.API_GATEWAY_PORT;
const endpoint = "/api/v1/" + process.env.API_GATEWAY_ENV;

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

// const log_mode = process.env.API_ROUTER_LOG_MODE;
// app.use(morgan(log_mode ? log_mode : 'combined'));
app.use(bodyParser.json());

app.get(endpoint + "/healthz", (req, res) => {
  logger(req,res)
  resp_obj = { endpoint: "/healthz", date: new Date().toLocaleString(), status : "OK" };
  res.status(200).json(resp_obj);
});

app.use(endpoint + "/apirouter", function(req, res, next) {
  // Add logger
  logger(req,res);
  // Add the target uri's to the request object
  req.targeturis = context;
  next();
}, apirouter);

app.listen(port, () => {
  console.log(`Server(): OpenAI API Gateway server started successfully. Endpoint uri: http://${host}:${port}${endpoint}`);
});

