/**
 * Name: Endpoint Metrics Factory
 * Description: A factory class that instantiates data structures for storing Api call endpoint metrics.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 04-22-2024
 *
 * Notes:
 * ID05032024: ganrad: Added traffic routing support for Azure AI Content Safety service APIs
 *
*/

const AzOaiEpMetrics = require("./az-oai-ep-metrics.js"); // Open AI Metrics
const AzAiSearchEpMetrics = require("./az-ai-search-ep-metrics.js"); // AI Search Metrics
const AzAiLanguageEpMetrics = require("./az-ai-lang-ep-metrics.js"); // Language AI Metrics
const AzAiTranslatorEpMetrics = require("./az-ai-translator-ep-metrics.js"); // Translator AI Metrics
const AzAiContentSafetyEpMetrics = require("./az-ai-content-safety-ep-metrics.js"); // Translator AI Metrics
const { AzAiServices } = require("./app-gtwy-constants.js"); // AI Service types

class EndpointMetricsFactory {

  constructor() { // Singleton 
    if (! EndpointMetricsFactory.instance)
      EndpointMetricsFactory.instance = this;

    return EndpointMetricsFactory.instance;
  }
 
  getMetricsObject(appType, uri) {
    let metricsObj = null;

    switch (appType) {
      case AzAiServices.OAI:
        metricsObj = new AzOaiEpMetrics(
          uri,
          process.env.API_GATEWAY_METRICS_CINTERVAL,
          process.env.API_GATEWAY_METRICS_CHISTORY);
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
