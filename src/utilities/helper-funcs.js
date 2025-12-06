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
 * ID10202025: ganrad: v2.8.0: (Enhancement) Updated long term memory feature to support multiple user groups.
 * ID10252025: ganrad: v2.8.5: (Refactoring) AI App Gateway security implementation (library) switched to jwks-rsa.
 * ID11182025: ganrad: v2.9.5: (Enhancement) Introduced support for Azure AI Model v1 chat/completions API
 * ID11212025: ganrad: v2.9.5: (Enhancement) Introduced multiple levels/layers for semantic cache - l1, l2 & l3/PG. Updated search type constants to 
 * a uniform set of values/literals.
 * ID12042025: ganrad: v2.9.5: (Refactoring) Introduced new function to format/stringify runtime exception.
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');
const { getAccessToken } = require("../auth/bootstrap-auth.js"); // ID08272025.n
const {
  AzAiServices,
  OpenAIBaseUri,
  AzureResourceUris,
  HttpMethods, // ID11212025.n
  ServerDefaults, // ID11212025.n
  SearchAlgorithms, // ID10202025.n
  LongTermMemoryTypes, // ID10202025.n
  LongTermMemoryConstants // ID10202025.n
} = require("./app-gtwy-constants.js"); // ID08272025.n
const MAX_FETCH_RETRIES = 3; // ID1121225.n

// const fetch = require("node-fetch"); ID01312025.o

// ID12042025.sn
function formatException(error) {
  return JSON.stringify(error, null, 2);
};
// ID12042025.en

async function getOpenAICallMetadata(req, element, appType) { // ID08272025.n
  const meta = new Map();
  meta.set('Content-Type', 'application/json');

  let bearerToken = req.headers['Authorization'] || req.headers['authorization'];
  // if (appType === AzAiServices.OAI) { // ID09162025.o

  // If Authorization header is present & API Gateway auth is not configured then use MID Auth or pass UAT to authenticate to backend
  if (bearerToken && !req.authInfo) {
    if (process.env.AZURE_AI_SERVICE_MID_AUTH === "true")
      bearerToken = await getAccessToken(req, AzureResourceUris.AzureCognitiveServices);
    meta.set('Authorization', bearerToken);
    logger.log({ level: "debug", message: "[%s] getOpenAICallMetadata(): Using bearer token (Client/MID-IMDS) for Az OAI Auth.\n  Request ID: %s", splat: [scriptName, req.id] });
  }
  else { // If Authorization header is present & API Gateway auth is configured then use MID Auth or API key to authenticate to backend
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
    // let metricsObj = epinfo.get(retrieveUniqueURI(element.uri, appType, element.id)); // ID09172025.n, ID11182025.o
    let metricsObj = epinfo.get(retrieveUniqueURI(element.uri, element.id)); // ID11182025.n
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

      response = await fetch(  // Synchronous call
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

      logger.log({ level: "error", message: "[%s] callAiAppEndpoint():\n  Request ID: %s\n  Encountered exception:\n%s", splat: [scriptName, req.id, formatException(err_msg)] });
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
    // let metricsObj = epinfo.get(element.uri);  // Vector model endpoints should be unique! ID11182025.o
    let metricsObj = epinfo.get(retrieveUniqueURI(element.uri, element.id)); // ID11182025.n

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
      const err_msg = { targetUri: element.uri, cause: error };
      // console.log(`callRestApi():\n  Request ID: {requestid}\n  Encountered exception:\n${err_msg}`);
      logger.log({ level: "error", message: "[%s] vectorizeQuery():\n  Request ID: %s\n  Encountered exception:\n%s", splat: [scriptName, req.id, formatException(err_msg)] }); // ID03052025.n
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

// ID09172025.sn; ID11182025.o Deprecated!
// Parameters:
//   baseUri: Endpoint URI
//   appType: AI Application type
//   suffix: Endpoint ID
// function retrieveUniqueURI(baseUri, appType, suffix) {
// return (appType === AzAiServices.OAI) ? baseUri : baseUri + '/' + (suffix ?? '');
//}
// ID09172025.en;

// ID11182025.sn
// Parameters:
//   baseUri: Endpoint URI
//   suffix: Endpoint ID
function retrieveUniqueURI(baseUri, suffix) {
  return (suffix ? baseUri + '/' + suffix : baseUri)
}
// ID11182025.en

// ID10142025.sn; ID11032025.o (This function is not used!)
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

// ID10202025.sn
function retrievePersonalizationConfig(user, settings) {
  // logger.log({ level: "debug", message: "[%s] retrievePersonalizationConfig():\n  User ID: %s\n  LTM Settings:\n  %s", splat: [scriptName, user, JSON.stringify(settings, null, 2)] });

  let userMemoryConfig = null;
  if (!settings.memoryType) // Double check to make sure memoryType is specified!
    settings.memoryType = LongTermMemoryTypes.UserType; // Set default to 'User' based memory

  switch (settings.memoryType) {
    case LongTermMemoryTypes.UserType:
      const { groupNames, ...memConfig } = settings.memoryConfig[0]; // Ignore 'groupNames' when 'User' based memory is selected.
      if (memConfig) // Proceed if settings.memoryConfig[0] is NOT empty!
        userMemoryConfig = {
          user,
          // searchAlg: settings.searchType || SearchAlgorithms.CosineSimilarity,  // Set default search alg. to cosine similarity ID11212025.o
          searchAlg: settings.searchType || SearchAlgorithms.Cosine, // ID11212025.n
          ...memConfig
        };

      break;
    case LongTermMemoryTypes.GroupType:
      // Split the 'user' string using the separator character
      const sepCharacter = settings.separatorChar ?? LongTermMemoryConstants.UserGroupDelimiter; // Default Seperator Character = '-'
      const parts = user.split(sepCharacter, 2); // user = "user{separatorChar}group"

      if (parts[1]) {
        for (const element of settings.memoryConfig) {
          if (element.groupNames?.includes(parts[1])) {
            const { groupNames, ...memConfig } = element;

            userMemoryConfig = {
              user: parts[0],
              group: element.groupNames.join(), // Concat all group names delimited by comma
              // searchAlg: settings.searchType || SearchAlgorithms.CosineSimilarity, ID11212025.o
              searchAlg: settings.searchType || SearchAlgorithms.Cosine, // ID11212025.n
              ...memConfig
            };

            break; // Break out of the for loop
          };
        };
      };
      break;
  }; // end of switch

  return (userMemoryConfig);
}
// ID10202025.en

// ID11212025.sn
// ------------------------- Cache Utility Functions -----------------------

function getL2CacheCollectionName(serverId, appId) {
  return(`${serverId}_${appId}_cache`);
}

// ------------------------- L1 Cache Functions ----------------------------
/**
 * Calculates the approximate size in bytes of an in-memory (L1) cache entry.
 * 
 * @param {object} cacheObject The object being stored (value).
 * @param {string} key The key used to store the object
 * @returns {number} The estimated size in bytes.
 */
const l1CacheEntrySizeCalculation = (cacheObject, key) => {
  let size = 0;

  // Approximate size of strings: JavaScript strings use UTF-16 encoding,
  // so roughly 2 bytes per character.

  // Size of 'key' string
  // Note: The 'key' passed to the set/get method is separate from the object's key property,
  // but we can estimate both for a fuller picture if needed.
  // Assuming the input 'cacheObject' is the value:
  if (cacheObject.prompt) {
    size += JSON.stringify(cacheObject.prompt).length * 2;
  };

  // console.log(`Caching object:\n*****\nPrompt size=${size}\n*****`);
  if (cacheObject.response) {
    size += JSON.stringify(cacheObject.response).length * 2;
  };

  // console.log(`Caching object:\n*****\nPrompt + Response Size=${size}\n*****`);
  // Size of 'embedding' array:
  // It has 1536 items. Standard JavaScript numbers (doubles) are 8 bytes each.
  if (cacheObject.embedding && Array.isArray(cacheObject.embedding)) {
    // We know it should be 1536 items based on the schema
    const numberOfEmbeddings = cacheObject.embedding.length;
    // Each JavaScript number (double float) is 8 bytes
    size += numberOfEmbeddings * 8;
  };
  // console.log(`Caching object:\n*****\nFinal Size=${size}\n*****`);

  // Add a small constant overhead for the object structure itself
  size += 50;

  logger.log({ level: "debug", message: "[%s] cacheEntrySizeCalculation(): Caching entry in L1 cache.\n  Application ID: %s\n  Key: %s\n  Size (Bytes): %d", splat: [scriptName, cacheObject.appId, key, size] });

  return size;
};

const l1DisposeCachedEntry = (value, key, reason) => {
  logger.log({ level: "debug", message: "[%s] disposeCachedEntry(): Disposing entry in L1 cache.\n  Application ID: %s\n  Key: %s\n  Reason: %s", splat: [scriptName, value.appId, key, reason] });
}

// ------------------------- L2 (Qdrant) Cache Functions ----------------------------
/**
* Helper for making API requests with exponential backoff.

* @param {string} url - The Qdrant API endpoint URL.
* @param {object} options - Fetch options (method, headers, body).
* @param {number} attempt - Current retry attempt.
* @returns {Promise<object>} The JSON response body.
*/
async function fetchWithRetry(url, options = {}, attempt = 1) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers
      }
    });

    if (!response.ok) {
      // Throw a specific error that includes the status code if not okay
      const errorBody = await response.text();
      const error = new Error(`HTTP error! Status: ${response.status}. Body: ${errorBody}`);
      error.status = response.status;
      throw error;
    }

    return response.json();
  }
  catch (error) {
    if (attempt < MAX_FETCH_RETRIES) {
      const delay = Math.pow(2, attempt) * 1000;
      // Note: In production code, you might skip logging this warning to console.
      // console.warn(`Attempt ${attempt} failed. Retrying in ${delay / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, attempt + 1);
    } 
    else {
      logger.log({ level: "warn", message: "[%s] fetchWithRetry(): Fetch failed:\n  URI: %s\n  Attempts: %d", splat: [scriptName, url, MAX_FETCH_RETRIES] });
      throw error;
    }
  };
}

/**
* Checks if the L2 (Qdrant) cache collection exists, and creates it if it doesn't.
* This is crucial for making the setup idempotent.
*/
async function createL2CacheCollection(serverId, appId, level2Config) {
  // const url = `${QDRANT_URL}/collections/${CACHE_COLLECTION_NAME}`;
  const collectionName = getL2CacheCollectionName(serverId, appId);
  const url = `${level2Config.qdrantUri}/collections/${collectionName}`;
  let headers = { "api-key": level2Config.apikey };

  // --- STEP 1: Check if collection exists via GET request ---
  try {
    await fetchWithRetry(url, { method: HttpMethods.GET, headers });
    logger.log({ level: "debug", message: "[%s] createL2CacheCollection(): Qdrant collection: [%s] already exists. Skipping creation.", splat: [scriptName, collectionName] });

    return;
  }
  catch (e) {
    // We expect a 404 (Not Found) if the collection does not exist.
    // If it's a 404, we proceed to creation (Step 2).
    if (e.status !== 404)
      logger.log({ level: "warn", message: "[%s] createL2CacheCollection(): Unexpected error during Qdrant collection check, proceeding with creation anyway.\n  Error message: %s", splat: [scriptName, e.message] });
  };

  // --- STEP 2: Create Collection via PUT request ---
  const payload = {
    vectors: {
      size: ServerDefaults.L2CacheVectorDimensions,
      distance: level2Config.searchType
    },
    on_disk_payload: true,
    // Optional: Configure for better performance/storage
    optimizers_config: {
      default_segment_number: 2
    },
  };
  headers['Content-Type'] = 'application/json';

  try {
    await fetchWithRetry(url, {
      method: HttpMethods.PUT,
      body: JSON.stringify(payload),
      headers
    });
    logger.log({ level: "debug", message: "[%s] createL2CacheCollection(): Qdrant collection: [%s] created successfully.", splat: [scriptName, collectionName] });
  }
  catch (err) {
    logger.log({ level: "warn", message: "[%s] createL2CacheCollection(): Unexpected error occured while creating Qdrant collection: [%s].\n  Error message: %s", splat: [scriptName, collectionName, formatException(err)] });
  };
}

// Delete expired points in L2 cache ~ Qdrant
async function cleanupL2ExpiredQdrantEntries(srvId, appId, config) {
  const collectionName = getL2CacheCollectionName(srvId, appId);
  const cutoff = Date.now() - config.timeToLiveInMs;
  try {
    const url = `${config.qdrantUri}/collections/${collectionName}/points/delete`;
    const headers = { "Content-Type": "application/json", "api-key": config.apikey };

    const resp = await fetchWithRetry(url, {
      method: HttpMethods.POST,
      headers,
      body: JSON.stringify({
        filter: { must: [{ key: "ts", range: { lt: cutoff } }] }
      })
    });

    logger.log({ level: "debug", message: "[%s] cleanupL2ExpiredQdrantEntries(): Cleanup operation completed for Qdrant collection: [%s].", splat: [scriptName, collectionName] });
  }
  catch (err) {
    logger.log({ level: "warn", message: "[%s] cleanupL2ExpiredQdrantEntries(): Unexpected error occured while attempting cleanup operation for Qdrant collection: [%s].\n  Error message: %s", splat: [scriptName, collectionName, formatException(err)] });
  };
}

// Delete the Ai App collection
async function deleteL2CacheCollection(srvId, appId, level2Config) {
  const collectionName = getL2CacheCollectionName(srvId, appId);
  // const url = `${QDRANT_URL}/collections/${CACHE_COLLECTION_NAME}`;
  const url = `${level2Config.qdrantUri}/collections/${collectionName}`;
  const headers = { "api-key": level2Config.apikey };

  try {
    await fetchWithRetry(url, {
      method: HttpMethods.DELETE,
      headers
    });

    logger.log({ level: "debug", message: "[%s] deleteL2CacheCollection(): Qdrant collection: [%s], deleted successfully", splat: [scriptName, collectionName] });
  }
  catch (err) {
    logger.log({ level: "warn", message: "[%s] deleteL2CacheCollection(): Unexpected error occured while attempting delete operation on Qdrant collection: [%s].\n  Error message: %s", splat: [scriptName, collectionName, formatException(err)] });
  };
}
// ID11212025.en

module.exports = {
  formatException, // ID12042025.n
  getOpenAICallMetadata, // ID08272025.n
  prepareTextToEmbedd,
  // callRestApi ID03052025.o
  vectorizeQuery, // ID03052025.n
  callAiAppEndpoint, // ID05142025.n
  retrieveUniqueURI, // ID09172025.n
  normalizeAiOutput, // ID10142025.n
  retrievePersonalizationConfig, // ID10202025.n
  l1CacheEntrySizeCalculation, // ID11212025.n
  l1DisposeCachedEntry, // ID11212025.n
  cleanupL2ExpiredQdrantEntries, // ID11212025.n
  getL2CacheCollectionName, // ID11212025.n
  createL2CacheCollection, // ID11212025.n
  deleteL2CacheCollection // ID11212025.n
}