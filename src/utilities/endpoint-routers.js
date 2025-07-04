
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
 * 
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');
const { DefaultEndpointLatency } = require("./app-gtwy-constants.js");

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

    logger.log({ level: "info", message: "[%s] %s.buildRoutingTable():\n  App ID: %s\n  Router Type:  %s\n  Router Config: %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(config,null,2)] });
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

  getEndpointId(requestId) {
    const epIdx = this._routingTable[Math.floor(Math.random() * this._routingTable.length)];
    logger.log({ level: "info", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d", splat: [scriptName, this.constructor.name, requestId, this._appName, epIdx] });

    return(epIdx);
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

    logger.log({ level: "info", message: "[%s] %s.rebuildRoutingTable():\n  App ID: %s\n  Router Type:  %s\n  Router Config: %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this.backendStats,null,2)] });
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

  getEndpointId(requestId) {
    const epIdx = this._routingTable[Math.floor(Math.random() * this._routingTable.length)];
    logger.log({ level: "info", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d", splat: [scriptName, this.constructor.name, requestId, this._appName, epIdx] });

    return(epIdx);
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

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type:  %s\n  Endpoint Table: %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this.#getLRUTable(),null,2)] });
  }

  #getLRUTable() {
    const lastUsedObj = {};
    const padTwoDigits = (num) => String(num).padStart(2, '0');

    Object.keys(this._lastUsed).forEach( element => {
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

    return(lastUsedObj);
  }

  get routerType() {
    return this._routerType;
  }

  getEndpointId(requestId) {
    // Get the least recently used backend
    const backendUri = Object.keys(this._lastUsed).reduce((leastUsed, backend) => {
      return this._lastUsed[backend] < this._lastUsed[leastUsed] ? backend : leastUsed;
    });

    // Update the last used timestamp for the selected backend
    this._lastUsed[backendUri] = new Date(Date.now());

    // Get & return the backend index
    const epIdx = this._backends.indexOf(backendUri);
    logger.log({ level: "info", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d\n  Endpoint Table: %s", splat: [scriptName, this.constructor.name, requestId, this._appName, epIdx, this.#getLRUTable()] });

    return(epIdx);
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

    logger.log({ level: "info", message: "[%s] %s.constructor():\n  App ID: %s\n  Router Type:  %s\n  Endpoint Table: %s", splat: [scriptName, this.constructor.name, this._appName, this._routerType, JSON.stringify(this._uriConnections,null,2)] });
  }

  get routerType() {
    return this._routerType;
  }

  updateUriConnections(requestId, increment, epIdx) {
    if ( increment )
      this._uriConnections[this._backends[epIdx]]++;
    else
      this._uriConnections[this._backends[epIdx]]--;

    logger.log({ level: "debug", message: "[%s] %s.updateUriConnections():\n  Request ID: %s\n  Endpoint ID:  %d\n  Endpoint Table: %s", splat: [scriptName, this.constructor.name, requestId, epIdx, JSON.stringify(this._uriConnections,null,2)] });
  }

  getEndpointId(requestId) {
    const uri = Object.entries(this._uriConnections).reduce((min, [url, count]) => {
      return count < min.count ? { url, count } :  min;
    }, { url: null, count: Infinity}).url;
    
    const epIdx = this._backends.indexOf(uri);
    logger.log({ level: "info", message: "[%s] %s.getEndpointId():\n  Request ID: %s\n  App ID: %s\n  Endpoint ID: %d\n  Endpoint Table: %s", splat: [scriptName, this.constructor.name, requestId, this._appName, epIdx, JSON.stringify(this._uriConnections, null, 2)] });

    return(epIdx);
  }
}

module.exports = {
  LRURouter,
  LeastConnectionsRouter,
  WeightedRandomRouter,
  WeightedDynamicRouter
}