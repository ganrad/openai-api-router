/**
 * Name: AI application gateway constants
 * Description: This module contains definitions for constants used in AI Application Gateway.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 04-24-2024
 * Version: 1.0.0
 *
 * Notes:
 * ID05032024: ganrad: Added support for Azure AI Content Safety
 * ID05062024: ganrad: Added support for state management feature for Azure OAI Service
 * ID09042024: ganrad: v2.0.1, v2.1.0: Added constants for Gateway type (single, multi), Orchestration 
 * engines/servers, Retrieval tool types & Tool branching conditions.
 * ID11052024: ganrad: v2.1.0: Introduced support for non-oai LLM models.  Added constant for Az AI Model Inference API. 
 * ID11072024: ganrad: v2.1.0: Moved literal constants from 'cache-dao.js' into this file.
*/

const ServerDefaults = {
  CacheEntryInvalidateSchedule: "*/45 * * * *",
  MemoryInvalidateSchedule: "*/10 * * * *"
};

const CustomRequestHeaders = { // ID05062024.n
  RequestId: "x-request-id",
  ThreadId: "x-thread-id"
};

const SchedulerTypes = { // ID05062024.n
  InvalidateCacheEntry: "invalidate_cache_entry",
  ManageMemory: "manage_memory"
};

const AiWorkflowEngines = {
  SeqAiEngine: "SequentialAiEngine"
};

const AzAiServices = {
  OAI: "azure_oai",
  AiSearch: "azure_search",
  Language: "azure_language",
  Translator: "azure_translator",
  ContentSafety: "azure_content_safety",
  AzAiModelInfApi: "azure_aimodel_inf" // ID11052024.n
};

const EndpointMetricsConstants = {
  DEF_METRICS_C_INTERVAL: 60, // Default metrics collection interval
  DEF_METRICS_H_COUNT: 5 // Default metrics history count
};

const ContentSafetyAPIKind = {
  Text: "text",
  Image: "image"
};

const TranslatorAPIKind = {
  Language: "languages",
  Translate: "translate",
  Transliterate: "transliterate",
  Detect: "detect",
  BrkSentence: "breaksentence",
  Dictionary: "dictionary"
};

const ServerTypes = { // ID09042024.n
  SingleDomain: "single-domain",
  MultiDomain: "multi-domain"
};

const RetrievalToolTypes = { // ID09042024.n
  AiAppGateway: "aiapp_gateway",
  WebApiApp: "webapi_app"
};

const ToolConditions = { // ID09042024.n
  BRANCH: "branch",
  STOP: "stop"
}

const SearchAlgorithms = { // ID11072024.n
  CosineSimilarity: "CosineSimilarity",
  EuclideanDistance: "EuclideanDistance",
  InnerProduct: "InnerProduct"
}

module.exports = {
  ServerDefaults,
  CustomRequestHeaders,
  SchedulerTypes, // ID05062024.n
  AiWorkflowEngines, // ID09042024.n
  AzAiServices,
  EndpointMetricsConstants,
  TranslatorAPIKind,
  ContentSafetyAPIKind,
  ServerTypes, // ID09042024.n
  RetrievalToolTypes, // ID09042024.n
  ToolConditions, // ID09042024.n
  SearchAlgorithms // ID11072024.n
}