# CHANGELOG

## [v1.7.6](https://github.com/ganrad/openai-api-router/compare/v1.7.0...v1.7.6)
### Functionality changes
* (Bugfix) Fixed issue tied to retrieving cached data for new user sessions.
* (Bugfix) Fixed an issue tied to API circuit breaker logic.
* (Bugfix) Added additional response headers so response headers (retry-after & x-thread-id) returned by API Gateway can be used by SPA's.
* (Enhancement) Added support for CORS so SPA's (single page applications / frontends) can invoke the Gateway server's router endpoint.
* (Enhancement) Introduced a new feature for Azure OpenAI model deployment endpoints that allows aggregate rate limiting. This means users can now control the rate of API traffic coming from various AI Applications to a single Azure OpenAI endpoint. Users can set up a RPM Limit for each OpenAI backend endpoint for any AI Application. When multiple AI Applications use the same endpoint, the gateway will enforce rate limiting and throttle excessive requests by returning http 429 status codes. This is especially useful for distributing model processing capacity (PTU deployment) evenly across different AI Applications.

### Documentation changes
* Revised the documentation to explain how to utilize aggregate rate limiting for an Azure OpenAI model deployment endpoint.

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
