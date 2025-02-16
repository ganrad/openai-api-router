/**
 * Name: AI Resource Processor Factory
 * Description: A factory class that instantiates control plane ai resource processors.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 01-23-2025
 * Version: 2.2.0
 *
 * Notes:
 *
*/

const { AppResourceTypes } = require("../utilities/app-gtwy-constants.js");
const AiAppProcessor = require("./ai-app-processor.js");
const AiAppServerProcessor = require("./ai-app-server-processor.js");
const RagAppProcessor = require("./rag-app-processor.js");

class AppResProcessorFactory {

  constructor() { // Singleton 
    if (! AppResProcessorFactory.instance)
      AppResProcessorFactory.instance = this;

    return AppResProcessorFactory.instance;
  }
 
  getResourceProcessor(type) {
    let resourceObj = null;

    switch (type) {
      case AppResourceTypes.AiAppServer:
        resourceObj = new AiAppServerProcessor();
        break;
      case AppResourceTypes.AiApplication:
        resourceObj = new AiAppProcessor;
        break;
      case AppResourceTypes.RagApplication:
        resourceObj = new RagAppProcessor();
        break;
    };

    return resourceObj;
  }
}

module.exports = AppResProcessorFactory;
