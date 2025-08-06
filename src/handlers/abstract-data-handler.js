/**
 * Name: AbstractDataHandler
 * Description: This is an abstract class that acts as an interface (base class) for concrete resource data handlers.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 07-24-2025
 * Version (Introduced): 2.4.0
 *
 * Notes:
 *
*/

class AbstractDataHandler {
  constructor() {
    if (new.target === AbstractDataHandler) {
      throw new Error("AbstractDataHandler cannot be instantiated directly!");
    }
  }

  _getAiApplication(appName, ctx) { // Protected method
    let application = null;

    for (const app of ctx.applications) {
      if (app.appId === appName) {
        application = app;
        break;
      }
    };

    return (application);
  }

  handleRequest(request) {
    throw new Error("Method 'handleRequest()' must be implemented by subclasses.");
  }
}

module.exports = AbstractDataHandler;