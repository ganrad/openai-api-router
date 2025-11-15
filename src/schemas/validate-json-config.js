/**
 * Name: Defines AI App. Gateway JSON Schemas and validates configuration files.
 * Description: This module defines the JSON schemas for both single-domain and multi-domain AI Application Gateway types.
 * Contains functions to validate the Gateway configuration file(s).
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 09-04-2024
 * Version: v2.1.0
 *
 * Notes:
 * ID01242025: ganrad: v2.2.0: Switched to AJV Json Schema parser and validator.
 * ID08252025: ganrad: v2.5.0: Added new schema contained within single domain App schema.  This schema contains elements for tracking costs (budgeting)
 * for API calls made by single domain AI Apps.
 * ID09272025: ganrad: v2.7.0: Added new schema to support integration with MCP servers.
 * ID11062025: ganrad: v2.9.0: Added Ajv init parameter to not generate warnings for Union types.
*/

const path = require('path');
const scriptName = path.basename(__filename);

const { ServerTypes } = require("../utilities/app-gtwy-constants.js");
const logger = require("../utilities/logger.js");

const Ajv = require("ajv");
const fs = require("fs");

const sdSchemaFile = "/single-domain-gtwy-schema.json";
const sdAiAppSchemaFile = "/sd-ai-app-schema.json";
const sdAiAppBudgetSchemaFile = "/gtwy-budget-schema.json"; // ID08252025.n
const sdAiAppMcpServersSchemaFile = "/gtwy-mcp-servers-schema.json"; // ID09272025.n
const singleDomainAgentSchema = JSON.parse(fs.readFileSync(__dirname + sdSchemaFile));
const sdAiAppSchema = JSON.parse(fs.readFileSync(__dirname + sdAiAppSchemaFile));
const sdAiAppBudgetSchema = JSON.parse(fs.readFileSync(__dirname + sdAiAppBudgetSchemaFile)); // ID08252025.n
const sdAiAppMcpServersSchema = JSON.parse(fs.readFileSync(__dirname + sdAiAppMcpServersSchemaFile)); // ID09272025.n

const mdSchemaFile = "/multi-domain-gtwy-schema.json";
const mdAiAppSchemaFile = "/md-ai-app-schema.json";
const multiDomainAgentSchema = JSON.parse(fs.readFileSync(__dirname + mdSchemaFile));
const mdAiAppSchema = JSON.parse(fs.readFileSync(__dirname + mdAiAppSchemaFile));

const ajvAiServer = new Ajv({schemas: [singleDomainAgentSchema, sdAiAppSchema, sdAiAppBudgetSchema, sdAiAppMcpServersSchema, multiDomainAgentSchema, mdAiAppSchema], allErrors: true, strictSchema: false, allowUnionTypes: true}); // ID08252025.n, ID09272025.n, ID11062025.n
const ajvAiApps = new Ajv({schemas: [sdAiAppSchema,mdAiAppSchema], allErrors: true, strictSchema: false, allowUnionTypes: true}); // ID11062025.n

module.exports = {
	singleDomainAgentSchema,
	sdAiAppSchema,
	sdAiAppBudgetSchema, // ID08252025.n
	sdAiAppMcpServersSchema, // ID09272025.n
	multiDomainAgentSchema,
	mdAiAppSchema,
	validateAiServerSchema: (srvConfig) => {
		let srvType = srvConfig.serverType;
	
		if (!srvType) {
			logger.log({ level: "error", message: "[%s] validateAiServerSchema():\n  Encountered exception:  Server type ('serverType') value in configuration file is null. Cannot continue...", splat: [scriptName] });
	
			return false;
		};
	
		// const validate = agv.compile((srvType === ServerTypes.SingleDomain) ? singleDomainAgentSchema : multiDomainAgentSchema);
		const validate = ajvAiServer.getSchema((srvType === ServerTypes.SingleDomain) ? "https://github.com/ganrad/rapid/schemas/single-domain-gtwy-schema.json" : "https://github.com/ganrad/rapid/schemas/multi-domain-gtwy-schema.json");
		const valid = validate(srvConfig);
		
		let details = valid ? "None" : validate.errors;
		let result = {
			schema_compliant: valid,
			errors: details
		}
		logger.log({ level: "info", message: "[%s] validateAiServerSchema():\nResult:\n%s", splat: [scriptName, JSON.stringify(result, null, 2)] });
	
		return (result);
	},
	validateAiAppSchema: (aiAppConfig, srvType) => {
		const validate = ajvAiApps.getSchema((srvType === ServerTypes.SingleDomain) ? "https://github.com/ganrad/rapid/schemas/sd-ai-app-schema.json" : "https://github.com/ganrad/rapid/schemas/md-ai-app-schema.json");
		const valid = validate(aiAppConfig);
		
		let details = valid ? "None" : validate.errors;
		let result = {
			schema_compliant: valid,
			errors: details
		}
		logger.log({ level: "info", message: "[%s] validateAiAppSchema():\nResult:\n%s", splat: [scriptName, JSON.stringify(result, null, 2)] });
	
		return (result);
	}
}