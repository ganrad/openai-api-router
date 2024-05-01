# CHANGELOG

## [v1.6.0](https://github.com/ganrad/open-ai-router/compare/v1.5.0...v1.6.0)
### Functionality changes
* (Bugfix) Each time when 'reconfig' endpoint was being invoked, a new cron scheduler instance was started. There should only be one cache entry invalidator instance running per gateway/router process instance.
* (Enhancement) Added support for proxying requests to following Azure AI Services.  Introduced separate AI service processors (modules) for each AI Service.
  - Azure AI Language
  - Azure AI Search
  - Azure AI Translate
* (Enhancement) Introduced two new elements in gateway/router configuration - description and application type.
* (Enhancement) Robust error handling for Azure AI Service API calls.
* (Enhancement) Refactored and split core gateway/router logic into multiple separate modules to facilitate a) Easy maintainability of code b) Quickly troubleshoot problems & c) Shorten learning curve.
* (Enhancement) Introduced robust and configurable logging for gateway/router messages with [winstonjs](https://github.com/winstonjs/winston/tree/master) library.
* Curated AI Services test data and implemented robust testing harness to stress/volume test gateway/router with multiple concurrent API calls.

### Dependency updates
* [winstonjs](https://github.com/winstonjs/winston/tree/master)

### Documentation changes
* Changed repository title to Azure AI Services API Gateway as this solution now supports multiple Azure AI services
* Updated documentation to reflect support for new AI services
* Updated reference architecture diagram

## [First release]
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
