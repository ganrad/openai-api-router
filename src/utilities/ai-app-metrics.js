/**
 * Name: AiAppMetricsContainer
 * Description: This container class is used to store AI application metrics for multi-domain agent/server.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 10-31-2024
 * Version: 2.1.0
 *
 * Notes:
 *
*/

class AiAppMetrics {
  #executionTime = 0.0; // In seconds

  constructor() {
    this.apiCalls = 0;  // Total no. of AI App API calls
    this.failedCalls = 0; // No. of failed AI App API calls
    this.#executionTime = 0.0; // AI App execution time in ms
    this.avgExecutionTime = 0.0; // Avg. AI App execution time in seconds
    this.lastAccessTime = ""; // Last time AI App API was invoked/called
  }

  updateAiAppMetrics(callStatus, execTime) {
    this.apiCalls++;
    this.lastAccessTime = new Date().toLocaleString();

    if ( ! callStatus ) // call succeeded
      this.failedCalls++
    else {
      this.#executionTime += execTime;
      this.avgExecutionTime = (this.#executionTime / (this.apiCalls - this.failedCalls)) / 1000;
    };
  }
}

class AiAppMetricsContainer {

  constructor() {
    this.aiAppMetrics = new Map();
  }

  addAiApplication(aiapp) {
    let metrics = new AiAppMetrics();

    this.aiAppMetrics.set(aiapp,metrics);
  }

  getAiAppMetrics(aiapp) {
    return this.aiAppMetrics.get(aiapp);
  }

  deleteAiAppMetrics(aiapp) {
    this.aiAppMetrics.delete(aiapp);
  }
}

module.exports = {
  AiAppMetricsContainer
};
