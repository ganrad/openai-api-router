/**
 * Name: AI App Gateway Resource Handler Factory
 * Description: A factory class that instantiates data handlers for serving (resource) requests.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 07-24-2025
 * Version (Introduced): 2.4.0
 *
 * Notes:
 * ID04232026: ganrad: v3.0.1: (Enhancement) Added new data handler for tool execution trace.
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger');

const { AppResourceTypes } = require("../utilities/app-gtwy-constants.js"); 
const RequestDataHandler = require("./request-data-handler.js");
const SessionDataHandler = require('./session-data-handler');
const MetricsDataHandler = require('./metrics-data-handler.js');
const InstanceInfoDataHandler = require('./instance-data-handler.js');
const ToolExecutionTraceDataHandler = require('./tool-trace-data-handler.js'); // ID04232026.n

const handlerMap = {
  [AppResourceTypes.AiAppServer]: InstanceInfoDataHandler,
  [AppResourceTypes.AiAppGatewayRequest]: RequestDataHandler,
  [AppResourceTypes.AiAppGatewaySession]: SessionDataHandler,
  [AppResourceTypes.AiAppGatewayMetrics]: MetricsDataHandler,
  [AppResourceTypes.AiAppGatewayToolTrace]: ToolExecutionTraceDataHandler // ID04232026.n
};

class ResourceHandlerFactory {
  constructor() { // Singleton 
    if (!ResourceHandlerFactory.instance)
      ResourceHandlerFactory.instance = this;

    return ResourceHandlerFactory.instance;
  }

  getDataHandler(resourceType) {
    const HandlerClass = handlerMap[resourceType];

    if (!HandlerClass) {  // HandlerClass should not be null!
      // log an error
      return(null);
    };

    return(new HandlerClass());
  }
}

module.exports = ResourceHandlerFactory;