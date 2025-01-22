/**
 * Name: AiAppsContainer
 * Description: This class serves as a container for storing AI Applications metadata. This metadata
 * is read from the server configuration file and saved in memory first time the router (/lb) endpoint
 * is invoked.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 09-04-2024
 * Version: v2.1.0
 *
 * Notes:
 *
*/
class AiAppsContainer {
  constructor() {
    this._loaded = false;
    this.appData = new Map();
  }

  get loaded() {
    return this._loaded;
  }

  set loaded(value) {
    this._loaded = value;
  }

  addApplication(id, value) {
    this.appData.set(id, value);
  }

  getApplication(id) {
    return this.appData.get(id);
  }

  getApplicationTools(id) {
    return this.appData.get(id).appTools; // returns an Array of Tools configured for this AI App.
  }

  getAllApplications() {
    return this.appData;
  }
}
module.exports = AiAppsContainer;
