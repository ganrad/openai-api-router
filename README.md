# An Azure OpenAI Service API Gateway
This API gateway can be used to distribute requests to OpenAI API Service endpoints deployed on Azure.  This project describes the steps for deploying the API Gateway on Azure.

**Advantages/Benefits:**
1. The API Gateway uses Nodejs as the runtime.  Nodejs uses a single threaded event loop to asynchronously serve requests. It is built on Chrome V8 engine and extremely performant. The server can easily scale to handle 10's ... 1000's of concurrent requests simultaneously.
2. The API Gateway can be configured with multiple Azure OpenAI Service deployment uri's (a.k.a backend endpoints). When a backend endpoint is busy/throttled (returns http status code 429), the gateway will automatically switch to the next endpoint configured in its backend priority list.  In addition, the gateway will also keep track of throttled endpoints and will not direct any traffic to them until they are available again.
3. The Gateway can be easily configured with multiple backend endpoints using a JSON file.  Furthermore, the backend endpoints can be reconfigured at any time even when the server is running.  The gateway exposes a separate reconfig (/reconfig) endpoint that facilitates dynamic reconfiguration of backend endpoints.
4. The Gateway continously collects backend API metrics and exposes them thru the metrics (/metrics) endpoint.  Users can analyze the throughput and latency metrics and reconfigure the gateway's backend endpoint priority list to effectively route/shift the API workload to the desired backend endpoints based on available and consumed capacity.

**Usage scenarios:**
The API Gateway can be used in two scenarios.
1. Collecting Azure OpenAI API metrics

   The API Gateway collects various backend API metrics based on configured time intervals.  These metrics can then be used to compute the required throughput (*Tokens per minute*) for a given OpenAI workload.  TPMs can be used to estimate *Provisioned Throughput Units*.

2. Routing Azure OpenAI API requests

   The API Gateway functions as an intelligent router and redirects OpenAI API traffic among multiple configured backend endpoints.  The gateway keeps track of unavailable/busy backend endpoints and automatically redirects traffic to available endpoints thereby distributing the API traffic load evenly and not overloading a given endpoint with too many requests.  

**Prerequisites:**

**Functional Architecture:**

![alt tag](./images/az-openai-api-gateway-ra.PNG)

Readers can refer to the following on-line resources as needed.
- [Azure OpenAI Service](https://learn.microsoft.com/en-us/azure/ai-services/openai/)

**Important Notes:**
- This project describes the steps for configuring and deploying the API Gateway in 1) Standalone *Virtual machine* on Azure and 2) Containerized server deployed on *Azure Kubernetes Service*.

