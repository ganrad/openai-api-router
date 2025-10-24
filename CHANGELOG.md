# CHANGELOG

## [v2.8.0](https://github.com/ganrad/openai-api-router/compare/v2.7.5...v2.8.0) - 10/24/2025
### Functionality changes
**Azure AI Application Gateway (Server)**
* **Enhancements:**

  - **Long Term Memory (Personalization):**
    This release introduces advanced personalization capabilities, enabling tailored model responses for distinct user groups. You can configure separate extraction and follow-up prompts for one or more groups, ensuring highly relevant and context-aware interactions.

    Key Benefits:
    
    - Precision Responses: Leverage stored facts to enrich prompts, improving accuracy and relevance.
    - Dynamic Personalization: Customize follow-up messages and insights for each user group.
    - Continuous Learning: Automatically capture and store new facts for smarter future interactions.

    How It Works:
    
    Inbound Flow (Pre-Processing): 
    
    - For each user prompt, the gateway retrieves contextual facts from the vector store using the configured similarity search algorithm and feeds this enriched context to the model to generate more accurate responses.
    
    Outbound Flow (Post-Processing):
    
    - The gateway extracts key facts from model responses using the configured extraction prompt and stores them in the vector database
    - Thereafter, the gateway generates personalized follow-up messages based on the follow-up prompt and appends them to the model’s response.

---

### Documentation changes
* Updated the functional architecture diagram.
* Made minor updates to the document.

## [v2.7.5](https://github.com/ganrad/openai-api-router/compare/v2.6.0...v2.7.5) - 10/19/2025
### Functionality changes
**Azure AI Application Gateway (Server)**
* **New Features:**

  - **Microsoft Agent Framework:** This release adds support for invoking AI applications hosted on the gateway via the Microsoft Agent Framework (MAF) SDK, enabling users to build sophisticated agentic AI solutions while leveraging the gateway’s built-in capabilities.

* **Bugfixes:**

  - Several bug fixes were implemented, and comprehensive regression tests were conducted to ensure the gateway delivers consistent results and provides clear, meaningful error messages in exception scenarios.

---

### Documentation changes
* Made minor updates to the document.

## [v2.7.0](https://github.com/ganrad/openai-api-router/compare/v2.6.0...v2.7.0) - 10/14/2025
### Functionality changes
**Azure AI Application Gateway (Server)**
* **New Features:**

  - **Agent to Agent Protocol:** This release introduces support for invoking AI applications deployed on the gateway using the Agent-to-Agent (A2A) SDK, now compatible with the latest A2A specification (v0.3.0). This feature enhances interoperability and flexibility by enabling seamless communication between AI agents using the latest A2A specification, supporting both real-time (streaming) and batch (non-streaming) inference scenarios.

* **Enhancements:**

  - **Disabling AI Applications:** This feature enables AI applications to be dynamically enabled or disabled via the control plane API while the gateway is running. When an application is in a disabled or inactive state, the gateway will skip inference execution and return an exception.  This capability provides operational flexibility by allowing administrators to control AI application availability in real time, helping manage resources and prevent unintended inference execution.

  - **Normalize AI Gateway Inference Output:** This feature enables the normalization of inference outputs from the AI Gateway to match the format of OpenAI responses. As a result, client applications designed to process OpenAI responses can now seamlessly use this feature to run inferences on models hosted by Azure AI Foundry.

---

### Documentation changes
* Updated the functional architecture diagram.
* Made minor updates to the document.

## [v2.6.0](https://github.com/ganrad/openai-api-router/compare/v2.5.0...v2.6.0) - 09/18/2025
### Functionality changes
**Azure AI Application Gateway (Server)**
* **New Features:**

  - **Feedback Analytics:** To enhance user experience and model performance, a feedback analytics feature has been integrated into the AI application gateway, enabling real-time capture of user sentiment through thumbs up/down interactions. This mechanism provides immediate visibility into user satisfaction, helping teams identify friction points and optimize responses. By aggregating feedback trends, it supports data-driven improvements, accelerates iteration cycles, and fosters a more responsive and user-aligned AI experience.

* **Enhancements:**
  
  - **New Router Type(s):** Added a new endpoint router type *FeedbackWeightedRandom* which uses user feedback to make endpoint routing decisions.

* **Database Updates:**

  - To support user feedback collection and analysis feature, a new field was added to the `apigtwyprompts` database table.

* **Bug Fixes:**

  - When multiple endpoints were configured for AI Foundry models that support the AI Model Inference API, in-memory metrics data for endpoints were getting corrupted.  This issue has now been resolved.
  - Multiple other minor bug fixes were applied.

---

### Documentation changes
* Updated the functional architecture diagram.
* Made minor updates to the document.

## [v2.5.0](https://github.com/ganrad/openai-api-router/compare/v2.4.0-beta...v2.5.0) - 09/12/2025
### Functionality changes
**Azure AI Application Gateway (Server)**
* **New Features:**

  - **Cost Tracking:** A new cost tracking capability has been introduced, enabling AI Applications to capture total API call costs based on token usage. This feature is seamlessly integrated with the metrics collection sub-system, allowing users to view not only API metrics such as success/failure rates, cached calls, token counts, and request volumes but also detailed cost metrics. All data is collected at the configured gateway interval and retained according to the defined metrics history buckets.
  - **New Router Types:** Three advanced router types have been added — TimeAware, BudgetAware, and AdaptiveBudgetAware, to optimize routing for Azure AI Foundry APIs. Notably, the AdaptiveBudgetAware router supports multiple strategies, ranging from simple priority-based routing to dynamic, quality-tier driven decisions based on endpoint performance and cost efficiency.

* **Enhancements:**

  - **Router Configuration:** The AI Application Gateway automatically validates all required configuration settings for the selected router type. If any prerequisites are missing or invalid, it gracefully defaults to the *Priority* based Router, ensuring uninterrupted request routing.
  - **Unified API Interface:** Multiple improvements have been made to harden the AI Application Gateway’s unified API interface. These enhancements ensure that API calls to AI Agents hosted on Azure AI Foundry are handled reliably, with graceful error handling and consistent response delivery critical for maintaining robust conversational AI experiences.
  - **Metrics Collection:** Added support for metrics collection feature for Azure AI Foundry Agents.

* **Bug Fixes:**

  - Multiple minor bug fixes were applied.

---

### Documentation changes
* Updated the documentation to reflect changes introduced in this release.

## [v2.4.0-beta](https://github.com/ganrad/openai-api-router/compare/v2.3.9...v2.4.0-beta)
### Functionality changes
**Azure AI Application Gateway (Server)**

* Enhancement: **Resource Handlers**

  - Introduced resource handlers for AI Gateway resources.
  - Added support for retrieving sessions (threads) managed by the Azure AI Foundry Agent Service.

* Enhancement: **Health Check Policy**

  - The health check policy associated with a backend endpoint is used by the AI Gateway to track consecutive failed API calls. If the number of failures exceeds the configured threshold (*healthPolicy.maxCallsBeforeUnhealthy*), the endpoint is marked as unhealthy for a duration specified by *healthPolicy.retryAfterMinutes*.

* Refactor: 

  - Centralized all router endpoint literals into the constants module `app-gtwy-constants.js`.
  - Implemented a standardized function for generating globally unique IDs, located in `app-gtwy-constants.js`.

* Enhancement: **Traffic Routing**

  Added the following backend endpoint Traffic Routers:

  - **PayloadSwitch**

    Dynamically routes API requests to backend endpoints when the size of the HTTP request payload is less than equal to the configured *payloadThreshold* value. This router ensures that smaller payloads are directed to endpoints (Models) optimized for lightweight processing.

  - **HeaderSwitch**

    Routes API requests to the appropriate backend endpoint by comparing the value of the *x-endpoint-id* HTTP header against a predefined list of backend endpoint identifiers. This ensures that each request is efficiently directed to the endpoint (Model) used to generate the best response, improving performance and reliability.

  - **ModelAware**

    Routes API requests to a backend endpoint when the system prompt contains any value listed in the associated task attribute, ensuring the request is directed to the endpoint (Model) used to generate the best response based on it's specialized functions.

  - **TokenAware**

    Routes API requests to a backend endpoint when the token count of the prompt message is less than or equal to the configured *payloadThreshold* value. This router ensures that smaller request payloads are directed to endpoints (Models) optimized for lightweight processing without exceeding model-specific input limits.

* Experimental / In-Preview: **Synchronous Unified Interface (API) for Azure AI Agents**

  Enabled routing of requests to the Azure AI Foundry Agent Service using a unified synchronous OpenAI API interface.

---

**AI Application Gateway Console (UI/SPA)**

- **Release v1.3.1**

  This patch release introduces minor UI refinements to support integration with the Azure AI Foundry Agent Service.

---

### Documentation changes
* Updated the documentation to reflect changes introduced in this release.

## [v2.3.9](https://github.com/ganrad/openai-api-router/compare/v2.3.1...v2.3.9)
### Functionality changes
**Azure AI Application Gateway (Server)**
* Enhancement: **Unique Backend Endpoint IDs**

  Each AI Application (Type=oai/ai_inf/ai_agent) backend endpoint can now be optionally assigned a unique identifier for improved traceability and configuration flexibility.

* Enhancement: **Endpoint Affinity for Stateful Sessions**

  For AI Applications with state management enabled, the AI Gateway now supports endpoint affinity. API calls within the same user session are routed to the same backend endpoint that handled the initial request. If that endpoint is unavailable (e.g., throttled or down), the request is seamlessly redirected to an alternative configured endpoint.

* Enhancement: **Backend Endpoint Health Policy**

  A new health policy feature is available for Azure OpenAI and AI Model Inference endpoints. When enabled, the AI Gateway monitors endpoint latency and automatically disables any endpoint that exceeds a pre-configured response time threshold (in minutes).

* Enhancement: **Long-Term User Memory (Personalization)**

  The AI Gateway now supports long-term user memory, enabling personalized interactions. When enabled, the system extracts relevant facts from user prompts to tailor responses and generates follow-up questions based on user history.

* Enhancement: **Advanced API Traffic Routing**

  Multiple built-in traffic routers are now available to intelligently distribute API calls across backend endpoints. Supported routing strategies include:

  - Priority-based (default)
  - Least Recently Used (LRU)
  - Least Active Connections
  - Random Weighted
  - Latency Weighted

  Each AI Application can be configured with one of these routing strategies.

* Enhancement: **New API for Call Metrics**

  A dedicated API has been introduced to retrieve detailed metrics on AI Application API calls, supporting better observability and performance analysis.

* Enhancement: **User Session Tracking for Stateful AI Apps**

  When state management is enabled, the AI Gateway now tracks the number of active user sessions/threads during each metrics collection interval.

* Enhancement: **OpenAI Model Endpoints**

  Introduced support for OpenAI model endpoints.  With this feature, an AI Application hosted in the gateway can be configured with both OpenAI and Azure AI Foundry Model endpoints.

**AI Application Gateway Console (UI/SPA)**
* Introduced release **v1.3.0**

  This new release includes several user interface refinements to improve the overall user experience.

### Documentation changes
* Updated the documentation to reflect changes introduced in this release. Included descriptions for new environment variables added in this release.

## [v2.3.1](https://github.com/ganrad/openai-api-router/compare/v2.2.0...v2.3.1)
### Functionality changes
**Azure AI Application Gateway (Server)**
* Bugfix: The JSON body-parser character limit has been increased from the default 100kb to 600kb. This change ensures that large request payloads sent to advanced reasoning models (thru the AI App Gateway) do not fail and throw an exception.
* Enhancement: The request ID (x-request-id) is now included in the span created for each AI App Gateway API call and sent to Azure Application Insights. This feature enables end-to-end tracking of a gateway API request from the frontend/client to the AI App Gateway and the Azure AI Service backend.
* Enhancement: The AI App Gateway control plane API *Operations* endpoint has been updated to return the HTTP method for each supported endpoint.
* Enhancement: Added support for using the AI App Gateway host's system-managed Azure Entra ID for authenticating against Azure AI Services.
* Enhancement: Added new *sessions* API.  This API can be used to retrieve all requests & corresponding messages associated with a given thread (/user session).
* Poka-yoke: When Azure OAI Chat Completion Function Call APIs are proxied through the AI Application Gateway, caching will be automatically disabled.
* Bugfix: When Azure Entra ID is used for authenticating against Azure OAI API, a case insensitive match will be performed to retrieve the 'Authorization' HTTP header (auth token).
* Bugfix: The URI index of the backend endpoint will be returned for both completed and failed API calls.

**AI Application Gateway Console (UI/SPA)**
* Introduced release v1.2.0.  This new release includes several user interface refinements to improve the overall user experience.
* Introduced support for initiating conversational chats with advanced reasoning models such as o1, o1-mini, and o3.
* Implemented functionality to request and receive token counts for streaming Azure OAI API calls.
* Implemented functionality (new buttons) for copying and saving chat responses.
* Added new dialogs to allow users to define and deploy AI Applications on the target AI Application Gateway instance.

### Documentation changes
* Updated the documentation to reflect changes introduced in this release. Included descriptions for new environment variables added in this release.

## [v2.2.0](https://github.com/ganrad/openai-api-router/compare/v2.1.0...v2.2.0)
### Functionality changes
* (Bugfix) Resolved the telemetry ingestion issue for AI App Gateway in Azure Application Insights, allowing detailed telemetry and metrics information for AI App Gateway APIs, Azure AI Service APIs, and Azure Database for PostgreSQL DB calls. Metrics can now be logged and viewed in AppInsights. This enhancement facilitates distributed tracing and helps identify connectivity and performance related issues. 
* (Enhancement) Introduced a new SQL-based configuration provider for AI App Gateway resources, enabling configurations to be stored in either a file (default) or a SQL database table ('aiappservers'). SQL provider is now recommended for production deployments. 
* (Enhancement) Added control plane APIs for managing the lifecycle of AI Apps, allowing real-time updates to individual AI App Gateway resources. The use of the control plane API is recommended in single server mode only.
* (Enhancement) Added two new fields in table 'apigtwyprompts' to capture user's session id and store AOAI API response headers. These fields will help with troubleshooting & quick problem resolution.
* (Enhancement) A new '/apirouter/sessions' API endpoint has been introduced.  This API can be used to retrieve all AOAI API requests associated with a user session.
* (Enhancement) The JSON schema parser has been upgraded from 'jsonschema' to a more robust implementation using 'ajv' library. This change enhances the reliability and performance of schema validation's for gateway resources.
* (Enhancement) For Azure OAI streamed API calls, token usage information is now saved along with the request in 'apigtwyprompts' table.
* (Enhancement) Standardized the use of Node.js's 'fetch' API for all outbound Azure AI Service API calls.
* (Enhancement) Multiple performance related improvements have been made. 

### Documentation changes
* Updated the documentation to reflect changes introduced in this release. Included descriptions for new environment variables added in this release.

## [v2.1.0](https://github.com/ganrad/openai-api-router/compare/v2.0.0...v2.1.0)
### Functionality changes
* (Enhancement) The AI App Gateway engine has been enhanced to support multi-domain orchestration of complex AI workflows, involving multiple AI agents and tool invocations.
* (Enhancement) The App Gateway configuration file (JSON) is now validated at server startup, logging any parsing errors and exiting if necessary. 
* (Enhancement) API support has been added for models deployed in Azure AI Foundry, allowing the load balancer/router API endpoint to route requests to models that support the Azure AI Model Inference API. 
* (Enhancement) A new '/apirouter/requests' API endpoint has been introduced.  This API can be used to retrieve details of specific inferencing (Azure OAI) API requests. 
* (Enhancement) A unique server instance ID (server name + pod name) is now captured for each API request and stored in cache, memory, prompts, and tools trace database tables. 
* (Enhancement) A new field 'exec_time_secs' has been added to the prompts table to store API request processing times.
* (Enhancement) The Azure App Insights environment variable has been renamed. The server code has been restructured for better readability and maintenance. 
* (Enhancement) A new function has been introduced to gracefully exit the gateway server upon receiving SIGKILL and SIGTERM signals. 
* (Enhancement) Reconfiguration of the AI Application Gateway is now only supported in standalone mode. 
* A bugfix has been implemented to ensure cache and memory invalidation schedulers use the updated configuration after reconfiguring the gateway server.

### Documentation changes
* Updated operational architecture diagram.
* Updated documentation for both AI Application Gateway and AI Chatbot Application (Frontend / SPA)

## [v2.0.1](https://github.com/ganrad/openai-api-router/compare/v2.0.0...v2.0.1)
### Functionality changes
* (Bugfix) Resolved JSON parse issue for streamed chat completion response.
* (Enhancement) Simplified logic for streamed responses.  The modified logic is more performant and enhances maintainability.
* (Bugfix) Auth strategy will only be configured when authenication is enabled for the gateway.  This was causing a server startup issue.
* (Enhancement) Structured log messages
* (Enhancement) For OYD calls, API Keys, User assigned and System assigned managed identity auth types are supported for AI Search Service.

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
