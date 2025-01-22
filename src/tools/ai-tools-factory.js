/**
 * Name: AI Retrieval Tools Factory
 * Description: A factory class that instantiates AI retrieval tools.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 09-04-2024
 * Version: v2.1.0
 *
*/

const AiAppGatewayTool = require("./ai-gtwy-tool");
const WebApiAppTool = require("./web-api-tool");
const { RetrievalToolTypes } = require("../utilities/app-gtwy-constants.js");

class AiRetrievalToolsFactory {

  constructor() { // Singleton 
    if (! AiRetrievalToolsFactory.instance)
      AiRetrievalToolsFactory.instance = this;

    return AiRetrievalToolsFactory.instance;
  }
 
  getRetrievalTool(toolType) {
    let tool = null;

    switch (toolType) {
      case RetrievalToolTypes.AiAppGateway:
        tool = new AiAppGatewayTool();
        break;
      case RetrievalToolTypes.WebApiApp:
	tool = new WebApiAppTool();
	break;
      default:
        tool = null;
    };

    return tool;
  }
}

module.exports = AiRetrievalToolsFactory;
