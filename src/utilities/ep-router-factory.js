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
 * ID08052025: ganrad: v2.4.0: Introduced 1) Payload size based & 2) HTTP header value based & 3) Model aware, backend endpoint routers.
 * 
*/

const { EndpointRouterTypes } = require("./app-gtwy-constants.js"); // AI weighted router types
const {
  LRURouter,
  LeastConnectionsRouter,
  WeightedRandomRouter,
  WeightedDynamicRouter,
  PayloadSizeRouter, // ID08052025.n
  HeaderValueRouter, // ID08052025.n
  ModelAwareRouter // ID08052025.n
} = require("./endpoint-routers.js");

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
      case EndpointRouterTypes.PayloadSizeRouter: // ID08052025.n
        router = new PayloadSizeRouter(appId, epConfig, EndpointRouterTypes.PayloadSizeRouter);
        break;
      case EndpointRouterTypes.HeaderValueRouter: // ID08052025.n
        router = new HeaderValueRouter(appId, epConfig, EndpointRouterTypes.HeaderValueRouter);
        break;
      case EndpointRouterTypes.ModelAwareRouter: // ID08052025.n
        router = new ModelAwareRouter(appId, epConfig, EndpointRouterTypes.ModelAwareRouter);
        break;
    };

    return(router);
  }
}

module.exports = EndpointRouterFactory;