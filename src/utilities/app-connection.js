/**
 * Name: AppConnections
 * Description: This class stores the end-point metrics for each application.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 02-13-2024
 *
 * Notes:
 *
*/
class AppConnections {
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

  addConnection(id, value) {
    this.appData.set(id, value);
  }

  getConnection(id) {
    return this.appData.get(id);
  }

  getAllConnections() {
    return this.appData;
  }
}
module.exports = AppConnections;
