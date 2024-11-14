/**
 * Name: ToolExecPathTracer
 * Description: This class tracks the execution of retrieval tools & stores vital tool related
 * data useful for debugging AI App workflows.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 09-04-2024
 * Version: v2.1.0
 *
 * Notes:
 *
*/
class ToolExecPathTracer {
  constructor(requestId, appId) {
    this.requestId = requestId;
    this.appId = appId;
    this._startTime = Date.now();
    this._endTime = Date.now();
    this.toolExecPath = new Array();
  }

  get endTime() {
    return this._endTime;
  }

  get executionTime() {
    return (this._endTime - this._startTime);
  }

  set endTime(value) {
    this._endTime = value;
  }

  addToolTraceData(data) {
    this.toolExecPath.push(data);
  }

  getToolsExecutionPath() {
    return {
      applicationId: this.appId,
      requestId: this.requestId,
      startTime: (new Date(this._startTime).toLocaleDateString("en-US") + " " + new Date(this._startTime).toLocaleTimeString("en-US")),
      executionTime: (this._endTime - this._startTime) / 1000, // AI App execution time in seconds
      traceData: this.toolExecPath
/**
      traceData: this.toolExecPath.reduce((obj, value, index) => {
        obj[index] = value;
	return obj;
      }, {})
*/
    };
  }
}
module.exports = ToolExecPathTracer;