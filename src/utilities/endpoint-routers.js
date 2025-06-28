
/**
 * Name: Container for endpoint router implementations
 * Description: This program contains implementations for the following router types: 
 *   1) Weighted Random Router: Uses fixed endpoint weights
 *   2) Latency weighted router: Dynamically updates the endpoint weights after each successful call
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

class WeightedRandomRouter {

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

class WeightedDynamicRouter {
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

module.exports = {
  WeightedRandomRouter,
  WeightedDynamicRouter
}