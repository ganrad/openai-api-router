/**
 * Name: AI App Gateway Resource Handler Factory
 * Description: A factory class that instantiates data handlers for serving (resource) requests.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 07-24-2025
 * Version (Introduced): 2.4.0
 *
 * Notes:
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger');

const { AppResourceTypes } = require("../utilities/app-gtwy-constants.js"); 
const RequestDataHandler = require("./request-data-handler.js");
const SessionDataHandler = require('./session-data-handler');
const MetricsDataHandler = require('./metrics-data-handler.js');
const InstanceInfoDataHandler = require('./instance-data-handler.js');

class ResourceHandlerFactory {
  constructor() { // Singleton 
    if (!ResourceHandlerFactory.instance)
      ResourceHandlerFactory.instance = this;

    return ResourceHandlerFactory.instance;
  }

  getDataHandler(resourceType) {
    let resourceHandler;
    switch ( resourceType) {
      case AppResourceTypes.AiAppServer:
        resourceHandler = new InstanceInfoDataHandler();
        break;
      case AppResourceTypes.AiAppGatewayRequest:
        resourceHandler = new RequestDataHandler();
        break;
      case AppResourceTypes.AiAppGatewaySession:
        resourceHandler = new SessionDataHandler();
        break;
      case AppResourceTypes.AiAppGatewayMetrics:
        resourceHandler = new MetricsDataHandler();
        break;
    };

    return(resourceHandler);
  }
}

module.exports = ResourceHandlerFactory;