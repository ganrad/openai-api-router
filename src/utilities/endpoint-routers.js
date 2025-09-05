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
 * ID08292025: ganrad: v2.5.0: Introduced BudgetAwareRouter implementation.
 * ID09022025: ganrad: v2.5.0: Introduced AdaptiveBudgetAwareRouter implementation.
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');
const {
  DefaultEndpointLatency,
  CustomRequestHeaders,
  EndpointRouterTypes,
  AdaptiveRouterStrategies, // ID09022025.n
  AdaptiveRouterStrategyTiers, // ID09022025.n
  ConfigValidationStatus, // ID08222025.n
  ModelFamily,
  OpenAIChatCompletionMsgRoleTypes, // ID08202025.n 
  RouterBudgetTiers // ID08292025.n
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

  static create(
    appId, // AI Application ID
    routerType, // Endpoint Router Type
    endpointObj, // Endpoints
    routerSettingsObj, // Adaptive router settings; ID09022025.n
    appModelCostCatalog) { // Model cost/pricing catalog; ID08292025.n

    let validationStatus = ConfigValidationStatus.Passed;
    let router = null;  // Default ~ validation failed!
    let error = null;

    switch (routerType) {
      case EndpointRouterTypes.LRURouter: // ID08222025.n
        router = new LRURouter(appId, routerType, endpointObj);
        break;
      case EndpointRouterTypes.LeastConnectionsRouter: // ID08222025.n
        router = new LeastConnectionsRouter(appId, routerType, endpointObj);
        break;
      case EndpointRouterTypes.HeaderValueRouter: // ID08222025.n
        // Loop thru all the endpoints and check if 'id' attribute exists
        for (let i = 0; i < endpointObj.length; i++) {
          if (!Object.hasOwn(endpointObj[i], "id")) {
            validationStatus = ConfigValidationStatus.Failed;

            break;
          };
        };

        if (validationStatus === ConfigValidationStatus.Passed)
          router = new HeaderValueRouter(appId, routerType, endpointObj);
        else {
          // Log the error and exit -
          error = "Attribute 'id' must be defined for all configured endpoints. Check endpoint configuration. Falling back to default router (Priority) implementation.";
          logger.log({ level: "warn", message: "[%s] TrafficRouterFactory.create():\n  App ID: %s\n  Router Type: %s\n  Error: %s", splat: [scriptName, appId, routerType, error] });
        };
        break;
      case EndpointRouterTypes.WeightedDynamicRouter: // ID08222025.n
      case EndpointRouterTypes.WeightedRandomRouter: // ID08222025.n
        // Check if 'weight' attribute is specified for each endpoint and the total of all endpoint weights equals 100.
        let totalWeight = 0;
        for (let i = 0; i < endpointObj.length; i++) {
          if (! "weight" in endpointObj[i]) {
            validationStatus = ConfigValidationStatus.Failed;

            break;
          }
          else
            totalWeight += endpointObj[i].weight;
        };

        if (validationStatus === ConfigValidationStatus.Passed) {
          if (totalWeight === 100)
            router = (type === EndpointRouterTypes.WeightedDynamicRouter) ? new WeightedDynamicRouter(appId, routerType, endpointObj) : new WeightedRandomRouter(appId, routerType, endpointObj);
          else {
            // Log the error and exit -
            error = "The sum of all endpoint weights ('weight' attribute) should equal 100. Check endpoint configuration & update weights. Falling back to default router (Priority) implementation.";
            logger.log({ level: "warn", message: "[%s] TrafficRouterFactory.create():\n  App ID: %s\n  Router Type: %s\n  Error: %s", splat: [scriptName, appId, routerType, error] });
          };
        }
        else {
          // Log the error and exit -
          error = "Attribute 'weight' must be defined for all configured endpoints. Check endpoint configuration. Falling back to default router (Priority) implementation.";
          logger.log({ level: "warn", message: "[%s] TrafficRouterFactory.create():\n  App ID: %s\n  Router Type: %s\n  Error: %s", splat: [scriptName, appId, routerType, error] });
        };
        break;
      case EndpointRouterTypes.PayloadSizeRouter: // ID08222025.n
        // Loop thru all the endpoints and check if 'payloadThreshold' attribute has been defined.
        for (let i = 0; i < endpointObj.length; i++) {
          if (!TrafficRouterFactory.#isStringValid(endpointObj[i].payloadThreshold)) {
            validationStatus = ConfigValidationStatus.Failed;

            break;
          };
        };

        if (validationStatus === ConfigValidationStatus.Passed)
          router = new PayloadSizeRouter(appId, routerType, endpointObj);
        else {
          // Log the error and exit -
          error = "Attribute 'payloadThreshold' must be defined for all configured endpoints. Check endpoint configuration. Falling back to default router (Priority) implementation.";
          logger.log({ level: "warn", message: "[%s] TrafficRouterFactory.create():\n  App ID: %s\n  Router Type: %s\n  Error: %s", splat: [scriptName, appId, routerType, error] });
        };
        break;
      case EndpointRouterTypes.ModelAwareRouter: // ID08222025.n
        // Loop thru all the endpoints and check if 'id' and 'task' attributes exist
        for (let i = 0; i < endpointObj.length; i++) {
          // Check to see if 'id' and 'task' array exists?
          if (!Object.hasOwn(endpointObj[i], "id") || !endpointObj[i].task) {
            validationStatus = ConfigValidationStatus.Failed;

            break;
          };
        };

        if (validationStatus === ConfigValidationStatus.Passed)
          router = new ModelAwareRouter(appId, routerType, endpointObj);
        else {
          // Log the error and exit -
          error = "Attributes 'id' and 'task' must be defined for all configured endpoints. Check endpoint configuration. Falling back to default router (Priority) implementation.";
          logger.log({ level: "warn", message: "[%s] TrafficRouterFactory.create():\n  App ID: %s\n  Router Type: %s\n  Error: %s", splat: [scriptName, appId, routerType, error] });
        };
        break;
      case EndpointRouterTypes.TokenAwareRouter: // ID08222025.n
        // Loop thru all the endpoints and check if 'model' & 'payloadThreshold' attributes have been defined.
        for (let i = 0; i < endpointObj.length; i++) {
          // Check to see if task array exists?
          if (!Object.hasOwn(endpointObj[i], "id") || !TrafficRouterFactory.#isStringValid(endpointObj[i].model) || !TrafficRouterFactory.#isStringValid(endpointObj[i].payloadThreshold)) {
            validationStatus = ConfigValidationStatus.Failed;

            break;
          };
        };

        if (validationStatus === ConfigValidationStatus.Passed)
          router = new TokenAwareRouter(appId, routerType, endpointObj);
        else {
          // Log the error and exit -
          error = "Attributes 'id', 'model' and 'payloadThreshold' must be specified for all configured endpoints. Check endpoint configuration. Falling back to default router (Priority) implementation.";
          logger.log({ level: "warn", message: "[%s] TrafficRouterFactory.create():\n  App ID: %s\n  Router Type: %s\n  Error: %s", splat: [scriptName, appId, routerType, error] });
        };
        break;
      case EndpointRouterTypes.TimeAwareRouter: // ID08222025.n
        // Loop thru all the endpoints and check if 'id', 'days', 'startHour' and 'endHour' attributes have been defined.
        for (let i = 0; i < endpointObj.length; i++) {
          // Check to see if task array exists?
          if ((!Object.hasOwn(endpointObj[i], "id") || ! "days" in endpointObj[i]) || (! "startHour" in endpointObj[i]) || (! "endHour" in endpointObj[i])) {
            validationStatus = ConfigValidationStatus.Failed;

            break;
          };
        };

        if (validationStatus === ConfigValidationStatus.Passed)
          router = new TimeAwareRouter(appId, routerType, endpointObj);
        else {
          // Log the error and exit -
          error = "Attributes 'id', 'days', 'startHour' and 'endHour' must be defined for all configured endpoints. Check endpoint configuration. Falling back to default router (Priority) implementation.";
          logger.log({ level: "warn", message: "[%s] TrafficRouterFactory.create():\n  App ID: %s\n  Router Type: %s\n  Error: %s", splat: [scriptName, appId, routerType, error] });
        };
        break;
      case EndpointRouterTypes.BudgetAwareRouter: // ID08292025.n
        if (!appModelCostCatalog) // Fail if app model cost catalog is empty
          validationStatus = ConfigValidationStatus.Failed;

        if (validationStatus === ConfigValidationStatus.Passed)
          endpointObj.some((element) => {
            if (!element.budget || (!appModelCostCatalog.find(model => model.modelName === element.budget.modelName))) {
              validationStatus = ConfigValidationStatus.Failed; // Fail if model associated with endpoint doesn't have pricing info. in cost catalog

              return (true);
            };

            if (!element.budget?.costBudgets) { // Fail if cost budgets have not been specified for endpoints
              validationStatus = ConfigValidationStatus.Failed;

              return (true);
            };

            return (false);
          });

        if (validationStatus === ConfigValidationStatus.Passed)
          router = new BudgetAwareRouter(appId, routerType, endpointObj, appModelCostCatalog);
        else {
          // Log the error and exit -
          error = "Endpoint model cost budgets 'budget.costBudgets' or model pricing catalog is not configured properly. Check application configuration. Falling back to default router (Priority) implementation.";
          logger.log({ level: "warn", message: "[%s] TrafficRouterFactory.create():\n  App ID: %s\n  Router Type: %s\n  Error: %s", splat: [scriptName, appId, routerType, error] });
        };
        break;
      case EndpointRouterTypes.AdaptiveBudgetAwareRouter: // ID09022025.n
        if (!appModelCostCatalog) // Fail if app model cost catalog is empty
          validationStatus = ConfigValidationStatus.Failed;

        if (validationStatus === ConfigValidationStatus.Passed)
          router = new AdaptiveBudgetAwareRouter(appId, routerType, endpointObj, routerSettingsObj, appModelCostCatalog);
        else {
          // Log the error and exit -
          error = "Endpoint model cost budgets 'budget.costBudgets' or model pricing catalog is not configured properly. Check application configuration. Falling back to default router (Priority) implementation.";
          logger.log({ level: "warn", message: "[%s] TrafficRouterFactory.create():\n  App ID: %s\n  Router Type: %s\n  Error: %s", splat: [scriptName, appId, routerType, error] });
        };
        break;
    };

    return (router);
  }
}

class WeightedRandomRouter { // Random Weighted Router.  Uses static weights to pick an endpoint ID.

  constructor(appId, type, endpointObj) {
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
    logger.log({ level: "debug", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d", splat: [scriptName, this.constructor.name, request.id, this._appName, epIdx] });

    return (epIdx);
  }
}

class WeightedDynamicRouter { // Latency Weighted Router
  constructor(appId, type, endpointObj) {
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
    logger.log({ level: "debug", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d", splat: [scriptName, this.constructor.name, request.id, this._appName, epIdx] });

    return (epIdx);
  }
}

class LRURouter { // Least Recently Used a.k.a Round Robin Router

  constructor(appId, type, endpointObj) {
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

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type: %s\n  Endpoint Table:\n%s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this.#getLRUTable(), null, 2)] });
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
    logger.log({ level: "debug", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d\n  Endpoint URI: %s\n  Endpoint Table:\n%s", splat: [scriptName, this.constructor.name, request.id, this._appName, epIdx, backendUri, JSON.stringify(this.#getLRUTable(), null, 2)] });

    return (epIdx);
  }
}

class LeastConnectionsRouter { // Least Active Connections Router

  constructor(appId, type, endpointObj) {
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

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type: %s\n  Endpoint Table:\n%s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this._uriConnections, null, 2)] });
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
    logger.log({ level: "debug", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d\n  Endpoint URI: %s\n  Endpoint Table:\n%s", splat: [scriptName, this.constructor.name, request.id, this._appName, epIdx, uri, JSON.stringify(this._uriConnections, null, 2)] });

    return (epIdx);
  }
}

class PayloadSizeRouter { // Payload size router; ID08052025.n

  constructor(appId, type, endpointObj) {
    this._backends = new Array();
    endpointObj.forEach(element => {
      this._backends.push({ uri: element.uri, threshold: element.payloadThreshold });
    });

    this._appName = appId;
    this._routerType = type;

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type: %s\n  Backend Table:\n%s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this._backends, null, 2)] });
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
    logger.log({ level: "debug", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Payload Size (Bytes): %d\n  Endpoint ID: %d\n  Endpoint URI: %s", splat: [scriptName, this.constructor.name, request.id, this._appName, payloadSize, epIdx, this._backends[epIdx].uri] });

    return (epIdx);
  }
}

/**
 * IMP: Make sure to set a unique ID for each endpoint when using this routing algorithm!
 */
class HeaderValueRouter { // Header value ('x-endpoint-id') router; ID08052025.n

  constructor(appId, type, endpointObj) {
    this._backends = new Array();
    endpointObj.forEach(element => {
      this._backends.push({ id: element?.id, uri: element.uri });
    });

    this._appName = appId;
    this._routerType = type;

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type: %s\n  Backend Table:\n%s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this._backends, null, 2)] });
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
    logger.log({ level: "debug", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Header (x-endpoint-id): %s\n  Endpoint ID: %d\n  Endpoint URI: %s", splat: [scriptName, this.constructor.name, request.id, this._appName, endpointId, epIdx, this._backends[epIdx].uri] });

    return (epIdx);
  }
}

/**
 * IMP: Make sure to set a unique ID for each endpoint when using this routing algorithm!
 */
class ModelAwareRouter { // Model aware router; ID08052025.n

  constructor(appId, type, endpointObj) {
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

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type: %s\n  Backend Table:\n%s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this._backends, null, 2)] });
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

    logger.log({ level: "debug", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d\n  Message Role Type: %s\n  Endpoint Terms:\n%s\n  Matched Term: %s", splat: [scriptName, this.constructor.name, request.id, this._appName, result.epIdx, this._msgRoleType, JSON.stringify(this._backends[result.epIdx], null, 2), result.term] });

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

  constructor(appId, type, endpointObj) {
    this._backends = new Array();
    endpointObj.forEach(element => {
      this._backends.push({ id: element?.id, uri: element.uri, model: element.model, threshold: this.#sizeToBytes(element.payloadThreshold) });
    });

    this._appName = appId;
    this._routerType = type;

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type: %s\n  Backend Table:\n%s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this._backends, null, 2)] });
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

    logger.log({ level: "debug", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d\n  Endpoint Spec.:\n%s\n  Token Count: %d", splat: [scriptName, this.constructor.name, request.id, this._appName, result.epIdx, JSON.stringify(this._backends[result.epIdx], null, 2), result.tokenCount] });

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

  constructor(appId, type, endpointObj) {
    this._backends = new Array();
    endpointObj.forEach(element => {
      this._backends.push({ id: element?.id, uri: element.uri, days: element.days, startHour: element.startHour, endHour: element.endHour });
    });

    this._appName = appId;
    this._routerType = type;

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type: %s\n  Backend Table:\n%s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this._backends, null, 2)] });
  }

  get routerType() {
    return this._routerType;
  }

  #inferEndpoint() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday

    let epIdx = 0; // Default to the first endpoint
    const backend = this._backends.find(({ days, startHour, endHour }, index) => {
      if (days.includes(currentDay) && currentHour >= startHour && currentHour < endHour) {
        epIdx = index;

        return(true);
      }
      else 
        return(false);
    });

    return(epIdx);
  }

  getEndpointId(request) {
    // Get the endpoint ID based the current time and hours configured for each endpoint
    const epIdx = this.#inferEndpoint();

    logger.log({ level: "debug", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d\n  Endpoint Spec.:\n%s", splat: [scriptName, this.constructor.name, request.id, this._appName, epIdx, JSON.stringify(this._backends.find((b,index) => index === epIdx), null, 2)] });

    return(epIdx);
  }
}

/**
 * This router estimates the prompt tokens (using heuristics), computes the estimated cost and then uses this info.
 * for budget based routing decisions.
 * 
 * IMP:
 * 1) Endpoint id is not mandatory
 */
class BudgetAwareRouter { // ID08292025.n

  constructor(appId, type, endpointObj, costCatalog) {
    this._tiers = [RouterBudgetTiers.Hourly, RouterBudgetTiers.Daily, RouterBudgetTiers.Weekly, RouterBudgetTiers.Monthly];

    this._backends = new Array();
    endpointObj.forEach((element, index) => {
      const modelObj = costCatalog.find(model => model.modelName === element.budget.modelName);

      this._backends.push(
        {
          id: index,
          name: element.id ?? "index-" + index,
          uri: element.uri,
          model: element.budget.modelName,
          defBackend: element.budget.defaultEndpoint ?? false,
          inputCostPer1K: modelObj.tokenPriceInfo.inputTokensCostPer1k,
          cachedInputCostPer1K: modelObj.tokenPriceInfo.cachedInputTokensCostPer1k,
          outputCostPer1K: modelObj.tokenPriceInfo.outputTokensCostPer1k,
          budgets: {
            hourly: {
              limit: element.budget.costBudgets.hourly,
              remaining: element.budget.costBudgets.hourly,
              lastReset: Date.now()
            },
            daily: {
              limit: element.budget.costBudgets.daily,
              remaining: element.budget.costBudgets.daily,
              lastReset: Date.now()
            },
            weekly: {
              limit: element.budget.costBudgets.weekly,
              remaining: element.budget.costBudgets.weekly,
              lastReset: Date.now()
            },
            monthly: {
              limit: element.budget.costBudgets.monthly,
              remaining: element.budget.costBudgets.monthly,
              lastReset: Date.now()
            },
          }
        });
    });

    this._appName = appId;
    this._routerType = type;

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type: %s\n  Backend Table:\n%s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this._backends, null, 2)] });
  }

  get routerType() {
    return this._routerType;
  }

  // Fallback heuristic if gpt-tokenizer is unavailable or fails
  #estimateInputTokensHeuristic(messages) {
    let totalTokens = 0;
    for (const msg of messages) {
      if (!msg.role || !msg.content || typeof msg.content !== 'string') {
        continue;
      }
      // Heuristic: 1 token for role + 1.3 tokens per word + 4 for overhead
      const words = msg.content.split(/\s+/).length;
      totalTokens += 1 + Math.ceil(words * 1.3) + 4;
    }
    totalTokens += 3; // Conversation wrapper

    return Math.ceil(totalTokens);
  }

  // Estimate cost for a backend
  #estimateCost(backend, inputTokens, estimatedOutputTokens = 500) { // Conservative output estimate
    estimatedOutputTokens = estimatedOutputTokens ?? 500; // To be safe!

    const inputCost = (inputTokens / 1000) * backend.inputCostPer1K;
    const outputCost = (estimatedOutputTokens / 1000) * backend.outputCostPer1K;
    return inputCost + outputCost;
  }

  // Function to calculate actual cost post LLM API call
  #calculateActualCost(backend, tokenUsage) {
    let callTotalCost = 0;

    if (!tokenUsage) return (callTotalCost); // Just to be safe ...

    const promptTokens = tokenUsage.prompt_tokens;
    const cachedTokens = tokenUsage.prompt_tokens_details?.cached_tokens ?? 0;
    const completionTokens = tokenUsage.completion_tokens ?? 0;

    const promptTokensCost = ((promptTokens - cachedTokens) * backend.inputCostPer1K) / 1000;
    const cachedInputTokensCost = cachedTokens ? (cachedTokens * backend.cachedInputCostPer1K) / 1000 : 0;
    const completionTokensCost = completionTokens ? (completionTokens * backend.outputCostPer1K) / 1000 : 0;

    callTotalCost = promptTokensCost + cachedInputTokensCost + completionTokensCost;

    return (callTotalCost);
  }

  // Check if a period needs reset based on UTC time
  #needsReset(period, lastReset) {
    const now = new Date();
    const last = new Date(lastReset);

    if (period === RouterBudgetTiers.Hourly)
      return now.getUTCHours() !== last.getUTCHours();
    else if (period === RouterBudgetTiers.Daily)
      return now.getUTCDate() !== last.getUTCDate() || now.getUTCMonth() !== last.getUTCMonth() || now.getUTCFullYear() !== last.getUTCFullYear();
    else if (period === RouterBudgetTiers.Weekly) {
      // Week starts on Monday (ISO week)
      function getISOWeek(date) {
        const d = new Date(date);
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));

        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      }

      return getISOWeek(now) !== getISOWeek(last) || now.getUTCFullYear() !== last.getUTCFullYear();
    }
    else if (period === RouterBudgetTiers.Monthly)
      return now.getUTCMonth() !== last.getUTCMonth() || now.getUTCFullYear() !== last.getUTCFullYear();

    return false;
  }

  // Get new reset timestamp for a period (UTC start of period)
  #getNewResetTimestamp(period) {
    const now = new Date();

    if (period === RouterBudgetTiers.Hourly)
      now.setUTCMinutes(0, 0, 0);
    else if (period === RouterBudgetTiers.Daily)
      now.setUTCHours(0, 0, 0, 0);
    else if (period === RouterBudgetTiers.Weekly) {
      // Set to Monday 00:00 UTC
      const day = now.getUTCDay();
      const diff = (day === 0 ? -6 : 1 - day); // Monday is 1

      now.setUTCDate(now.getUTCDate() + diff);
      now.setUTCHours(0, 0, 0, 0);
    }
    else if (period === RouterBudgetTiers.Monthly) {
      now.setUTCDate(1);
      now.setUTCHours(0, 0, 0, 0);
    }

    return now.getTime();
  }

  // Update all budgets for a backend if needed
  #updateBudgets(backend) {
    for (const period in backend.budgets) {
      if (this.#needsReset(period, backend.budgets[period].lastReset)) {
        backend.budgets[period].remaining = backend.budgets[period].limit;
        backend.budgets[period].lastReset = this.#getNewResetTimestamp(period);

        const backendInfo = {
          endpointId: backend.name,
          period: period,
          limit: backend.budgets[period].limit
        };
        // console.log(`Reset ${period} budget for ${backend.name} to $${backend.budgets[period].limit}`);
        logger.log({ level: "debug", message: "[%s] %s.#updateBudgets(): Reset budget for backend\n  Request ID: %s\n  Endpoint Info.:\n  %s", splat: [scriptName, this.constructor.name, request.id, JSON.stringify(backendInfo, null, 2)] });
      }
    }
  }

  // Map tier to the periods it includes (itself + larger)
  #getPeriodsForTier(tier) {
    const tierIndex = this._tiers.indexOf(tier);
    return this._tiers.slice(tierIndex);
  }

  // Get effective remaining (min across all periods after update)
  #getEffectiveRemaining(backend, tier) {
    this.#updateBudgets(backend);
    const periods = this.#getPeriodsForTier(tier);
    return Math.min(...periods.map(p => backend.budgets[p].remaining));
  }

  getEndpointId(request) {
    const inputTokens = this.#estimateInputTokensHeuristic(request.body.messages); // Generalized method for computing tokens;

    let selectedBackend = null;
    let selectedTier = null;
    for (const tier of this._tiers) {
      // Compute eligible for this tier: estCost <= effectiveRemaining(tier)
      const eligibleBackends = this._backends
        .map(backend => {
          const effectiveRemaining = this.#getEffectiveRemaining(backend, tier);
          const completionTokens = request.body.max_completion_tokens;
          const estimatedCost = this.#estimateCost(backend, inputTokens, completionTokens);

          return { ...backend, effectiveRemaining, estimatedCost, inputTokens, completionTokens, tier };
        })
        .filter(backend => backend.estimatedCost <= backend.effectiveRemaining)
        .sort((a, b) => a.estimatedCost - b.estimatedCost); // Cheapest first

      if (eligibleBackends.length > 0) {
        selectedBackend = eligibleBackends[0];
        selectedTier = tier;

        break;
      };

      logger.log({ level: "debug", message: "[%s] %s.getEndpointId(): No eligible backends in this tier. Moving to the next tier.\n  Request ID: %s\n  Tier: %s", splat: [scriptName, this.constructor.name, request.id, tier] });
    };

    if (!selectedBackend)
      // No backend available within any budget tier constraints, hence return the default endpoint
      selectedBackend = this._backends.find(backend => backend.defBackend);

    // console.log(`Routing to ${selectedBackend.name} in ${selectedTier} tier (est. cost: $${selectedBackend.estimatedCost.toFixed(4)}, effective remaining: $${selectedBackend.effectiveRemaining.toFixed(2)})`);
    const backendInfo = {
      id: selectedBackend.id,
      name: selectedBackend.name,
      tier: selectedTier,
      promptTokens: selectedBackend.inputTokens,
      completionTokens: selectedBackend.completionTokens,
      totalTokens: selectedBackend.inputTokens + selectedBackend.completionTokens,
      estimatedCost: selectedBackend.estimatedCost?.toFixed(4),
      effectiveRemaining: selectedBackend.effectiveRemaining?.toFixed(2)
    };

    logger.log({ level: "debug", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Selected Endpoint Spec.:\n%s", splat: [scriptName, this.constructor.name, request.id, this._appName, JSON.stringify(backendInfo, null, 2)] });

    return (selectedBackend.id);
  }

  updateActualCost(reqid, id, tokenUsage) {
    const selectedBackend = this._backends.find(backend => backend.id === id);

    const actualCost = this.#calculateActualCost(selectedBackend, tokenUsage);

    this.#updateBudgets(selectedBackend); // Re-check for rollovers

    // Update all remainings (deduct from EVERY period, regardless of tier)
    for (const period in selectedBackend.budgets) {
      selectedBackend.budgets[period].remaining -= actualCost;
      if (selectedBackend.budgets[period].remaining < 0) {
        selectedBackend.budgets[period].remaining = 0; // Clamp
      }
    };

    const costInfo = {
      endpointId: id,
      endpointName: selectedBackend.name,
      promptTokens: tokenUsage.prompt_tokens,
      cachedInputTokens: tokenUsage.prompt_tokens_details?.cached_tokens,
      completionTokens: tokenUsage.completion_tokens,
      totalTokens: tokenUsage.total_tokens,
      actualCost: actualCost.toFixed(4)
    };
    // console.log(`Actual cost: $${actualCost.toFixed(4)}. Updated all remainings for ${selectedBackend.name}`);
    logger.log({ level: "debug", message: "[%s] %s.updateActualCost():\n  Request ID: %s\n  App ID: %s\n  Cost Info.:\n%s", splat: [scriptName, this.constructor.name, reqid, this._appName, JSON.stringify(costInfo, null, 2)] });
  }
}

/**
 * Pure in-memory metrics with aligned sliding windows
 */
class MetricsStore {

  constructor() {
    // structure:
    // this.backends[name] = {
    //   config: { hourly: 20, daily: 50, ...},
    //   windows: {
    //     hourly: { start: iso, inputTokens, cachedInputTokens, outputTokens, cost },
    //     daily: { ... }, ...
    //   }
    // }

    this.timeWindows = [RouterBudgetTiers.Hourly, RouterBudgetTiers.Daily, RouterBudgetTiers.Weekly, RouterBudgetTiers.Monthly];
    this.backends = Object.create(null);
  }

  // hourly (YYYY-MM-DDTHH:00:00Z), daily (YYYY-MM-DDT00:00:00Z),
  // weekly (ISO week starting Monday 00:00:00Z), monthly (YYYY-MM-01T00:00:00Z)

  #isoHourStart(d = new Date()) {
    const z = new Date(d.toISOString());
    z.setUTCMinutes(0, 0, 0);
    return z.toISOString();
  }

  #isoDayStart(d = new Date()) {
    const z = new Date(d.toISOString());
    z.setUTCHours(0, 0, 0, 0);
    return z.toISOString();
  }

  #isoMonthStart(d = new Date()) {
    const z = new Date(d.toISOString());
    z.setUTCDate(1);
    z.setUTCHours(0, 0, 0, 0);

    return z.toISOString();
  }

  #isoWeekStart(d = new Date()) {
    // ISO week starts Monday
    const date = new Date(d.toISOString());
    const day = (date.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
    date.setUTCDate(date.getUTCDate() - day);
    date.setUTCHours(0, 0, 0, 0);

    return date.toISOString();
  }

  #normalizeBackendConf(c) {
    // Ensure budgets exist for all windows (fallback to monthly)
    const budgets = Object.assign({}, c.budgets || {});

    budgets.hourly = budgets.hourly ?? budgets.daily ?? budgets.monthly ?? 0;
    budgets.daily = budgets.daily ?? budgets.monthly ?? 0;
    budgets.weekly = budgets.weekly ?? budgets.monthly ?? 0;
    budgets.monthly = budgets.monthly ?? 0;

    return Object.assign({}, c, { budgets });
  }

  #freshWindows() {
    const now = new Date();

    return {
      hourly: { start: this.#isoHourStart(now), inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, cost: 0 },
      daily: { start: this.#isoDayStart(now), inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, cost: 0 },
      weekly: { start: this.#isoWeekStart(now), inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, cost: 0 },
      monthly: { start: this.#isoMonthStart(now), inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, cost: 0 }
    };
  }

  registerBackend(backend) {
    if (this.backends[backend.name]) return;

    this.backends[backend.name] = {
      config: this.#normalizeBackendConf(backend), // Backend config with updated budget thresholds
      windows: this.#freshWindows() // Consumed tokens and actual costs by window/tier
    };
    // console.log(`*****\nAll Registered backends:\n ${JSON.stringify(this.backends, null, 0)}\n*****`);
  }

  #rollIfNeeded(backend) {
    // roll windows if current start is older than computed
    const now = new Date();
    const expected = {
      hourly: this.#isoHourStart(now),
      daily: this.#isoDayStart(now),
      weekly: this.#isoWeekStart(now),
      monthly: this.#isoMonthStart(now)
    };

    for (const w of this.timeWindows) {
      if (backend.windows[w].start !== expected[w])
        backend.windows[w] = { start: expected[w], inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, cost: 0 };
    };
  }

  updateUsage(backendName, tokenUsage) {
    const backend = this.backends[backendName];

    // roll windows for backend if needed
    this.#rollIfNeeded(backend);

    for (const w of this.timeWindows) {  // Update token count and cost metrics
      backend.windows[w].inputTokens += tokenUsage.promptTokens;
      backend.windows[w].cachedInputTokens += tokenUsage.cachedTokens;
      backend.windows[w].outputTokens += tokenUsage.completionTokens;
      backend.windows[w].cost += tokenUsage.callTotalCost;
    };
  }

  getWindowUsage(backendName, windowType = RouterBudgetTiers.Monthly) {
    const backend = this.backends[backendName];

    this.#rollIfNeeded(backend);

    return { ...backend.windows[windowType] }; // Return shallow copy
  }

  getAllUsages(windowType = RouterBudgetTiers.Monthly) {
    const out = {};

    for (const name of Object.keys(this.backends)) {
      try {
        out[name] = this.getWindowUsage(name, windowType);
      } catch (e) { /* ignore */ }
    };

    return out;
  }

  getRemainingBudget(backendName, windowType = RouterBudgetTiers.Monthly) {
    const backend = this.backends[backendName];

    this.#rollIfNeeded(backend);

    const conf = backend.config;
    const used = backend.windows[windowType].cost || 0;
    const budget = conf.budgets && conf.budgets[windowType] != null ? conf.budgets[windowType] : conf.budgets.monthly;

    return Math.max(0, (budget || 0) - used);
  }

  isUnderBudget(backendName, windowType = RouterBudgetTiers.Monthly) {
    const remaining = this.getRemainingBudget(backendName, windowType);

    return remaining > 0;
  }

  resetBackend(backendName) {
    const backend = this.backends[backendName];

    backend.windows = this.#freshWindows();
  }

  resetAll() {
    for (const name of Object.keys(this.backends)) this.resetBackend(name);
  }
}

/**
* This router uses one of many routing strategies to take endpoint routing decisions.  However, this adaptive budget based router doesn't
* take the token counts into account while making routing decisions.

* * Router Strategies:
*  - Priority: Use backends order, first under budget
*  - Round robin: Cycle among those under budget
*  - Least spent: Choose backend with highest remaining budget %
*  - Weighted random: Select backend by weight (skip exhausted)
*  - Adaptive: Prefer qualityTier A, B and then C but switch if remaining budget < threshold (~ 10%)

* IMP:
* 1) Endpoint id is not mandatory
*/
class AdaptiveBudgetAwareRouter { // ID09022025.n
  static MIN_COST_THRESHOLD = 0.10;

  constructor(
    appId,
    type,
    endpointObj,
    routerSettingsObj,
    costCatalog) {
    this._tiers = [RouterBudgetTiers.Hourly, RouterBudgetTiers.Daily, RouterBudgetTiers.Weekly, RouterBudgetTiers.Monthly];

    this._backends = new Array();
    endpointObj.forEach((element, index) => {
      const modelObj = costCatalog.find(model => model.modelName === element.budget.modelName);

      this._backends.push(
        {
          id: index,
          name: element.id ?? "index-" + index,
          uri: element.uri,
          model: element.budget.modelName,
          defBackend: element.budget.defaultEndpoint ?? false,
          inputCostPer1K: modelObj.tokenPriceInfo.inputTokensCostPer1k,
          cachedInputCostPer1K: modelObj.tokenPriceInfo.cachedInputTokensCostPer1k,
          outputCostPer1K: modelObj.tokenPriceInfo.outputTokensCostPer1k,
          weight: element.weight,
          qualityTier: element.qualityTier,
          budgets: {
            hourly: element.budget.costBudgets.hourly,
            daily: element.budget.costBudgets.daily,
            weekly: element.budget.costBudgets.weekly,
            monthly: element.budget.costBudgets.monthly
          }
        });
    });

    this._metrics = new MetricsStore();
    for (const backend of this._backends) this._metrics.registerBackend(backend);

    this._strategy = (routerSettingsObj) ? (routerSettingsObj.strategy ?? AdaptiveRouterStrategies.Priority) : AdaptiveRouterStrategies.Priority;
    this._windowType = (routerSettingsObj) ? (routerSettingsObj.windowType ?? RouterBudgetTiers.Monthly) : RouterBudgetTiers.Monthly;
    this._windowType = this._windowType.toLowerCase();
    this._appName = appId;
    this._routerType = type;
    this._rrIndex = 0; // Initialize round-robin index

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type: %s\n  Strategy: %s\n  Window Type: %s\n  Backend Table:\n%s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, this._strategy, this._windowType, JSON.stringify(this._backends, null, 2)] });
  }

  get routerType() {
    return this._routerType;
  }

  // Determine eligible backends under budget for configured window
  #eligibleBackends() {
    return this._backends.filter(backend => {
      try { return this._metrics.isUnderBudget(backend.name, this._windowType); } catch (e) { return false; }
    });
  }

  #pickPriority(eligible) {
    return eligible.length ? eligible[0] : null;
  }

  #pickRoundRobin(eligible) {
    if (!eligible.length) return null; // Array length shouldn't be null; just in case

    const idx = this._rrIndex % eligible.length;
    this._rrIndex = (this._rrIndex + 1) % Math.max(1, eligible.length);

    return eligible[idx];
  }

  #pickLeastSpent(eligible) {
    if (!eligible.length) return null; // Array length shouldn't be null; just in case

    // choose backend with largest remaining budget percentage
    const withPct = eligible.map(b => {
      const rem = this._metrics.getRemainingBudget(b.name, this._windowType);
      const budget = b.budgets ? b.budgets[this._windowType] ?? b.budgets.monthly : 0;
      const pct = budget > 0 ? rem / budget : 0;
      return { b, pct };
    });

    withPct.sort((a, z) => z.pct - a.pct); // Sort the array ~ highest remaining first

    // console.log(`*****\nLeast Spent backends:\n ${JSON.stringify(withPct, null, 0)}\n*****`);
    return withPct[0].b;
  }

  #pickWeightedRandom(eligible) {
    if (!eligible.length) return null; // Array length shouldn't be null; just in case

    const tot = eligible.reduce((s, b) => s + (b.weight || 1), 0);
    let r = Math.random() * tot;
    for (const b of eligible) {
      r -= (b.weight || 1);
      if (r <= 0) return b;
    };

    return eligible[eligible.length - 1];
  }

  #pickAdaptive(eligible) {
    if (!eligible.length) return null; // Array length shouldn't be null; just in case

    // Prefer A then B then C, but if remaining budget of chosen tier < 10% pick next
    const tiers = [AdaptiveRouterStrategyTiers.TierA, AdaptiveRouterStrategyTiers.TierB, AdaptiveRouterStrategyTiers.TierC];
    for (const tier of tiers) {
      const candidates = eligible.filter(e => (e.qualityTier || AdaptiveRouterStrategyTiers.TierC) === tier);
      if (!candidates.length) continue;
      // console.log(`*****\nAdaptive backend candidates:\n${JSON.stringify({tier: tier, backends: candidates}, null, 0)}\n*****`);

      // Pick candidate with highest remaining %
      const picked = this.#pickLeastSpent(candidates);
      const rem = this._metrics.getRemainingBudget(picked.name, this._windowType);
      const budget = picked.budgets ? picked.budgets[this._windowType] ?? picked.budgets.monthly : 0;
      const pct = budget > 0 ? rem / budget : 0;
      // console.log(`*****\nPicked backend:\n${JSON.stringify({picked}, null, 0)}\nRemaining: ${rem}\nBudget: ${budget}\nPct: ${pct}\n*****`);
      if (pct >= AdaptiveBudgetAwareRouter.MIN_COST_THRESHOLD)
        return picked;
      // else try next tier
    };

    // Fallback to least spent among all backends
    return this.#pickLeastSpent(eligible);
  }

  #selectBackend() {
    const eligible = this.#eligibleBackends();

    if (!eligible.length) return null;

    switch (this._strategy) {
      case AdaptiveRouterStrategies.Priority: return this.#pickPriority(eligible);
      case AdaptiveRouterStrategies.RoundRobin: return this.#pickRoundRobin(eligible);
      case AdaptiveRouterStrategies.LeastSpent: return this.#pickLeastSpent(eligible);
      case AdaptiveRouterStrategies.WeightedRandom: return this.#pickWeightedRandom(eligible);
      case AdaptiveRouterStrategies.Adaptive: default: return this.#pickAdaptive(eligible);
    }
  }

  getEndpointId(request) {
    let selectedBackend = this.#selectBackend();

    if (!selectedBackend)
      // No backend available within any budget tier constraints, hence return the default endpoint
      selectedBackend = this._backends.find(backend => backend.defBackend);

    const backendInfo = {
      id: selectedBackend.id,
      name: selectedBackend.name,
      model: selectedBackend.model
    };
    logger.log({ level: "debug", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Router Strategy: %s\n  Selected Endpoint Spec.:\n%s", splat: [scriptName, this.constructor.name, request.id, this._appName, this._strategy, JSON.stringify(backendInfo, null, 2)] });

    return (selectedBackend.id);
  }

  updateActualCost(reqid, id, tokenUsage) {
    const selectedBackend = this._backends.find(backend => backend.id === id);
    // console.log(`***** Backend:\n${JSON.stringify(selectedBackend, null, 2)}`);

    const promptTokens = tokenUsage.prompt_tokens;
    const cachedTokens = tokenUsage.prompt_tokens_details?.cached_tokens ?? 0;
    const completionTokens = tokenUsage.completion_tokens ?? 0;

    const inputTokensCost = ((promptTokens - cachedTokens) * selectedBackend.inputCostPer1K) / 1000;
    const cachedInputTokensCost = (cachedTokens * selectedBackend.cachedInputCostPer1K) / 1000;
    const outputTokensCost = (completionTokens * selectedBackend.outputCostPer1K) / 1000;

    const actualCost = inputTokensCost + cachedInputTokensCost + outputTokensCost;

    this._metrics.updateUsage(
      selectedBackend.name,
      {
        inputTokens: promptTokens,
        cachedTokens: cachedTokens,
        completionTokens: completionTokens,
        callTotalCost: actualCost
      });

    const costInfo = {
      endpointId: id,
      endpointName: selectedBackend.name,
      promptTokens: promptTokens,
      cachedInputTokens: cachedTokens,
      completionTokens: completionTokens,
      totalTokens: tokenUsage.total_tokens,
      actualCost: actualCost.toFixed(4)
    };
    logger.log({ level: "debug", message: "[%s] %s.updateActualCost():\n  Request ID: %s\n  App ID: %s\n  Cost Info.:\n%s", splat: [scriptName, this.constructor.name, reqid, this._appName, JSON.stringify(costInfo, null, 2)] });
  }
}

module.exports = {
  TrafficRouterFactory, // ID08082025.n, ID08222025.n
}