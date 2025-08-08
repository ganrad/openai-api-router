
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
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');
const { DefaultEndpointLatency, CustomRequestHeaders } = require("./app-gtwy-constants.js"); // ID08052025.n

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

    logger.log({ level: "info", message: "[%s] %s.buildRoutingTable():\n  App ID: %s\n  Router Type:  %s\n  Router Config: %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(config, null, 2)] });
    return table;
  }

  /**
  get routingTable() {
    return this._routingTable;
  }
  */

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

    logger.log({ level: "info", message: "[%s] %s.rebuildRoutingTable():\n  App ID: %s\n  Router Type:  %s\n  Router Config: %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this.backendStats, null, 2)] });
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

  /**
  get routingTable() {
    return this._routingTable;
  }
  */

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

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type:  %s\n  Endpoint Table: %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this.#getLRUTable(), null, 2)] });
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
    logger.log({ level: "info", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d\n  Endpoint Table: %s", splat: [scriptName, this.constructor.name, request.id, this._appName, epIdx, this.#getLRUTable()] });

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

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type:  %s\n  Endpoint Table: %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this._uriConnections, null, 2)] });
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
    logger.log({ level: "info", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d\n  Endpoint Table: %s", splat: [scriptName, this.constructor.name, request.id, this._appName, epIdx, JSON.stringify(this._uriConnections, null, 2)] });

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

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type:  %s\n  Backend Table: %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this._backends, null, 2)] });
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
        return payloadSize < thresholdBytes;
    });

    // If no backend is found, use the last one as a default
    const epIdx = (backendIdx !== -1) ? backendIdx : this._backends.length - 1;
    logger.log({ level: "info", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Payload Size (Bytes): %d\n  Endpoint ID: %d", splat: [scriptName, this.constructor.name, request.id, this._appName, payloadSize, epIdx] });

    return (epIdx);
  }
}

class HeaderValueRouter { // Header value ('x-endpoint-id') router; ID08052025.n

  constructor(appId, endpointObj, type) {
    this._backends = new Array();
    endpointObj.forEach(element => {
      this._backends.push(element.id);
    });

    this._appName = appId;
    this._routerType = type;

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type:  %s\n  Backend Table: %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this._backends, null, 2)] });
  }

  get routerType() {
    return this._routerType;
  }

  getEndpointId(request) {
    // Retrieve the endpoint ID from the http header 'x-endpoint-id'
    const endpointId = request.headers[CustomRequestHeaders.EndpointId];
    if ( ! endpointId )
      return(0); // If header value is missing, return the first endpoint index

    // Determine the appropriate backend based on header value
    const backendIdx = this._backends.findIndex((backend) => { backend === endpointId });

    // If a matching backend is not found, use the index of the first endpoint as a default
    const epIdx = (backendIdx !== -1) ? backendIdx : 0;
    logger.log({ level: "info", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Header (x-endpoint-id): %s\n  Endpoint ID: %d", splat: [scriptName, this.constructor.name, request.id, this._appName, endpointId, epIdx] });

    return (epIdx);
  }
}

class ModelAwareRouter { // Model aware router; ID08052025.n

  constructor(appId, endpointObj, type) {
    this._backends = new Array();
    endpointObj.forEach(element => {
      this._backends.push({ id: element.id, task: element.task });
    });

    this._appName = appId;
    this._routerType = type;

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type:  %s\n  Backend Table: %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this._backends, null, 2)] });
  }

  get routerType() {
    return this._routerType;
  }

  #inferTask(messages) {
    const sysPrompt = messages.find(m => m.role === 'system')?.content || '';

    let task;
    for ( i=0; i < this._backends.length; i++) {
      task = this._backends[i].task;
      if ( sysPrompt.toLowerCase().includes(task) )
        return(i);
    };

    return(-1); // Task not found!
  }

  getEndpointId(request) {
    // Retrieve the endpoint ID based on the task contained in the system prompt
    const backendIdx = this.#inferTask(request.body.messages);
    const epIdx = (backendIdx !== -1) ? backendIdx : 0; // If task could not be identified, return the first endpoint index
    
    logger.log({ level: "info", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Task Found: %d\n  Endpoint Task: %s\n  Endpoint ID: %d", splat: [scriptName, this.constructor.name, request.id, this._appName, (backendIdx !== -1), this._backends[epIdx].task, epIdx] });

    return (epIdx);
  }
}

module.exports = {
  LRURouter,
  LeastConnectionsRouter,
  WeightedRandomRouter,
  WeightedDynamicRouter,
  PayloadSizeRouter, // ID08052025.n
  HeaderValueRouter, // ID08052025.n
  ModelAwareRouter // ID08052025.n
}