# CHANGELOG

## [v2.0.1](https://github.com/ganrad/openai-api-router/compare/v2.0.0...v2.0.1)
### Functionality changes
* (Bugfix) Resolved JSON parse issue for streamed chat completion response.
* (Enhancement) Simplified logic for streamed responses.  The modified logic is more performant and enhances maintainability.
* (Bugfix) Auth strategy will only be configured when authenication is enabled for the gateway.  This was causing a server startup issue.

## [v2.0.0](https://github.com/ganrad/openai-api-router/compare/v1.9.0...v2.0.0)
### Functionality changes
* (Enhancement) The REST API's exposed by AI Application Gateway solution can now be secured using Microsoft Entra ID.  This feature is enabled by default.
* Restructured the AI Gateway Server code and fixed a few minor bugs.
* (Enhancement) Implemented security (user authentication) feature in the AI Chatbot application (SPA).  This feature is turned on by default. Use this feature to secure the SPA and authenticate users against Microsoft Entra ID.
* Fixed minor bugs in AI Chatbot Application (SPA).
* (Enhancement) Updated 'metrics' endpoint to include container info.
* (Enhancement) The Gateway instance's unique identity (name) is now specified in the AI Application Gateway configuration file ('serverName' attribute).  This value no longer needs to be set as an environment variable ('API_GATEWAY_NAME') and passed to the gateway server.
* (Enhancement) Introduced 'Server Type' attribute in AI Application Gateway configuration to support both single and multi domain servers.  This release only supports single domain AI Gateways.  Next release will include support for multi domain AI Gateways/Servers!

### Documentation changes
* Renamed this repo. to *AI Application Gateway*.
* Updated functional and operational architecture diagrams.
* Updated documentation for both AI Application Gateway and AI Chatbot Application (Frontend/SPA).  Included descriptions for new environment variables introduced in this release.

## [v1.9.0](https://github.com/ganrad/openai-api-router/compare/v1.8.0...v1.9.0)
### Functionality changes
* (Bugfix) When response is served from cache, request id (x-request-id) was not being set (returned) in http response header.
* (Bugfix) AI Search app name was not being returned by '/instanceinfo' endpoint.
* (Enhancement) '/healthz' endpoint now also returns db connection status.
* Updated Helm chart resources and verified container deployment on AKS.
* Resource names have been updated and renamed to better represent the support for various AI Services features.
* (Enhancement) Introduced a new AI Chat Application as the UI Frontend for the AI Services Gateway. A new directory with Frontend resources has been created. Conducted elaborate tests to confirm the frontend can communicate with the backend successfully. Users can now easily interact with OpenAI based applications using this AI Chat client.

### Documentation changes
* Updated Section E.

## [v1.8.0](https://github.com/ganrad/openai-api-router/compare/v1.7.0...v1.8.0)
### Functionality changes
* (Bugfix) Fixed issue tied to retrieving cached data for new user sessions.
* (Bugfix) Fixed an issue tied to API circuit breaker logic.
* (Bugfix) Added additional response headers so response headers (retry-after, x-request-id & x-thread-id) returned by API Gateway can be used by client applications (SPA's).
* (Bugfix) In stream mode, correct HTTP status error codes were not being returned.
* (Enhancement) The most significant update introduced in this latest release is full support for Azure OpenAI Chat Completions streaming API, which also includes On Your Data (OYD) API. Most importantly, the streaming feature works seamlessly with the API router, semantic caching and state management features.
* (Enhancement) For Azure OpenAI OYD (On your data) chat completion API calls, client applications can now specify the name of the AI Search application registered in the gateway instead of the AI Search key, within the request body.  This change eliminates the risk associated with caching or storing the AI Search key in the client application, which could pose a security risk if the application is running in a browser.
* (Enhancement) Updated OpenAI request processor to return error messages that are complaint (API) with exception messages returned by Azure OpenAI Service.
* (Enhancement) Added support for CORS so SPA's (single page applications / frontends) can invoke the Gateway server's router endpoint.
* (Enhancement) Introduced a new feature for Azure OpenAI model deployment endpoints that allows aggregate rate limiting. This means users can now control the rate of API traffic coming from various AI Applications to a single Azure OpenAI endpoint. Users can set up a RPM Limit for each OpenAI backend endpoint for any AI Application. When multiple AI Applications use the same endpoint, the gateway will enforce rate limiting and throttle excessive requests by returning http 429 status codes. This is especially useful for distributing model processing capacity (PTU deployment) evenly across different AI Applications.

### Documentation changes
* Updated documentation to reflect full support for Azure OpenAI Chat Completions API *streaming* feature.
* Included detailed explanation on aggregate rate limiting and the steps to set it up with an Azure OpenAI model deployment endpoint.

## [v1.7.0](https://github.com/ganrad/openai-api-router/compare/v1.6.0...v1.7.0)
### Functionality changes
* Fixed multiple minor bugs.
* Refined the code for efficiency by removing unnecessary duplication.
* (Enhancement) Implemented conversational *State Management* feature for chat completion API.  This feature can be configured to work separately or in conjunction with semantic caching feature.

### Documentation changes
* Updated documentation and included detailed information for configuring and using *State Management* feature.
* Updated diagrams.

## v1.6.0
### Functionality changes
* (Bugfix) Each time when 'reconfig' endpoint was being invoked, a new cron scheduler instance was started. There should only be one cache entry invalidator instance running per gateway/router process instance.
* (Bugfix) Fixed issues with metrics calculation.
* (Enhancement) Added support for proxying requests to following Azure AI Services.  Introduced separate processors (modules) for handling API requests for each AI Service.
  - Azure AI Language
  - Azure AI Search
  - Azure AI Translate
  - Azure AI Content Safety
* (Enhancement) Introduced two new elements in gateway/router configuration - description and application type.
* (Enhancement) Added four key endpoint metrics for AOAI Service - Throttled (429) Api calls, Filtered (400) Api calls, Tokens per minute (TPM) and Requests per minute (RPM).
* (Enhancement) Implemented robust error handling for Azure AI Service API calls.
* (Enhancement) Modularized the core gateway/router logic into separate modules to achieve three key benefits
  - **Enhanced Code Maintainability**: By breaking down the logic, make it easier to manage and update.
  - **Efficient Troubleshooting**: Isolating specific modules allows for quicker identification and resolution of issues.
  - **Reduced Learning Curve:** Developers can now focus on smaller, specialized components, streamlining the learning process.
* (Enhancement) Introduced robust and configurable logging for gateway/router messages with [winstonjs](https://github.com/winstonjs/winston/tree/master) library.
* Curated test data for AI Services and then developed a robust testing harness. This allowed us to stress-test the gateway/router by making multiple concurrent API calls. Going forward, new releases will be published only after running tests across all supported AI Services, ensuring a complete and successful status.

### Dependency updates
* [winstonjs](https://github.com/winstonjs/winston/tree/master)

### Documentation changes
* Changed repository title to Azure AI Services API Gateway as this solution now supports multiple Azure AI services
* Updated documentation to reflect support for new AI services
* Updated reference architecture diagram

## First release
### Functionality
* Included support for Azure OpenAI Service REST API and Client SDK.
* Added support for AI Application (LLM) frameworks - Langchain and Promptflow. 
* Added semantic caching layer to cache OpenAI prompts and completions.
* Added persistent layer to audit/track OpenAI requests and responses.
* Added metrics collection feature to cache OpenAI API metrics for all configured AI Applications.

### Dependency
* Azure database for PostgreSQL with pgvector extension

### Documentation
* Added supported features and usage scenarios sections.
* Updated reference architecture diagram.
* Added API Gateway router workflow diagram to explain how the server processes Azure OpenAI Service API requests.
* Added sections to detail steps for deploying the API Gateway on standalone VM and Kubernetes cluster on Azure.
