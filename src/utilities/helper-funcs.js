/**
 * Name: Misc Helper Functions
 * Description: This script contains misc. helper functions.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 02-20-2024
 *
 * Notes:
 *
*/
const fetch = require("node-fetch");

async function callRestApi(requestid, uname, epinfo, endpoints, prompt) {
  let retryAfter = 0;
  let reqBody = {
    input: prompt,
    user: uname
  };

  for (const element of endpoints) {
    let metricsObj = epinfo.get(element.uri);
    let healthArr = metricsObj.isEndpointHealthy();

    if ( ! healthArr[0] ) {
      if ( retryAfter > 0 )
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
        headers: {'Content-Type': 'application/json', 'api-key': element.apikey},
        body: JSON.stringify(reqBody)
      });
      data = await response.json();

      let { status, statusText, headers } = response;
      if ( status === 200 ) {
        let respTime = Date.now() - stTime;
        metricsObj.updateApiCallsAndTokens(
          data.usage.total_tokens,
          respTime);

        console.log(`callRestApi():\n  Request ID: ${requestid}\n  Target Endpoint: ${element.uri}\n  Status: ${status}\n  Status Text: ${statusText}\n  Execution Time: ${Date.now() - stTime}\n*****`);

        return data.data[0]; // 200 All OK
      }
      else if ( status === 429 ) {
        let retryAfterSecs = headers.get('retry-after');
        if ( retryAfter > 0 )
          retryAfter = (retryAfterSecs < retryAfter) ? retryAfterSecs : retryAfter;
        else
          retryAfter = retryAfterSecs;
        metricsObj.updateFailedCalls(retryAfterSecs);

        console.log(`callRestApi():\n  Request ID: ${requestid}\n  Target Endpoint: ${element.uri}\n  Status: ${status}\n  Message: ${JSON.stringify(data)}\n  Status Text: ${statusText}\n  Retry seconds: ${retryAfterSecs}\n*****`);
      };
    }
    catch (error) {
      err_msg = {targetUri: element.uri, cause: error};
      console.log(`callRestApi():\n  Request ID: {requestid}\n  Encountered exception:\n${err_msg}`);
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
  if ( term === "prompt" ) {
    let prompts = body.prompt;

    if ( Array.isArray(prompts) ) {
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
      if ( roleArr.includes(element.role) )
        if ( typeof element.content === "string" )
          content += element.content;
    };
  };

  console.log(`*****\nprepareTextToEmbedd():\n  Request ID: ${requestid}\n  Term: ${term}\n  Roles: ${roles}\n  Content: ${content}\n  Execution Time: ${Date.now() - stTime}\n*****`);

  return content;
}

module.exports = {
  prepareTextToEmbedd,
  callRestApi
}
