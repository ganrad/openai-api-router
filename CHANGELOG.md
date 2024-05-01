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

### Documentation changes

## [v1.5.0]
### Functionality

### Dependency

### Documentation
