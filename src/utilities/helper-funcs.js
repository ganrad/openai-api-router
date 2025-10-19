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
 * ID03052025: ganrad: v2.3.0: (Bugfix) Use MID auth for Azure AI Service(s) when it is enabled & configured for the runtime.
 * (Refinement) Renamed vector function to a more meaningful name.
 * ID05142025: ganrad: v2.3.8: (Enhancement) Introduced user personalization feature ~ Long term memory. Added new function
 * to invoke an AI App (LLM).
 * ID08252025: ganrad: v2.5.0: (Enhancement) Introduced cost tracking (/ budgeting) for models deployed on Azure AI Foundry.
 * ID08272025: ganrad: v2.5.0: (Refactoring) Added function to set request headers for AI Foundry + OAI model API calls.
 * ID09162025: ganrad: v2.6.0: (Refactoring) Updated 'getOpenAICallMetadata()' function to set headers for AOAI + AI Foundry + OAI model API Calls.
 * ID09172025: ganrad: v2.6.0: (Refactoring) Introduced a new method to retrieve unique URI for endpoint metrics object based on the application type.
 * ID10142025: ganrad: v2.7.0: (Enhancement) Introduced new feature to support normalization of AOAI output.
 * ID10182025: ganrad: v2.7.5: (Enhancement) Introduced support for MSFT Agent Framework.
 *
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');
const { getAccessToken } = require("../auth/bootstrap-auth.js"); // ID08272025.n
const {
  AzAiServices,
  OpenAIBaseUri,
  AzureResourceUris
} = require("./app-gtwy-constants.js"); // ID08272025.n

// const fetch = require("node-fetch"); ID01312025.o

async function getOpenAICallMetadata(req, element, appType) { // ID08272025.n
  const meta = new Map();
  meta.set('Content-Type', 'application/json');

  let bearerToken = req.headers['Authorization'] || req.headers['authorization'];
  // if (appType === AzAiServices.OAI) { // ID09162025.o

  if (bearerToken && !req.authInfo) { // Authorization header present; Use MID Auth + Ensure AI App Gateway is not configured with Entra ID
    if (process.env.AZURE_AI_SERVICE_MID_AUTH === "true")
      bearerToken = await getAccessToken(req, AzureResourceUris.AzureCognitiveServices);
    meta.set('Authorization', bearerToken);
    logger.log({ level: "debug", message: "[%s] getOpenAICallMetadata(): Using bearer token (MID-IMDS) for Az OAI Auth.\n  Request ID: %s", splat: [scriptName, req.id] });
  }
  else { // Use API Key Auth
    if (process.env.AZURE_AI_SERVICE_MID_AUTH === "true") {
      bearerToken = await getAccessToken(req, AzureResourceUris.AzureCognitiveServices);
      meta.set('Authorization', bearerToken);
      logger.log({ level: "debug", message: "[%s] getOpenAICallMetadata(): Using bearer token (MID-IMDS) for Az OAI Auth.\n  Request ID: %s", splat: [scriptName, req.id] });
    }
    else {
      const authHdrKey = element.uri.includes(OpenAIBaseUri) || (appType === AzAiServices.AzAiModelInfApi) ? 'Authorization' : 'api-key'; // ID09162025.n
      const authHdrVal = element.uri.includes(OpenAIBaseUri) || (appType === AzAiServices.AzAiModelInfApi) ? "Bearer " + element.apikey : element.apikey; // ID09162025.n
      // meta.set('api-key', element.apikey);
      meta.set(authHdrKey, authHdrVal);
      logger.log({ level: "debug", message: "[%s] getOpenAICallMetadata(): Using API Key for Az OAI Auth.\n  Request ID: %s", splat: [scriptName, req.id] });
    };
  };

  /** ID09162025.so
  }
  else { // ~ Az Ai Model Inference API models
    if (bearerToken && !req.authInfo) // Authorization header present; Use MID Auth + Ensure AI App Gateway is not configured with Entra ID
      meta.set('Authorization', bearerToken);
    else // Use API Key Auth
      meta.set('Authorization', "Bearer " + element.apikey);
    
    delete req.body.presence_penalty;
    delete req.body.frequency_penalty; 
    meta.set('extra-parameters', 'drop'); // Drop any parameters the model doesn't understand; Don't return an error!
    logger.log({ level: "debug", message: "[%s] getOpenAICallMetadata(): Using API Key for Az OAI Auth.\n  Request ID: %s", splat: [scriptName, req.id] });
  };
  ID09162025.eo */

  return (meta);
}

/**
 * ID05142025.n
 * This function calls an AI App (LLM) endpoint.
 * 
 * @param {*} req The AI App Gateway request object
 * @param {*} epinfo AI App Endpoint metrics object
 * @param {*} endpoints AI App Endpoint object
 * @param {*} messages LLM request/payload
 * @returns 
 */
async function callAiAppEndpoint(
  req,
  epinfo,
  endpoints,
  messages,
  appType) { // ID08272025.n
  logger.log({ level: "debug", message: "[%s] callAiAppEndpoint():\n  Request ID: %s\n  App Type: %s\n  Payload:\n  %s", splat: [scriptName, req.id, appType, JSON.stringify(messages, null, 2)] });

  let retryAfter = 0;

  let data;
  for (const element of endpoints) {
    // let metricsObj = epinfo.get(element.uri); ID09172025.o
    let metricsObj = epinfo.get(retrieveUniqueURI(element.uri, appType, element.id)); // ID09172025.n
    let healthArr = metricsObj.isEndpointHealthy(req.id);

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
      let hdrs = await getOpenAICallMetadata(req, element, appType); // ID08272025.n

      /** ID08272025.o
      const bearerToken = req.headers['Authorization']; 
      if ( bearerToken && !req.authInfo ) { // If Authorization header is present use MID Auth; + Ensure AI App Gateway is not configured with Entra ID!
        logger.log({ level: "debug", message: "[%s] callAiAppEndpoint(): Using bearer token for Az OAI Auth\n  Request ID: %s", splat: [scriptName, req.id] });
        hdrs = { 'Content-Type': 'application/json', 'Authorization': bearerToken };
      }
      else // Use API Key Auth
        hdrs = { 'Content-Type': 'application/json', 'api-key': element.apikey };
      */

      response = await fetch(
        element.uri, {
        method: 'post',
        headers: hdrs,
        body: JSON.stringify(messages)
      });

      let status = response.status;
      if (status === 200) {
        data = await response.json();

        let respTime = Date.now() - stTime;
        metricsObj.updateApiCallsAndTokens(
          // data.usage.total_tokens,
          req.id, // ID08252025.n
          data.usage, // ID08252025.n
          respTime);

        logger.log({ level: "info", message: "[%s] callAiAppEndpoint():\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Execution Time: %d", splat: [scriptName, req.id, element.uri, status, response.statusText, Date.now() - stTime] });

        return data; // 200 All OK
      }
      else if (status === 429) {
        data = await response.json();

        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterSecs = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0;
        if (!isNaN(retryAfterSecs) && retryAfterSecs > 0)
          retryAfter = retryAfter > 0 ? Math.min(retryAfter, retryAfterSecs) : retryAfterSecs;
        metricsObj.updateFailedCalls(status, retryAfterSecs);

        logger.log({ level: "warn", message: "[%s] callAiAppEndpoint():\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Message: %s\n  Status Text: %s\n  Retry seconds: %d", splat: [scriptName, req.id, element.uri, status, data, response.statusText, retryAfterSecs] });
      }
      else { // Authzn failed!
        data = await response.text();

        logger.log({ level: "warn", message: "[%s] callAiAppEndpoint():\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Message: %s", splat: [scriptName, req.id, element.uri, status, response.statusText, data] });
      };
    }
    catch (error) {
      const err_msg = { targetUri: element.uri, cause: error };

      logger.log({ level: "error", message: "[%s] callAiAppEndpoint():\n  Request ID: %s\n  Encountered exception:\n%s", splat: [scriptName, req.id, JSON.stringify(err_msg, null, 2)] });
    };
  }; // end of for endpoint loop

  return null;
}

// async function callRestApi(requestid, uname, epinfo, endpoints, prompt) { ID03052025.o
async function vectorizeQuery(req, epinfo, endpoints, prompt) { // ID03052025.n
  let retryAfter = 0;
  let reqBody = {
    input: prompt,
    // user: uname, ID03052025.o
    user: req.body.user // ID03052025.n
  };

  let data;
  for (const element of endpoints) {
    let metricsObj = epinfo.get(element.uri);  // Vector model endpoints should be unique!
    let healthArr = metricsObj.isEndpointHealthy(req.id);

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
      // ID03052025.sn
      let hdrs = await getOpenAICallMetadata(req, element, AzAiServices.OAI); // ID08252025.n;
      /** ID08272025.o
      const bearerToken = req.headers['Authorization']; 
      if ( bearerToken && !req.authInfo ) { // If Authorization header is present use MID Auth; + Ensure AI App Gateway is not configured with Entra ID!
        logger.log({ level: "debug", message: "[%s] vectorizeQuery(): Using bearer token for Az OAI Auth\n  Request ID: %s", splat: [scriptName, req.id] });
        hdrs = { 'Content-Type': 'application/json', 'Authorization': bearerToken };
      }
      else // Use API Key Auth
        hdrs = { 'Content-Type': 'application/json', 'api-key': element.apikey };
      */
      // ID03052025.en

      response = await fetch(element.uri, {
        method: 'post',
        // headers: { 'Content-Type': 'application/json', 'api-key': element.apikey }, ID03052025.o
        headers: hdrs, // ID03052025.n
        body: JSON.stringify(reqBody)
      });

      let status = response.status;
      if (status === 200) {
        data = await response.json();

        let respTime = Date.now() - stTime;
        metricsObj.updateApiCallsAndTokens(
          // data.usage.total_tokens,
          req.id, // ID08252025.n
          data.usage, // ID08252025.n
          respTime);

        // console.log(`callRestApi():\n  Request ID: ${requestid}\n  Target Endpoint: ${element.uri}\n  Status: ${status}\n  Status Text: ${statusText}\n  Execution Time: ${Date.now() - stTime}\n*****`);
        logger.log({ level: "info", message: "[%s] vectorizeQuery():\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Execution Time: %d", splat: [scriptName, req.id, element.uri, status, response.statusText, Date.now() - stTime] }); // ID03052025.n

        return data.data[0]; // 200 All OK
      }
      else if (status === 429) {
        data = await response.json();

        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterSecs = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0;
        if (!isNaN(retryAfterSecs) && retryAfterSecs > 0)
          retryAfter = retryAfter > 0 ? Math.min(retryAfter, retryAfterSecs) : retryAfterSecs;

        /**
        let retryAfterSecs = response.headers.get('retry-after');
        if (retryAfter > 0)
          retryAfter = (retryAfterSecs < retryAfter) ? retryAfterSecs : retryAfter;
        else
          retryAfter = retryAfterSecs;
        */
        metricsObj.updateFailedCalls(status, retryAfterSecs); // ID05142025.n

        logger.log({ level: "warn", message: "[%s] vectorizeQuery():\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Message: %s\n  Status Text: %s\n  Retry seconds: %d", splat: [scriptName, req.id, element.uri, status, data, response.statusText, retryAfterSecs] }); // ID03052025.n
      }
      else { // Authzn failed!
        data = await response.text();

        // logger.log({level: "warn", message: "[%s] %s.processRequest():\n  App Id: %s\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Message: %s", splat: [scriptName,this.constructor.name,config.appId,req.id,element.uri,status,response.statusText,data]}); // ID09122024.o
        logger.log({ level: "warn", message: "[%s] vectorizeQuery():\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Message: %s", splat: [scriptName, req.id, element.uri, status, response.statusText, data] }); // ID09122024.n, ID03052025.n
      };
    }
    catch (error) {
      err_msg = { targetUri: element.uri, cause: error };
      // console.log(`callRestApi():\n  Request ID: {requestid}\n  Encountered exception:\n${err_msg}`);
      logger.log({ level: "error", message: "[%s] vectorizeQuery():\n  Request ID: %s\n  Encountered exception:\n%s", splat: [scriptName, req.id, err_msg] }); // ID03052025.n
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
        else if (Array.isArray(element.content)) { // ID10182025.sn
          element.content.forEach(contentItem => {
            if (contentItem.type === "text")
              content += contentItem.text;
          });
        }; // ID10182025.en
    };
  };

  // console.log(`*****\nprepareTextToEmbedd():\n  Request ID: ${requestid}\n  Term: ${term}\n  Roles: ${roles}\n  Content: ${content}\n  Execution Time: ${Date.now() - stTime}\n*****`);
  logger.log({ level: "debug", message: "[%s] prepareTextToEmbedd():\n  Request ID: %s\n  Term: %s\n  Roles: %s\n  Content: %s\n  Execution Time: %s", splat: [scriptName, requestid, term, roles, content, Date.now() - stTime] });

  return content;
}

// ID09172025.sn
// Parameters:
//   baseUri: Endpoint URI
//   appType: AI Application type
//   suffix: Endpoint ID
function retrieveUniqueURI(baseUri, appType, suffix) {
  return (appType === AzAiServices.OAI) ? baseUri : baseUri + '/' + (suffix ?? '');
}
// ID09172025.en

// ID10142025.sn
function normalizeAiOutput(fullJsonOutput) {
  const { prompt_filter_results, ...rest } = fullJsonOutput;
  return {
    ...rest,
    choices: fullJsonOutput.choices.map(choice => {
      const { content_filter_results, ...choiceRest } = choice;
      return choiceRest;
    })
  };
}
// ID10142025.en

module.exports = {
  getOpenAICallMetadata, // ID08272025.n
  prepareTextToEmbedd,
  // callRestApi ID03052025.o
  vectorizeQuery, // ID03052025.n
  callAiAppEndpoint, // ID05142025.n
  retrieveUniqueURI, // ID09172025.n
  normalizeAiOutput // ID10142025.n
}