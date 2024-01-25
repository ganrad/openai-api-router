class EndpointMetrics {
  #endpoint
  #apiCalls = 0

  constructor(endpoint) {
    this.#endpoint = endpoint;
  }

  incrementApiCalls() {
    this.#apiCalls++;
  }

  get apiCalls() {
    return this.#apiCalls;
  }

  toJSON() {
    return {
      endpoint: this.#endpoint,
      apiCalls: this.#apiCalls
    };
  }
}
module.exports = EndpointMetrics;
  
