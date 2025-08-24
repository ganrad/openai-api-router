/**
 * Name: Container for endpoint router implementations
 * Description: This program contains implementations (classes) for the following router types: 
 *   1) LRU or Least Recently Used (a.k.a Round Robin) Router: Uses endpoint access (last call) time to identify an endpoint which was least recently used & then routes requests.
 *   2) LAC or Least Active Connections Router: Uses endpoint connection count to identify an endpoint with min. active connections & then routes requests.
 *   3) Weighted Random Router (a.k.a Percentage Split) Router: Uses fixed endpoint weights assigned to endpoints to route requests.
 *   4) Latency weighted router: Dynamically updates the endpoint weights after each successful call. Then uses the weights to route requests.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 06-16-2025
 * Version (Introduced): v2.3.9
 *
 * Notes:
 * ID08052025: ganrad: v2.4.0: Introduced additional endpoint router types (classes).
 *   1) Payload size router: Routes incoming request to the corresponding backend endpoint if the payload size is less than the threshold configured
 *      for the respective endpoint.
 *   2) Header value router: Routes incoming request to the endpoint whose 'id' matches the value sent in the http header ~ 'x-endpoint-id'.
 *   3) Model aware router: Routes an incoming request to an endpoint that specializes in a specific task - summarization, translation, advanced
 *      reasoning, low-cost inferencing ... Routing decision is based on 'task' description which should be contained in the 'system' prompt.
 * ID08082025: ganrad: v2.4.0: Introduced static class method for creating routers.  This method can be used to validate router inputs.
 * ID08082025: ganrad: v2.4.0: Introduced TrafficRouterFactory and TokenAwareRouter implementations. 
 * ID08202025: ganrad: v2.4.0: Updated 'ModelAware' router implementation to use an array of tasks, to make routing decisions (~ terms).
 * ID08212025: ganrad: v2.4.0: Introduced TimeAwareRouter implementation.
 * ID08222025: ganrad: v2.4.0: Introduced traffic router configuration validation checks. Refactored code.
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');
const {
  DefaultEndpointLatency,
  CustomRequestHeaders,
  EndpointRouterTypes,
  ConfigValidationStatus, // ID08222025.n
  ModelFamily,
  OpenAIChatCompletionMsgRoleTypes // ID08202025.n 
} = require("./app-gtwy-constants.js"); // ID08052025.n; ID08082025.n

// Load encodings and encodeChat from gpt-tokenizer; ID08082025.n
// GPT models use BPE ~ Byte Pair Encoding
const { encodeChat, cl100k_base, o200k_base, r50k_base } = require('gpt-tokenizer');

/**
 * Prior to instantiating a concrete router implementation use this factory method to validate the 'required' configuration parameters.
 */
class TrafficRouterFactory { // ID08082025.n

  static #isStringValid(str) {
    // Check for null or undefined first
    if (str === null || str === undefined) {
      return false;
    }
    // Check if it's a string and then if it's empty after trimming whitespace
    if (typeof str === 'string' && str.trim().length === 0) {
      return false;
    }
    // If none of the above, the string is valid
    return true;
  }

  static create(appId, type, endpointObj) {
    let validationStatus = ConfigValidationStatus.Passed;
    let router = null;  // Default ~ validation failed!
    let error = null;

    switch (type) {
      case EndpointRouterTypes.LRURouter: // ID08222025.n
        router = new LRURouter(appId, endpointObj, type);
        break;
      case EndpointRouterTypes.LeastConnectionsRouter: // ID08222025.n
        router = new LeastConnectionsRouter(appId, endpointObj, type);
        break;
      case EndpointRouterTypes.HeaderValueRouter: // ID08222025.n
        // Loop thru all the endpoints and check if 'id' attribute exists
        for (let i = 0; i < endpointObj.length; i++) {
          if ( ! Object.hasOwn(endpointObj[i],"id") ) {
            validationStatus = ConfigValidationStatus.Failed;

            break;
          };
        };

        if (validationStatus === ConfigValidationStatus.Passed)
          router = new HeaderValueRouter(appId, endpointObj, type);
        else {
          // Log the error and exit -
          error = "Attribute 'id' must be defined for all configured endpoints. Check endpoint configuration. Falling back to default router (Priority) implementation.";
          logger.log({ level: "warn", message: "[%s] TrafficRouterFactory.create():\n  App ID: %s\n  Router Type: %s\n  Error: %s", splat: [scriptName, appId, type, error] });
        };
        break;
      case EndpointRouterTypes.WeightedDynamicRouter: // ID08222025.n
      case EndpointRouterTypes.WeightedRandomRouter: // ID08222025.n
        // Check if 'weight' attribute is specified for each endpoint and the total of all endpoint weights equals 100.
        let totalWeight = 0;
        for (let i = 0; i < endpointObj.length; i++) {
          if (! "weight" in endpointObj[i] ) {
            validationStatus = ConfigValidationStatus.Failed;

            break;
          }
          else
            totalWeight += endpointObj[i].weight;
        };

        if (validationStatus === ConfigValidationStatus.Passed) {
          if ( totalWeight === 100 )
            router = (type === EndpointRouterTypes.WeightedDynamicRouter) ? new WeightedDynamicRouter(appId, endpointObj, type) : new WeightedRandomRouter(appId, endpointObj, type);
          else {
            // Log the error and exit -
            error = "The sum of all endpoint weights ('weight' attribute) should equal 100. Check endpoint configuration & update weights. Falling back to default router (Priority) implementation.";
            logger.log({ level: "warn", message: "[%s] TrafficRouterFactory.create():\n  App ID: %s\n  Router Type: %s\n  Error: %s", splat: [scriptName, appId, type, error] });
          };
        }
        else {
          // Log the error and exit -
          error = "Attribute 'weight' must be defined for all configured endpoints. Check endpoint configuration. Falling back to default router (Priority) implementation.";
          logger.log({ level: "warn", message: "[%s] TrafficRouterFactory.create():\n  App ID: %s\n  Router Type: %s\n  Error: %s", splat: [scriptName, appId, type, error] });
        };
        break;
      case EndpointRouterTypes.PayloadSizeRouter: // ID08222025.n
        // Loop thru all the endpoints and check if 'payloadThreshold' attribute has been defined.
        for (let i = 0; i < endpointObj.length; i++) {
          if (! TrafficRouterFactory.#isStringValid(endpointObj[i].payloadThreshold)) {
            validationStatus = ConfigValidationStatus.Failed;

            break;
          };
        };

        if (validationStatus === ConfigValidationStatus.Passed)
          router = new PayloadSizeRouter(appId, endpointObj, type);
        else {
          // Log the error and exit -
          error = "Attribute 'payloadThreshold' must be defined for all configured endpoints. Check endpoint configuration. Falling back to default router (Priority) implementation.";
          logger.log({ level: "warn", message: "[%s] TrafficRouterFactory.create():\n  App ID: %s\n  Router Type: %s\n  Error: %s", splat: [scriptName, appId, type, error] });
        };
        break;
      case EndpointRouterTypes.ModelAwareRouter: // ID08222025.n
        // Loop thru all the endpoints and check if 'id' and 'task' attributes exist
        for (let i = 0; i < endpointObj.length; i++) {
          // Check to see if 'id' and 'task' array exists?
          if (!Object.hasOwn(endpointObj[i],"id") || !endpointObj[i].task) {
            validationStatus = ConfigValidationStatus.Failed;

            break;
          };
        };

        if (validationStatus === ConfigValidationStatus.Passed)
          router = new ModelAwareRouter(appId, endpointObj, type);
        else {
          // Log the error and exit -
          error = "Attributes 'id' and 'task' must be defined for all configured endpoints. Check endpoint configuration. Falling back to default router (Priority) implementation.";
          logger.log({ level: "warn", message: "[%s] TrafficRouterFactory.create():\n  App ID: %s\n  Router Type: %s\n  Error: %s", splat: [scriptName, appId, type, error] });
        };
        break;
      case EndpointRouterTypes.TokenAwareRouter: // ID08222025.n
        // Loop thru all the endpoints and check if 'model' & 'payloadThreshold' attributes have been defined.
        for (let i = 0; i < endpointObj.length; i++) {
          // Check to see if task array exists?
          if (! Object.hasOwn(endpointObj[i],"id") || ! TrafficRouterFactory.#isStringValid(endpointObj[i].model) || ! TrafficRouterFactory.#isStringValid(endpointObj[i].payloadThreshold)) {
            validationStatus = ConfigValidationStatus.Failed;

            break;
          };
        };

        if (validationStatus === ConfigValidationStatus.Passed)
          router = new TokenAwareRouter(appId, endpointObj, type);
        else {
          // Log the error and exit -
          error = "Attributes 'id', 'model' and 'payloadThreshold' must be specified for all configured endpoints. Check endpoint configuration. Falling back to default router (Priority) implementation.";
          logger.log({ level: "warn", message: "[%s] TrafficRouterFactory.create():\n  App ID: %s\n  Router Type: %s\n  Error: %s", splat: [scriptName, appId, type, error] });
        };
        break;
      case EndpointRouterTypes.TimeAwareRouter: // ID08222025.n
        // Loop thru all the endpoints and check if 'id', 'days', 'startHour' and 'endHour' attributes have been defined.
        for (let i = 0; i < endpointObj.length; i++) {
          // Check to see if task array exists?
          if ( (! Object.hasOwn(endpointObj[i],"id") || ! "days" in endpointObj[i]) || (! "startHour" in endpointObj[i]) || (! "endHour" in endpointObj[i]) ) {
            validationStatus = ConfigValidationStatus.Failed;

            break;
          };
        };

        if (validationStatus === ConfigValidationStatus.Passed)
          router = new TimeAwareRouter(appId, endpointObj, type);
        else {
          // Log the error and exit -
          error = "Attributes 'id', 'days', 'startHour' and 'endHour' must be defined for all configured endpoints. Check endpoint configuration. Falling back to default router (Priority) implementation.";
          logger.log({ level: "warn", message: "[%s] TrafficRouterFactory.create():\n  App ID: %s\n  Router Type: %s\n  Error: %s", splat: [scriptName, appId, type, error] });
        };
        break;
    };

    return (router);
  }

}

class WeightedRandomRouter { // Random Weighted Router.  Uses static weights to pick an endpoint ID.

  constructor(appId, endpointObj, type) {
    let epIdx = 0;
    const epConfig = new Object();
    endpointObj.forEach(element => {
      epConfig[epIdx] = element.weight;
      epIdx++;
    });

    this._appName = appId;
    this._routerType = type;
    this._routingTable = this.#buildRoutingTable(epConfig);
  }

  // Build a weighted routing table
  #buildRoutingTable(config) {
    const table = [];
    for (const [url, weight] of Object.entries(config)) {
      for (let i = 0; i < weight; i++) {
        table.push(Number(url));
      }
    };

    logger.log({ level: "info", message: "[%s] %s.buildRoutingTable():\n  App ID: %s\n  Router Type: %s\n  Router Config: %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(config, null, 2)] });
    return table;
  }

  get routerType() {
    return this._routerType;
  }

  getEndpointId(request) {
    const epIdx = this._routingTable[Math.floor(Math.random() * this._routingTable.length)];
    logger.log({ level: "info", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d", splat: [scriptName, this.constructor.name, request.id, this._appName, epIdx] });

    return (epIdx);
  }
}

class WeightedDynamicRouter { // Latency Weighted Router
  constructor(appId, endpointObj, type) {
    let epIdx = 0;
    const backendEndpoints = new Array();
    endpointObj.forEach(element => {
      const uriWeights = new Object();
      uriWeights[epIdx] = element.weight;
      epIdx++;
      backendEndpoints.push(uriWeights);
    });


    // Initial equal weights
    this.backendStats = backendEndpoints.reduce((acc, urlElem) => {
      const key = Object.keys(urlElem)[0]
      const value = urlElem[key];

      acc[key] = { weight: value, latency: DefaultEndpointLatency }; // default 5 seconds latency
      return acc;
    }, {});

    this._appName = appId;
    this._routerType = type;
    this._routingTable = [];
    this.#rebuildRoutingTable();
  }

  #rebuildRoutingTable() {
    this._routingTable = [];
    for (const [url, stats] of Object.entries(this.backendStats)) {
      const entries = Math.max(1, Math.round(stats.weight));
      this._routingTable.push(...Array(entries).fill(Number(url)));
    };

    logger.log({ level: "info", message: "[%s] %s.rebuildRoutingTable():\n  App ID: %s\n  Router Type: %s\n  Router Config: %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this.backendStats, null, 2)] });
  }

  updateWeightsBasedOnLatency(selectedBackend, latency) {
    this.backendStats[selectedBackend].latency = latency;

    const latencies = Object.values(this.backendStats).map(s => s.latency);
    const maxLatency = Math.max(...latencies);

    for (const url in this.backendStats) {
      const normalized = this.backendStats[url].latency / maxLatency;
      this.backendStats[url].weight = Math.max(1, Math.round((1 - normalized) * 100));
    }

    this.#rebuildRoutingTable();
  }

  get routerType() {
    return this._routerType;
  }

  getEndpointId(request) {
    const epIdx = this._routingTable[Math.floor(Math.random() * this._routingTable.length)];
    logger.log({ level: "info", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d", splat: [scriptName, this.constructor.name, request.id, this._appName, epIdx] });

    return (epIdx);
  }
}

class LRURouter { // Least Recently Used a.k.a Round Robin Router

  constructor(appId, endpointObj, type) {
    this._backends = new Array();
    endpointObj.forEach(element => {
      this._backends.push(element.uri);
    });

    this._appName = appId;
    this._routerType = type;
    this._lastUsed = {};
    const now = new Date(Date.now());
    this._backends.forEach(backend => {  // Initialize array with backends + timestamps
      this._lastUsed[backend] = now;
    });

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type: %s\n  Endpoint Table: %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this.#getLRUTable(), null, 2)] });
  }

  #getLRUTable() {
    const lastUsedObj = {};
    const padTwoDigits = (num) => String(num).padStart(2, '0');

    Object.keys(this._lastUsed).forEach(element => {
      const ts = this._lastUsed[element];

      const year = ts.getFullYear();
      const month = ts.getMonth() + 1;
      const day = ts.getDate();
      const hours = ts.getHours();
      const minutes = ts.getMinutes();
      const seconds = ts.getSeconds();

      const formattedMonth = padTwoDigits(month);
      const formattedDay = padTwoDigits(day);
      const formattedHours = padTwoDigits(hours);
      const formattedMinutes = padTwoDigits(minutes);
      const formattedSeconds = padTwoDigits(seconds);

      const formattedDateTime = `${year}-${formattedMonth}-${formattedDay} ${formattedHours}:${formattedMinutes}:${formattedSeconds}`;

      lastUsedObj[element] = formattedDateTime; // Example output: "2025-07-02 11:53:00"
    });

    return (lastUsedObj);
  }

  get routerType() {
    return this._routerType;
  }

  getEndpointId(request) {
    // Get the least recently used backend
    const backendUri = Object.keys(this._lastUsed).reduce((leastUsed, backend) => {
      return this._lastUsed[backend] < this._lastUsed[leastUsed] ? backend : leastUsed;
    });

    // Update the last used timestamp for the selected backend
    this._lastUsed[backendUri] = new Date(Date.now());

    // Get & return the backend index
    const epIdx = this._backends.indexOf(backendUri);
    logger.log({ level: "info", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d\n  Endpoint URI: %s\n  Endpoint Table: %s", splat: [scriptName, this.constructor.name, request.id, this._appName, epIdx, backendUri, this.#getLRUTable()] });

    return (epIdx);
  }
}

class LeastConnectionsRouter { // Least Active Connections Router

  constructor(appId, endpointObj, type) {
    this._backends = new Array();
    endpointObj.forEach(element => {
      this._backends.push(element.uri);
    });

    this._appName = appId;
    this._routerType = type;
    this._uriConnections = {};
    this._backends.forEach(backend => {  // Set uri connections object & initialize connection count for each backend/endpoint uri
      this._uriConnections[backend] = 0;
    });

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type: %s\n  Endpoint Table: %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this._uriConnections, null, 2)] });
  }

  get routerType() {
    return this._routerType;
  }

  updateUriConnections(requestId, increment, epIdx) {
    if (increment)
      this._uriConnections[this._backends[epIdx]]++;
    else
      this._uriConnections[this._backends[epIdx]]--;

    logger.log({ level: "debug", message: "[%s] %s.updateUriConnections():\n  Request ID: %s\n  Endpoint ID:  %d\n  Endpoint Table: %s", splat: [scriptName, this.constructor.name, requestId, epIdx, JSON.stringify(this._uriConnections, null, 2)] });
  }

  getEndpointId(request) {
    const uri = Object.entries(this._uriConnections).reduce((min, [url, count]) => {
      return count < min.count ? { url, count } : min;
    }, { url: null, count: Infinity }).url;

    const epIdx = this._backends.indexOf(uri);
    logger.log({ level: "info", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d\n  Endpoint URI: %s\n  Endpoint Table: %s", splat: [scriptName, this.constructor.name, request.id, this._appName, epIdx, uri, JSON.stringify(this._uriConnections, null, 2)] });

    return (epIdx);
  }
}

class PayloadSizeRouter { // Payload size router; ID08052025.n

  constructor(appId, endpointObj, type) {
    this._backends = new Array();
    endpointObj.forEach(element => {
      this._backends.push({ uri: element.uri, threshold: element.payloadThreshold });
    });

    this._appName = appId;
    this._routerType = type;

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type: %s\n  Backend Table: %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this._backends, null, 2)] });
  }

  get routerType() {
    return this._routerType;
  }

  // Function to convert size strings to bytes
  #sizeToBytes(sizeStr) {
    const size = parseFloat(sizeStr);
    const unit = sizeStr.replace(size, '').trim().toLowerCase();

    switch (unit) {
      case 'kb':
        return size * 1024; // Convert KB to bytes
      case 'mb':
        return size * 1024 * 1024; // Convert MB to bytes
      default:
        return size; // Assume bytes if no unit is specified
    }
  };

  getEndpointId(request) {
    // Calculate the size of the request payload
    const contentLength = request.headers['content-length'];
    const payloadSize = contentLength ? parseInt(contentLength, 10) : 0;

    // Determine the appropriate backend based on the payload size
    const backendIdx = this._backends.findIndex((backend) => {
      const thresholdBytes = this.#sizeToBytes(backend.threshold);
      return payloadSize <= thresholdBytes;
    });

    // If no backend is found, use the last one as a default
    const epIdx = (backendIdx !== -1) ? backendIdx : this._backends.length - 1;
    logger.log({ level: "info", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Payload Size (Bytes): %d\n  Endpoint ID: %d\n  Endpoint URI: %s", splat: [scriptName, this.constructor.name, request.id, this._appName, payloadSize, epIdx, this._backends[epIdx].uri] });

    return (epIdx);
  }
}

/**
 * IMP: Make sure to set a unique ID for each endpoint when using this routing algorithm!
 */
class HeaderValueRouter { // Header value ('x-endpoint-id') router; ID08052025.n

  constructor(appId, endpointObj, type) {
    this._backends = new Array();
    endpointObj.forEach(element => {
      this._backends.push({ id: element?.id, uri: element.uri });
    });

    this._appName = appId;
    this._routerType = type;

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type: %s\n  Backend Table: %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this._backends, null, 2)] });
  }

  get routerType() {
    return this._routerType;
  }

  getEndpointId(request) {
    // Retrieve the endpoint ID from the http header 'x-endpoint-id'
    const endpointId = request.headers[CustomRequestHeaders.EndpointId];
    if (!endpointId)
      return (0); // If header value is missing, return the first endpoint index

    // Determine the appropriate backend based on header value
    const backendIdx = this._backends.findIndex((backend) => { backend === endpointId });

    // If a matching backend is not found, use the index of the first endpoint as a default
    const epIdx = (backendIdx !== -1) ? backendIdx : 0;
    logger.log({ level: "info", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Header (x-endpoint-id): %s\n  Endpoint ID: %d\n  Endpoint URI: %s", splat: [scriptName, this.constructor.name, request.id, this._appName, endpointId, epIdx, this._backends[epIdx].uri] });

    return (epIdx);
  }
}

/**
 * IMP: Make sure to set a unique ID for each endpoint when using this routing algorithm!
 */
class ModelAwareRouter { // Model aware router; ID08052025.n

  constructor(appId, endpointObj, type) {
    this._backends = new Array();
    endpointObj.forEach(element => {
      this._backends.push({ id: element?.id, task: element.task, uri: element.uri });
    });

    this._appName = appId;
    this._routerType = type;

    // IMP: Default msg role type is set to 'system'. Use env variable 'GATEWAY_ROUTER_MSG_ROLE_TYPE' to set the message role type to desired value = [ user | system | developer].
    const msgRoleType = process.env.GATEWAY_ROUTER_MSG_ROLE_TYPE ?? OpenAIChatCompletionMsgRoleTypes.SystemMessage;
    const roleTypes = [OpenAIChatCompletionMsgRoleTypes.Developer, OpenAIChatCompletionMsgRoleTypes.SystemMessage, OpenAIChatCompletionMsgRoleTypes.UserMessage];
    this._msgRoleType = roleTypes.includes(msgRoleType.toLowerCase()) ? msgRoleType : OpenAIChatCompletionMsgRoleTypes.SystemMessage;

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type: %s\n  Backend Table:\n %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this._backends, null, 2)] });
  }

  get routerType() {
    return this._routerType;
  }

  #inferTask(messages) {
    let sysPrompt = messages.find(m => m.role === this._msgRoleType)?.content || '';
    sysPrompt = sysPrompt.toLowerCase();

    let idx = 0; // If task term associated with an endpoint is not contained within the message, return the first endpoint index
    let tmatch = ''; // Matched term
    for (let i = 0; i < this._backends.length; i++) {
      const terms = this._backends[i].task; // An array of search terms
      if (terms.some(term => {
        if (sysPrompt.includes(term.toLowerCase())) {
          tmatch = term;
          return (true);
        };
        return false;
      })) { // Perform lowercase search
        idx = i;

        break;
      };
    };

    return ({ epIdx: idx, term: tmatch });
  }

  getEndpointId(request) {
    // Retrieve the endpoint ID based on the task contained in the system prompt
    const result = this.#inferTask(request.body.messages);

    logger.log({ level: "info", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d\n  Message Role Type: %s\n  Endpoint Terms: %s\n  Matched Term: %s", splat: [scriptName, this.constructor.name, request.id, this._appName, result.epIdx, this._msgRoleType, JSON.stringify(this._backends[result.epIdx]), result.term] });

    return (result.epIdx);
  }
}

/**
 * IMP: 
 * 1) Make sure to set a unique ID for each endpoint when using this routing algorithm!
 * 2) Only use this router when the AI App is backed by chat completion models/LLM's deployed in OAI / Azure AI Foundry!
 * 3) Use this router with OpenAI models only!
 */
class TokenAwareRouter { // Token aware router; ID08082025.n

  constructor(appId, endpointObj, type) {
    this._backends = new Array();
    endpointObj.forEach(element => {
      this._backends.push({ id: element?.id, uri: element.uri, model: element.model, threshold: this.#sizeToBytes(element.payloadThreshold) });
    });

    this._appName = appId;
    this._routerType = type;

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type: %s\n  Backend Table: %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this._backends, null, 2)] });
  }

  get routerType() {
    return this._routerType;
  }

  // Function to convert size strings to numeric tokens
  #sizeToBytes(sizeStr) {
    const size = parseFloat(sizeStr);
    const unit = sizeStr.replace(size, '').trim().toLowerCase();

    switch (unit) {
      case 'k':
        return size * 1000; // Convert to K tokens
      case 'm':
        return size * 1000 * 1000; // Convert to M tokens
      default:
        return size; // Assume numeric tokens if no (or wrong) unit is specified
    }
  };

  #inferEndpoint(messages) {
    let tokens;
    let idx = -1;
    for (let i = 0; i < this._backends.length; i++) {
      switch (this._backends[i].model) {
        case ModelFamily.GPT_3_5:
        case ModelFamily.GPT_4:
        case ModelFamily.o1:
          tokens = encodeChat(messages, cl100k_base);
          break;
        case ModelFamily.GPT_4o:
        case ModelFamily.GPT_4_1:
        case ModelFamily.GPT_5:
        case ModelFamily.o3:
        case ModelFamily.o4:
          tokens = encodeChat(messages, o200k_base);
          break;
      };

      if (tokens <= this._backends[i].threshold) {
        idx = i;

        break;
      };
    };

    // Return index of last endpoint in case message tokens are above the configured threshold for all models.
    return ({ epIdx: (idx !== -1) ? idx : this._backends.length - 1, tokenCount: tokens });
  }

  getEndpointId(request) {
    // Get the endpoint ID based on the prompt tokens, model id and payload threshold (tokens) associated with an endpoint
    const result = this.#inferEndpoint(request.body.messages);

    logger.log({ level: "info", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d\n  Endpoint Spec.: %s\n  Token Count: %d", splat: [scriptName, this.constructor.name, request.id, this._appName, result.epIdx, JSON.stringify(this._backends[result.epIdx]), result.tokenCount] });

    return (result.epIdx);
  }
}

/**
 * IMP:
 * 1) Make sure to set a unique ID for each endpoint when using this routing algorithm!
 * 2) 'days' config param should list the days of the week when the endpoint is considered active
 * 3) 'startHour' and 'endHour' config params should be a value between 0 and 24
 */
class TimeAwareRouter { // Time aware router; ID08212025.n

  constructor(appId, endpointObj, type) {
    this._backends = new Array();
    endpointObj.forEach(element => {
      this._backends.push({ id: element?.id, uri: element.uri, days: element.days, startHour: element.startHour, endHour: element.endHour });
    });

    this._appName = appId;
    this._routerType = type;

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type: %s\n  Backend Table: %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this._backends, null, 2)] });
  }

  get routerType() {
    return this._routerType;
  }

  #inferEndpoint() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday

    const epIdx = this._backends.find(({ days, startHour, endHour }) =>
      days.includes(currentDay) && currentHour >= startHour && currentHour < endHour
    );

    if (!epIdx)
      epIdx = 0; // Default to the first endpoint

    return (epIdx);
  }

  getEndpointId(request) {
    // Get the endpoint ID based the current time and hours configured for each endpoint
    const epIdx = this.#inferEndpoint();

    logger.log({ level: "info", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d\n  Endpoint Spec.: %s", splat: [scriptName, this.constructor.name, request.id, this._appName, epIdx, JSON.stringify(this._backends[epIdx])] });

    return (epIdx);
  }
}

module.exports = {
  TrafficRouterFactory, // ID08082025.n, ID08222025.n
}