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
 * ID08052025: ganrad: v2.4.0: Introduced 1) Payload size & 2) HTTP header value (Model provider based), backend endpoint routers.
 * ID08082025: ganrad: v2.4.0: Introduced Model aware backend endpoint router.
 * ID08212025: ganrad: v2.4.0: Introduced 1) Token aware & 2) Time aware, backend endpoint routers.
 * ID08222025: ganrad: v2.4.0: This class is deprecated and no longer used.
*/

const { EndpointRouterTypes } = require("./app-gtwy-constants.js"); // AI weighted router types
const { CreateTrafficRouter } = require("./endpoint-routers.js"); // ID08082025.n

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
        router = CreateTrafficRouter.create(appId, epConfig, EndpointRouterTypes.LRURouter);
        break;
      case EndpointRouterTypes.WeightedRandomRouter:
        router = CreateTrafficRouter.create(appId, epConfig, EndpointRouterTypes.WeightedRandomRouter);
        break;
      case EndpointRouterTypes.ModelAwareRouter: // ID08082025.n
        router = CreateTrafficRouter.create(appId, epConfig, EndpointRouterTypes.ModelAwareRouter);
        break;
      case EndpointRouterTypes.TokenAwareRouter: // ID08212025.n
        router = CreateTrafficRouter.create(appId, epConfig, EndpointRouterTypes.TokenAwareRouter);
        break;
    };

    return(router);
  }
}

module.exports = EndpointRouterFactory;