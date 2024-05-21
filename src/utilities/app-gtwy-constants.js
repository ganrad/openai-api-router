/**
 * Name: AI application gateway constants
 * Description: This module contains definitions for constants used in AI Application Gateway.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 04-24-2024
 *
 * Notes:
 * ID05032024: ganrad: Added support for Azure AI Content Safety
 * ID05062024: ganrad: Added support for state management feature for Azure OAI Service
 *
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
}

const AzAiServices = {
  OAI: "azure_oai",
  AiSearch: "azure_search",
  Language: "azure_language",
  Translator: "azure_translator",
  ContentSafety: "azure_content_safety"
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

module.exports = {
  ServerDefaults,
  CustomRequestHeaders,
  SchedulerTypes, // ID05062024.n
  AzAiServices,
  EndpointMetricsConstants,
  TranslatorAPIKind,
  ContentSafetyAPIKind
}
