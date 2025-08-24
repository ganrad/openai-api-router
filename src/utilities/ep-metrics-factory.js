/**
 * Name: Endpoint Metrics Factory
 * Description: A factory class that instantiates data structures for storing Api call endpoint metrics.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 04-22-2024
 *
 * Notes:
 * ID05032024: ganrad: Added traffic routing support for Azure AI Content Safety service APIs
 * ID05282024: ganrad: Updated getMetricsObject() signature to accept variable number of args ~ rest parameter
 * ID11052024: ganrad: v2.1.0: Added support for LLMs that support Azure AI Model Inference API (Chat completion).
 * ID04302025: ganrad: v2.3.2: (Enhancement) Each endpoint can (optional) have a unique id ~ assistant id
 * ID05122025: ganrad: v2.3.6: (Enhancement) Introduced endpoint health policy feature for AOAI and AI Model Inf. API calls. 
 * ID07102025: ganrad: v2.4.0: (Enhancement) Added support for AI Foundry Agent Service.
 * ID08212025: ganrad: v2.4.0: (Enhancement) Updated code to support metrics collection for AI Foundry Agent Service.
*/

const AzOaiEpMetrics = require("./az-oai-ep-metrics.js"); // Open AI Metrics
const AzAiSearchEpMetrics = require("./az-ai-search-ep-metrics.js"); // AI Search Metrics
const AzAiLanguageEpMetrics = require("./az-ai-lang-ep-metrics.js"); // Language AI Metrics
const AzAiTranslatorEpMetrics = require("./az-ai-translator-ep-metrics.js"); // Translator AI Metrics
const AzAiContentSafetyEpMetrics = require("./az-ai-content-safety-ep-metrics.js"); // Translator AI Metrics
const { AzAiServices } = require("./app-gtwy-constants.js"); // AI Service types

class EndpointMetricsFactory {

  constructor() { // Singleton 
    if (!EndpointMetricsFactory.instance)
      EndpointMetricsFactory.instance = this;

    return EndpointMetricsFactory.instance;
  }

  // getMetricsObject(appType, uri) { ID05282024.o
  // getMetricsObject(appType, uri, ...epConfig) { // ID05282024.n, ID08212025.o
  getMetricsObject(appType, targetUri, ...epConfig) { // ID08212025.n
    let metricsObj = null;

    const uri = (appType === AzAiServices.AzAiAgent) ? targetUri + "/" + epConfig[1] : targetUri; // ID08212025.n
    switch (appType) {
      case AzAiServices.OAI:
      case AzAiServices.AzAiModelInfApi: // ID11052024.n
      case AzAiServices.AzAiAgent: // ID07102025.n
        metricsObj = new AzOaiEpMetrics(
          uri,
          process.env.API_GATEWAY_METRICS_CINTERVAL,
          // process.env.API_GATEWAY_METRICS_CHISTORY); ID05282024.o
          process.env.API_GATEWAY_METRICS_CHISTORY,
          epConfig[0], // (RPM) ID05282024.n
          epConfig[1], // (ID) ID04302025.n
          epConfig[2]); // (Health Policy) ID05122025.n
        break;
      case AzAiServices.AiSearch:
        metricsObj = new AzAiSearchEpMetrics(
          uri,
          process.env.API_GATEWAY_METRICS_CINTERVAL,
          process.env.API_GATEWAY_METRICS_CHISTORY);
        break;
      case AzAiServices.Language:
        metricsObj = new AzAiLanguageEpMetrics(
          uri,
          process.env.API_GATEWAY_METRICS_CINTERVAL,
          process.env.API_GATEWAY_METRICS_CHISTORY);
        break;
      case AzAiServices.Translator:
        metricsObj = new AzAiTranslatorEpMetrics(
          uri,
          process.env.API_GATEWAY_METRICS_CINTERVAL,
          process.env.API_GATEWAY_METRICS_CHISTORY);
        break;
      case AzAiServices.ContentSafety:
        metricsObj = new AzAiContentSafetyEpMetrics(
          uri,
          process.env.API_GATEWAY_METRICS_CINTERVAL,
          process.env.API_GATEWAY_METRICS_CHISTORY);
        break;
      default:
        metricsObj = new AzOaiEpMetrics(
          uri,
          process.env.API_GATEWAY_METRICS_CINTERVAL,
          process.env.API_GATEWAY_METRICS_CHISTORY);
    };

    return metricsObj;
  }
}

module.exports = EndpointMetricsFactory;