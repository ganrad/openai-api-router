const { ToolPlannerTypes } = require("../utilities/app-gtwy-constants.js");
const { ToolPlannerExecutorV0 } = require("./tool-planner-executor.js");
const { ToolPlannerExecutorV1 } = require("./tool-planner-executor-v2.js");

// Singleton Factory Class
class ToolPlannerFactory {
  static #instance = null;
  static #isInternalConstructing = false; // Private flag to block external 'new'

  constructor() {
    // If `new ToolPlannerFactory()` is called from outside this class, throw an error
    if (!ToolPlannerFactory.#isInternalConstructing) {
      throw new Error("Use ToolPlannerFactory.getInstance() instead of the 'new' keyword.");
    }
  }

  // The global access point
  static getInstance() {
    if (!ToolPlannerFactory.#instance) {
      ToolPlannerFactory.#isInternalConstructing = true;
      ToolPlannerFactory.#instance = new ToolPlannerFactory();
      ToolPlannerFactory.#isInternalConstructing = false; // Reset flag immediately
    };

    return ToolPlannerFactory.#instance;
  }

  /**
   * Factory method: always returns a fresh, new instance of the tool planner executor class
   *
   * @param {String} serverName Unique ID of this server
   * @param {String} appId AI Application ID
   * @param {String} aiAppRemoteServerConfig Remote Server configuration object defined at the AI App level
   * @param {Object} remoteServerConfig Remote Servers Configuration Object
   * @param {Object} epMetricsInfo - Endpoint metrics information for the AI Application used for logging API call metrics.
   * @param {Object} endpointsInfo - The list of all endpoints configured for the AI App, used for tool execution context.
   * @param {String} appType - The type of planner AI Application, which may influence tool selection and execution logic.
   * @param {String} mcpBridges - [{ serverId: "xyz", "bridge": mcpBridgeObject}, ...]
   */
  createPlanner(serverName, appId, aiAppRemoteServerConfig, remoteServerConfig, epMetricsInfo, endpointsInfo, appType, mcpBridges) {
    const plannerType = aiAppRemoteServerConfig.plannerType || ToolPlannerTypes.Version1;
    
    switch (plannerType) {
      case ToolPlannerTypes.Version0:
        return new ToolPlannerExecutorV0(serverName, appId, aiAppRemoteServerConfig, remoteServerConfig, epMetricsInfo, endpointsInfo, appType, mcpBridges);
      case ToolPlannerTypes.Version1:
      default:
        return new ToolPlannerExecutorV1(serverName, appId, aiAppRemoteServerConfig, remoteServerConfig, epMetricsInfo, endpointsInfo, appType, mcpBridges);
    };
  }
}

module.exports = {
  ToolPlannerFactory
}

