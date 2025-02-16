/**
 * Name: AppConnections
 * Description: This class stores the end-point metrics for each AI Application.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 02-13-2024
 *
 * Notes:
 * ID02062025: ganrad: v2.2.0: Added new methods to a) Check if a connection exists for an Ai App & b) Delete an 
 * Ai App Connection.
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

  // ID02062025.sn
  hasConnection(id) {
    return this.appData.has(id);
  }

  removeConnection(id) {
    return this.appData.delete(id); // Returns true if element was present
  }
  // ID02062025.en
}
module.exports = AppConnections;
