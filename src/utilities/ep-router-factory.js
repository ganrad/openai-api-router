/**
 * Name: Endpoint Router Factory
 * Description: This class implements a singleton endpoint router factory.  The factory instantiates and returns
 * endpoint router instances.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 06-16-2025
 * Version (Introduced): v2.3.9
 *
 * Notes:
 * 
*/

const { EndpointRouterTypes } = require("./app-gtwy-constants.js"); // AI weighted router types
const { LRURouter, LeastConnectionsRouter, WeightedRandomRouter, WeightedDynamicRouter } = require("./endpoint-routers.js");

class EndpointRouterFactory {

  constructor() { // Singleton 
    if (!EndpointRouterFactory.instance)
      EndpointRouterFactory.instance = this;

    return EndpointRouterFactory.instance;
  }

  getEndpointRouter(appId, routerType, epConfig) {
    let router = null;

    switch ( routerType ){
      case EndpointRouterTypes.LRURouter:
        router = new LRURouter(appId, epConfig, EndpointRouterTypes.LRURouter);
        break;
      case EndpointRouterTypes.LeastConnectionsRouter:
        router = new LeastConnectionsRouter(appId, epConfig, EndpointRouterTypes.LeastConnectionsRouter);
        break;
      case EndpointRouterTypes.WeightedRandomRouter:
        router = new WeightedRandomRouter(appId, epConfig, EndpointRouterTypes.WeightedRandomRouter);
        break;
      case EndpointRouterTypes.WeightedDynamicRouter:
        router = new WeightedDynamicRouter(appId, epConfig, EndpointRouterTypes.WeightedDynamicRouter);
        break;
    };

    return(router);
  }
}

module.exports = EndpointRouterFactory;