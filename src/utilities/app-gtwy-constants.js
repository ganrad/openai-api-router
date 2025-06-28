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
 * ID01232025: ganrad: v2.2.0: Introduced new constants for AI Application server, application resource types and actions,
 * DB resource actions, document processor types & statuses.
 * ID01242025: ganrad: v2.2.0: Introduced constants for HTTP methods.
 * ID02072025: ganrad: v2.2.0: Introduced constants for gateway config provider type.
 * ID02102025: ganrad: v2.2.0: Introduced constant for default AI App Gateway (SD) Uri.
 * ID02202025: ganrad: v2.3.0: (Bugfix) Added new constant for default max character limit for body-parser. 
 * Default is 100KB for JSON and URL-encoded data.
 * Updated body-parser to accept up to 600Kb ~ 150K TPMs for JSON data (request payload).
 * ID02212025: ganrad: v2.3.0: Added new constant for embedding model max. input token limit.
 * ID05142025: ganrad: v2.3.8: Added new constant for AOAI Message role types
 * ID03282025: ganrad: v2.4.0: Added new constant for AI Agent Service Annotation types
 * ID03242025: ganrad: v2.4.0: Added new constants 1) To support AI Agent Service 2) Agent API version
 * ID06162025: ganrad: v2.3.9: Added new constant for 1) Backend endpoint router types 2) OpenAI Base URI
*/

const DefaultAiGatewayUri = "http://localhost:8080/api/v1/dev/apirouter/lb"; // ID02102025.n
const DefaultJsonParserCharLimit = "600kb"; // ID02202025.n
const DefEmbeddingModelTokenLimit = 8192; // ID02212025.n
const OpenAIBaseUri = "api.openai.com"; // ID06162025.n
const DefaultEndpointLatency = 5000; // ID06162025.n; 5 seconds

const AzureApiVersions = { // ID03242025.n
  AiAgentService: '2024-12-01-preview'
};

const HttpMethods = { // ID01242025.n
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  PATCH: 'PATCH',
  HEAD: 'HEAD',
  OPTIONS: 'OPTIONS',
};

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
  AzAiModelInfApi: "azure_aimodel_inf", // ID11052024.n
  AzAiAgent: "azure_ai_agent" // ID03242025.n
};

const EndpointMetricsConstants = {
  DEF_METRICS_C_INTERVAL: 60, // Default metrics collection interval
  DEF_METRICS_H_COUNT: 24 // Default metrics history count
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

const AppServerStatus = { // ID01232025.n
  Started: "Started",
  Running: "Running",
  Stopped: "Stopped"
}

const AppResourceTypes = { // ID01232025.n
  AiAppServer: "AiAppServer",
  AiApplication: "AiApplication",
  RagApplication: "RagApplication"
}

const AppResourceActions = { // API Level; ID01232025.n
  Operation: "operations", // Get/Show all resource operations
  Get: "get", // Retrieve resource + details
  Deploy: "deploy", // Deploy resource - Add / Update
  Delete: "delete", // Delete a resource
  Status: "status" // Check resource status
}

const ResourceDBActions = { // ID01232025.n
  Created: "Created",
  Updated: "Updated",
  Deleted: "Deleted"
}

const DocProcessorTypes = { // ID01232025.n
  DefaultProcessor: "TextDocProcessor"
}

const DocProcessorStatus = { // ID01232025.n
  Created: "CREATED",
  Reprocess: "REPROCESS",
  Inprocess: "IN_PROCESS",
  Completed: "COMPLETED",
  Failed: "FAILED",
  Deployed: "DEPLOYED"
}

const ConfigProviderType = { // ID02072025.n
  File: "File",
  SqlDB: "SqlDB"
}

const MessageRoleTypes = { // ID05142025.n
  User: "User",
  Assistant: "Assistant",
  UserAssistant: "UserAssistant"
}

const EndpointRouterTypes = { // ID06162025.n
  PriorityRouter: "Priority",  // Default
  WeightedRandomRouter: "RandomWeighted",
  WeightedDynamicRouter: "LatencyWeighted"
}

const AzAiAgentRunStatus = { // ID03252025.n
  Queued: "queued",
  InProgress: "in_progress",
  Failed: "failed",
  Completed: "completed"
}

const AzAiAgentAnnotationTypes = { // ID03282025.n
  UrlCitation: "url_citation",
  FileCitation: "file_citation",
  SearchCitation: "search_citation"
}

module.exports = {
  DefaultAiGatewayUri, // ID02102025.n
  DefaultJsonParserCharLimit, // ID02202025.n
  DefEmbeddingModelTokenLimit, // ID02212025.n
  DefaultEndpointLatency, // ID06162025.n
  OpenAIBaseUri, // ID06162025.n
  HttpMethods, // ID01232025.n
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
  SearchAlgorithms, // ID11072024.n
  AppServerStatus, // ID01232025.n
  AppResourceTypes, // ID01232025.n
  ResourceDBActions, // ID01232025.n
  AppResourceActions, // ID01232025.n
  DocProcessorTypes, // ID01232025.n
  DocProcessorStatus, // ID01232025.n
  ConfigProviderType, // ID02072025.n
  AzureApiVersions, // ID03242025.n
  MessageRoleTypes, // ID05142025.n
  EndpointRouterTypes, // ID06162025.n
  AzAiAgentRunStatus, // ID03252025.n
  AzAiAgentAnnotationTypes // ID03282025.n
}