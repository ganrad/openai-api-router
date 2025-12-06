/**
 * Name: Define AI App. Gateway JSON Schemas and validate configuration files.
 * Description: This module defines the JSON schemas for both single-domain and multi-domain AI Application Gateway types.
 * Contains functions to validate the Gateway configuration file(s).
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 09-04-2024
 * Version: v2.1.0
 *
 * Notes:
 * ID01242025: ganrad: v2.2.0: (DEPRECATED) 'jsonschema' validator is no longer used.  This file is kept for reference purposes only.
*/

const path = require('path');
const scriptName = path.basename(__filename);

const { ServerTypes } = require("../utilities/app-gtwy-constants.js");
const logger = require("../utilities/logger.js");

const Validator = require('jsonschema').Validator;

// Single domain agent config file JSON Schema
let singleDomainAgentSchema = {
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"$id": "https://github.com/openai-api-router.schema.json",
	"title": "SingleDomainAgent",
	"description": "A single domain AI Agent",
	"type": "object",
	"properties": {
		"serverId": {
			"description": "Unique identity of the AI Application Agent/Gateway/Server/Platform",
			"type": "string"
		},
		"serverType": {
			"description": "AI Application agent type - single-domain or multi-domain",
			"type": "string",
			"enum": ["single-domain", "multi-domain"]
		},
		"applications": {
			"description": "List of AI Applications",
			"type": "array",
			"items": {
				"type": "object",
				"properties": {
					"appId": {
						"description": "Unique AI Application ID",
						"type": "string",
						"unique": true
					},
					"description": {
						"description": "AI Application description",
						"type": "string"
					},
					"appType": {
						"description": "Type of AI Application",
						"type": "string",
						"enum": ["azure_language", "azure_translator", "azure_content_safety", "azure_search", "azure_oai", "azure_aimodel_inf"]
					},
					"searchAiApp": {
						"description": "Name of the AI Search Application",
						"type": "string"
					},
					"cacheSettings": {
						"description": "Cache settings for an AI Application",
						"type": "object",
						"properties": {
							"useCache": {
								"description": "Enable cache for AI Application?",
								"type": "boolean"
							},
							"searchType": {
								"description": "Type of algorithm used to match vector entities",
								"type": "string",
								"enum": ["CosineSimilarity", "EuclideanDistance"]
							},
							"searchDistance": {
								"description": "Search algorithm match rate - 1.0 to 100.0%",
								"type": "number"
							},
							"searchContent": {
								"description": "Search content to match in request object",
								"type": "object",
								"properties": {
									"term": {
										"description": "Search terms - prompt or messages",
										"type": "string",
										"enum": ["prompt", "messages"]
									},
									"includeRoles": {
										"description": "Role values to extract and include in search",
										"type": "string"
									}
								},
								"required": ["term"],
								"additionalProperties": false
							},
							"entryExpiry": {
								"description": "Time interval used to invalidate/evict cached entries",
								"type": "string"
							}
						},
						"required": ["useCache"],
						"additionalProperties": false
					},
					"memorySettings": {
						"description": "Memory settings for an AI Application",
						"type": "object",
						"properties": {
							"useMemory": {
								"description": "Enable memory for user sessions/threads?",
								"type": "boolean"
							},
							"msgCount": {
								"description": "No. of messages to save in memory for a given user session",
								"type": "number",
								"exclusiveMinimum": 0
							},
							"entryExpiry": {
								"description": "Time interval used to invalidate/evict memory entries",
								"type": "string"
							}
						},
						"required": ["useMemory"],
						"additionalProperties": false
					},
					"endpoints": {
						"description": "Endpoint settings for an AI Application",
						"type": "array",
						"items": {
							"type": "object",
							"properties": {
								"rpm": {
									"description": "Rate limit in requests per minute (RPM) for this endpoint",
									"type": "number",
									"exclusiveMinimum": 0
								},
								"uri": {
									"description": "AI Service endpoint URI",
									"type": "string"
								},
								"apikey": {
									"description": "AI Service API Key",
									"type": "string"
								}
							},
							"required": ["uri", "apikey"],
							"additionalProperties": false
						},
						"minItems": 1
					}
				},
				"required": ["appId", "appType", "cacheSettings", "memorySettings", "endpoints"],
				"additionalProperties": false
			},
			"minItems": 1,
			"uniqueItems": true
		}
	},
	"required": ["serverId", "serverType", "applications"],
	"additionalProperties": false
};

// Multi domain agent config. file JSON Schema
let multiDomainAgentSchema = {
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"$id": "https://github.com/openai-api-router.schema.json",
	"title": "MultiDomainAgent",
	"description": "A multi domain AI Agent",
	"type": "object",
	"properties": {
		"serverId": {
			"description": "Unique identity of the AI Application Agent/Gateway/Server/Platform",
			"type": "string"
		},
		"serverType": {
			"description": "AI Application agent type - single-domain or multi-domain",
			"type": "string",
			"enum": ["single-domain", "multi-domain"]
		},
		"aiGatewayUri": {
			"description": "Endpoint URI of the default AI Application Gateway",
			"type": "string"
		},
		"applications": {
			"description": "List of AI Applications",
			"type": "array",
			"items": {
				"type": "object",
				"properties": {
					"appId": {
						"description": "Unique AI Application ID",
						"type": "string",
						"unique": true
					},
					"description": {
						"description": "AI Application description",
						"type": "string"
					},
					"enableToolTrace": {
						"description": "Enable tool execution path tracing for this AI Application (true/false)",
						"type": "boolean"
					},
					"appTools": {
						"description": "List of Tools for an AI Application",
						"type": "array",
						"items": {
							"type": "object",
							"properties": {
								"toolName": {
									"description": "Unique tool name/ID",
									"type": "string",
									"unique": true
								},
								"description": {
									"description": "Description of tool",
									"type": "string"
								},
								"toolType": {
									"description": "Type of tool",
									"type": "string",
									"enum": ["aiapp_gateway", "webapi_app"]
								},
								"appName": {
									"description": "AI Application ID as defined in the target AI Application Gateway",
									"type": "string"
								},
								"prompt": {
									"description": "Payload object",
									"type": "object",
									"properties": {
										"messages": {
											"description": "List of messages",
											"type": "array",
											"items": {
												"type": "object",
												"properties": {
													"role": {
														"description": "Role can be user, system or assistant",
														"type": "string",
														"enum": ["user", "system", "assistant"]
													},
													"content": {
														"description": "Message content",
														"type": "string"
													}
												},
												"required": ["role", "content"]
											}
										}
									},
									"additionalProperties": true
								},
								"params": {
									"description": "An object containing name:value pairs to be passed to the Web/External API",
									"type": "object",
									"patternProperties": {
										"^.*$": {
											"description": "Param key",
											"type": ["string"]
										},
										"^.*$": {
											"description": "Param key value",
											"type": ["string", "number", "object", "boolean", "null"]
										}
									},
									"additionalProperties": true
								},
								"targetUri": {
									"description": "Endpoint URI of the AI App Gateway or Web API",
									"type": "string"
								},
								"condition": {
									"description": "Keyword for next action to be taken by AI App Gateway",
									"type": "string",
									"enum": ["branch", "stop"]
								},
								"stateful": {
									"description": "Is session tracking enabled for this AI Application?",
									"type": "boolean"
								},
								"payloadToolId": {
									"description": "Tool ID whose response should be in included/added to request payload of this tool",
									"type": "array",
									"items": {
										"description": "An array of Tool ID's whose responses should be included in this Tool's input/prompt",
										"type": "string"
									}
								}
							},
							"required": ["toolName", "toolType", "prompt"]
						},
						"minItems": 1,
						"uniqueItems": true
					}
				},
				"required": ["appId", "appTools"],
				"additionalProperties": false
			},
			"minItems": 1,
			"uniqueItems": true
		}
	},
	"required": ["serverId", "serverType", "applications"],
	"additionalProperties": false
};

exports.validateSchema = (srvConfig) => {
	let srvType = srvConfig.serverType;

	if (!srvType) {
		logger.log({ level: "error", message: "[%s] validateSchema():\n  Encountered exception:  Server type (serverType) value in configuration file is null. Cannot continue...", splat: [scriptName] });

		return false;
	};

	let validator = new Validator();
	let result = validator.validate(srvConfig, (srvType === ServerTypes.SingleDomain) ? singleDomainAgentSchema : multiDomainAgentSchema);

	let mesg = result.valid ? "OK" : "Errors found";
	logger.log({ level: "info", message: "[%s] validateSchema():\n  Result: %s\n  Schema: %s\n  Errors:  %s", splat: [scriptName, mesg, result.schema, JSON.stringify(result?.errors, null, 2)] });

	return (result.valid);
};