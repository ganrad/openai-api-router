const axios = require('axios');

class ApiStressTester {
  constructor(url, payload, concurrentRequests) {
    this.url = url;
    this.payload = payload;
    this.concurrentRequests = concurrentRequests;
    this.activeRequests = 0;
    this.completedRequests = 0;
    this.startTime = null;
  }

  async sendRequest() {
    try {
      this.activeRequests++;
      const response = await axios.post(this.url, this.payload);
      console.log(`Status: ${response.status}\nResponse:\n  ${JSON.stringify(response.data)}`);
    } catch (error) {
      console.error(`Error status: ${error.response.status}\nException: ${JSON.stringify(error.message)}\nResponse:\n ${JSON.stringify(error.response.data)}`);
    } finally {
      this.activeRequests--;
      this.completedRequests++;
      this.checkCompletion();
    }
  }

  checkCompletion() {
    if (this.completedRequests === this.concurrentRequests) {
      const endTime = Date.now();
      const duration = (endTime - this.startTime) / 1000;
      console.log(`All requests completed in ${duration} seconds.`);
      process.exit(0);
    }
  }

  async start() {
    this.startTime = Date.now();
    const promises = [];

    for (let i = 0; i < this.concurrentRequests; i++) {
      promises.push(this.sendRequest());
    }

    await Promise.all(promises);
  }
}

// Configuration
const url = 'http://gr-k8s-dev.westus.cloudapp.azure.com/api/v1/dev/apirouter/lb/ai-chatbot-gpt4o?use_cache=false'; // Replace with your API endpoint
const payload = {
  "messages": [
        {"role": "system", "content": "You are an AI Assistant trained by OpenAI."},
        {"role": "user", "content": "What are the key attractions in Lisbon?"}
  ],
  "max_tokens": 1000,
  "stream": false
};
const concurrentRequests = 10; // Set the number of concurrent requests

const tester = new ApiStressTester(url, payload, concurrentRequests);
tester.start();
