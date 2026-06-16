const { SwaggerParser } = require('@apidevtools/swagger-parser');
const { OpenAPIClientAxios } = require('openapi-client-axios');
const { McpServerAuthTypes } = require('./app-gtwy-constants.js');

class OpenApiMcpBridge {
  constructor(options = {}) {
    this.specUrl = options.specUrl;
    this.apiClient = null;
    this.authConfig = options.auth || {}; // { type: 'bearer', token: '...' }
    this.dereferencedSpec = null;
  }

  /**
   * Initializes and validates the OpenAPI spec.
   * Resolves all $refs so schemas are self-contained for the LLM.
   */
  async initialize() {
    try {
      // 1. Validate and De-reference the spec (crucial for production)
      /**
      const bundledSpec = await SwaggerParser.bundle(this.specUrl, {
        resolve: {
          http: {
            headers: {
              "x-api-key": "dev-key"
            }
          }
        }
      });
      const dereferencedSpec = await SwaggerParser.dereference(bundledSpec);

      const dereferencedSpec = await SwaggerParser.validate(this.specUrl, {
        resolve: {
          http: {
            headers: {
              [this.authConfig.keyName] : this.authConfig.keyValue,
              "accept": "application/json",
            },
          },
        },
      });
      */

      // 1) Fetch manually with the known-good header
      const res = await fetch(this.specUrl, {
        headers: {
          [this.authConfig.keyName]: this.authConfig.keyValue,
          "accept": "application/json"
        }
      });

      const text = await res.text();
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}\n${text.slice(0, 300)}`);
      };

      // 2) Confirm JSON parse (if this fails, you're not getting JSON back)
      let spec;
      try {
        spec = JSON.parse(text);
      }
      catch (e) {
        throw new Error(`Response wasn't JSON. First 200 chars:\n${text.slice(0, 200)}`);
      };

      // 3) Validate (and resolve any external $refs with headers)
      const dereferencedSpec = await SwaggerParser.validate(spec, {
        resolve: {
          http: {
            headers: {
              [this.authConfig.keyName]: this.authConfig.keyValue,
              "accept": "application/json"
            }
          }
        }
      });
      // Call _ensureOperationIdsInSpec() before initializing OpenAPIClientAxios() !
      this._ensureOperationIdsInSpec(dereferencedSpec);

      // 2. Initialize the dynamic client
      this.apiClient = new OpenAPIClientAxios({
        definition: dereferencedSpec,
        axiosConfigDefaults: this._getAxiosConfig(),
        // optional: ensure names aren't transformed unexpectedly
        transformOperationName: (name) => name
      });
      await this.apiClient.init();

      this.dereferencedSpec = dereferencedSpec;
    }
    catch (error) {
      throw new Error(`Failed to initialize API bridge: ${error.message}, Details: ${error.details && JSON.stringify(error.details, null, 2)}`);
    };
  }

  /**
  * Discovers all endpoints and maps them to MCP Tool definitions.
  * Includes 'outputSchema' for response data discovery.
  */
  getMcpTools() {
    if (!this.apiClient) throw new Error("Bridge not initialized");

    return this.apiClient.getOperations().map(op => {
      // 1. Identify the success response (200, 201, or 'default')
      const successResponse = op.responses?.['200'] || op.responses?.['201'] || op.responses?.default;

      // 2. Extract the JSON schema for the output
      const outputSchema = successResponse?.content?.['application/json']?.schema || {
        type: "object",
        description: "No specific JSON output schema defined."
      };

      return {
        name: op.operationId,
        description: op.summary || op.description || `Invoke ${op.path}`,
        inputSchema: this._mapToMcpSchema(op),
        // Added outputSchema to the returned tool object
        outputSchema: {
          ...outputSchema,
          description: successResponse?.description || outputSchema.description
        }
      };
    });
  }

  /**
   * Securely invokes an API operation using MCP-style arguments.
   */
  async invoke(operationId, args = {}) {
    const client = await this.apiClient.getClient();

    // Use OpenAPIClientAxios' own lookup
    const op = this.apiClient.getOperation(operationId);
    if (!op) {
      throw new Error(`Operation "${operationId}" not found in API spec`);
    };

    // Partition args into params vs body using op.parameters
    const paramNames = new Set((op.parameters || []).map(p => p.name));
    const params = {};
    const body = {};

    for (const [k, v] of Object.entries(args || {})) {
      if (paramNames.has(k)) params[k] = v;
      else body[k] = v;
    };

    console.log("***** Uri: ", this.specUrl, ", Operation ID: ", operationId, ", Params names: ", paramNames, ", Params: ", params);

    const hasBody = !!op.requestBody;
    const hasParams = Object.keys(params).length > 0;
    const hasBodyFields = Object.keys(body).length > 0;

    try {
      // Preferred: call by operationId (operation methods are operationId-based)
      // [1](https://deepwiki.com/openapistack/openapi-client-axios/3.3-operation-methods)
      // [2](https://openapistack.co/docs/openapi-client-axios/usage/)
      if (typeof client[operationId] === 'function') {
        const res = await client[operationId](
          hasParams ? params : (hasBody ? null : undefined),
          hasBody ? (hasBodyFields ? body : null) : undefined
        );
        return res.data;
      };

      // Fallback: call via paths dictionary (path+method) [2](https://openapistack.co/docs/openapi-client-axios/usage/)
      const pathFn = client?.paths?.[op.path]?.[op.method];
      if (typeof pathFn === 'function') {
        const res = await pathFn(
          hasParams ? params : (hasBody ? null : undefined),
          hasBody ? (hasBodyFields ? body : null) : undefined
        );
        return res.data;
      };

      throw new Error(`Operation "${operationId}" not callable on client (no method and no paths fallback)`);
    } 
    catch (error) {
      const message = error.response?.data?.message || error.message;
      throw new Error(`API Invocation Error (${operationId}): ${message}`);
    };
  }

  _mapToMcpSchema(op) {
    const schema = { type: "object", properties: {}, required: [] };

    // Map all parameters (Path, Query, Header)
    (op.parameters || []).forEach(p => {
      schema.properties[p.name] = { ...p.schema, description: p.description };
      if (p.required) schema.required.push(p.name);
    });

    // Merge JSON Request Body properties
    const body = op.requestBody?.content?.['application/json']?.schema;
    if (body?.properties) {
      Object.assign(schema.properties, body.properties);
      if (body.required) schema.required.push(...body.required);
    }

    return schema;
  }

  _makeOperationId(method, path) {
    const m = String(method || '').toLowerCase();
    const clean = String(path || '')
      .trim()
      .replace(/^\/+/, '')                 // drop leading /
      .replace(/\/+/g, '/')                // collapse //
      .replace(/[{}]/g, '')                // remove { }
      .replace(/[\/\-]/g, '_')             // / and - => _
      .replace(/[^A-Za-z0-9_]/g, '_')      // sanitize
      .replace(/_+/g, '_')                 // collapse ___
      .replace(/^_+|_+$/g, '');            // trim _
    return `${m}_${clean || 'root'}`;
  }

  _collectExistingOperationIds(spec) {
    const used = new Set();
    const paths = spec?.paths || {};
    for (const p of Object.keys(paths)) {
      const item = paths[p] || {};
      for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']) {
        const op = item[method];
        if (op?.operationId) used.add(op.operationId);
      };
    };

    return used;
  }

  _ensureOperationIdsInSpec(spec) {
    const paths = spec?.paths || {};
    const used = this._collectExistingOperationIds(spec);

    for (const p of Object.keys(paths)) {
      const item = paths[p] || {};
      for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']) {
        const op = item[method];
        if (!op) continue;

        if (!op.operationId || typeof op.operationId !== 'string' || !op.operationId.trim()) {
          const base = this._makeOperationId(method, p);
          let candidate = base;
          let i = 1;
          while (used.has(candidate)) candidate = `${base}_${i++}`;
          op.operationId = candidate;
        };
        used.add(op.operationId);
      };
    };
  }

  _getAxiosConfig() {
    const config = { headers: {} };
    if (this.authConfig.type === McpServerAuthTypes.OAuth) {
      config.headers.Authorization = `Bearer ${this.authConfig.token}`;
    }
    else if (this.authConfig.type === McpServerAuthTypes.ApiKey) {
      config.headers[this.authConfig.keyName || 'X-API-Key'] = this.authConfig.keyValue;
    };

    return config;
  }
}

module.exports = {
  OpenApiMcpBridge
}