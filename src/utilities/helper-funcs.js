/**
 * Name: Misc Helper Functions
 * Description: This script contains misc. helper functions.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 02-20-2024
 *
 * Notes:
 * ID04272024: ganrad: Centralized logging with winstonjs
 * ID09122024: ganrad: (Bugfix) Logging statement had undefined variable 'config'.
 * ID01312025: ganrad: v2.1.1: (Bugfix) Standardize on nodejs fetch for outbound http calls.
 *
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');

// const fetch = require("node-fetch"); ID01312025.o

async function callRestApi(requestid, uname, epinfo, endpoints, prompt) {
  let retryAfter = 0;
  let reqBody = {
    input: prompt,
    user: uname
  };

  let data;
  for (const element of endpoints) {
    let metricsObj = epinfo.get(element.uri);
    let healthArr = metricsObj.isEndpointHealthy();

    if (!healthArr[0]) {
      if (retryAfter > 0)
        retryAfter = (healthArr[1] < retryAfter) ? healthArr[1] : retryAfter;
      else
        retryAfter = healthArr[1];
      continue;
    };

    let stTime = Date.now();
    let response = null;
    try {
      response = await fetch(element.uri, {
        method: 'post',
        headers: { 'Content-Type': 'application/json', 'api-key': element.apikey },
        body: JSON.stringify(reqBody)
      });

      let status = response.status;
      if (status === 200) {
        data = await response.json();

        let respTime = Date.now() - stTime;
        metricsObj.updateApiCallsAndTokens(
          data.usage.total_tokens,
          respTime);

        // console.log(`callRestApi():\n  Request ID: ${requestid}\n  Target Endpoint: ${element.uri}\n  Status: ${status}\n  Status Text: ${statusText}\n  Execution Time: ${Date.now() - stTime}\n*****`);
        logger.log({ level: "info", message: "[%s] callRestApi():\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Execution Time: %d", splat: [scriptName, requestid, element.uri, status, response.statusText, Date.now() - stTime] });

        return data.data[0]; // 200 All OK
      }
      else if (status === 429) {
        data = await response.json();

        let retryAfterSecs = response.headers.get('retry-after');
        if (retryAfter > 0)
          retryAfter = (retryAfterSecs < retryAfter) ? retryAfterSecs : retryAfter;
        else
          retryAfter = retryAfterSecs;
        metricsObj.updateFailedCalls(retryAfterSecs);

        logger.log({ level: "warn", message: "[%s] callRestApi():\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Message: %s\n  Status Text: %s\n  Retry seconds: %d", splat: [scriptName, requestid, element.uri, status, data, response.statusText, retryAfterSecs] });
      }
      else { // Authzn failed!
        data = await response.text();

        // logger.log({level: "warn", message: "[%s] %s.processRequest():\n  App Id: %s\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Message: %s", splat: [scriptName,this.constructor.name,config.appId,req.id,element.uri,status,response.statusText,data]}); // ID09122024.o
        logger.log({ level: "warn", message: "[%s] callRestApi():\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Message: %s", splat: [scriptName, requestid, element.uri, status, response.statusText, data] }); // ID09122024.n
      };
    }
    catch (error) {
      err_msg = { targetUri: element.uri, cause: error };
      // console.log(`callRestApi():\n  Request ID: {requestid}\n  Encountered exception:\n${err_msg}`);
      logger.log({ level: "error", message: "[%s] callRestApi():\n  Request ID: %s\n  Encountered exception:\n%s", splat: [scriptName, requestid, err_msg] });
    };
  }; // end of for

  return null;
}

function prepareTextToEmbedd(
  requestid,
  term,
  roles,
  body) {
  let content = "";

  let stTime = Date.now();
  if (term === "prompt") {
    let prompts = body.prompt;

    if (Array.isArray(prompts)) {
      for (const element of prompts) {
        content += element;
        content += " ";
      };
    }
    else
      content = prompts;
  }
  else { // term === "messages"
    roles = roles.replace(/\s/g, ''); // remove spaces
    let roleArr = roles.split(','); // convert roles into an array

    for (const element of body.messages) {
      if (roleArr.includes(element.role))
        if (typeof element.content === "string")
          content += element.content;
    };
  };

  // console.log(`*****\nprepareTextToEmbedd():\n  Request ID: ${requestid}\n  Term: ${term}\n  Roles: ${roles}\n  Content: ${content}\n  Execution Time: ${Date.now() - stTime}\n*****`);
  logger.log({ level: "debug", message: "[%s] prepareTextToEmbedd():\n  Request ID: %s\n  Term: %s\n  Roles: %s\n  Content: %s\n  Execution Time: %s", splat: [scriptName, requestid, term, roles, content, Date.now() - stTime] });

  return content;
}

module.exports = {
  prepareTextToEmbedd,
  callRestApi
}
