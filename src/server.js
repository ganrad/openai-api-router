const fs = require("fs");
const express = require("express");
const app = express();
const apirouter = require("./apirouter");
var morgan = require('morgan');

const host = "localhost";
const port = 8000;
const endpoint = "/api/v1/" + process.env.API_ROUTER_ENV;

// var context = fs.readFileSync("./api-router-config.json");
// console.log("Router config:\n" + context);

var context = null;
fs.readFile("./api-router-config.json", (error, data) => {
  if (error) {
    console.log(error);
    return; // exit program
  };
  context = JSON.parse(data);
  context.endpoints.forEach((element) => {
    for (var key in element)
      console.log(key,element[key]);
  });
});

app.use(morgan('combined'));

app.get(endpoint + "/healthz", (req, res) => {
  res.status(200).send("All OK!");
});

app.use(endpoint + "/apirouter", apirouter);

app.listen(port, () => {
  console.log(`OpenAI API Router uri: http://${host}:${port}${endpoint}`);
});

