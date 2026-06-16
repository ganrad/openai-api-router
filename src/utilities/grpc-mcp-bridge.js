const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

class GrpcMcpBridge {
  /**
   * @param {Object} config
   * @param {string} config.protoPath - URL (http/https) OR local file path to .proto
   * @param {string} config.serviceUrl - URL to the gRPC service (eg., 'localhost:50051')
   * @param {Object} [config.auth] - { type, keyName, keyValue }
   */
  constructor(config = {}) {
    this.protoPath = config.protoPath;
    this.serviceUrl = config.serviceUrl;
    this.auth = config.auth || null;

    this.client = null;

    /** @type {import('@grpc/proto-loader').PackageDefinition|null} */
    this.packageDefinition = null;

    /** @type {import('@grpc/proto-loader').ServiceDefinition|null} */
    this.serviceDefinition = null;

    /** e.g., 'eligibility.v1.EligibilityService' */
    this.serviceFullName = null;
  }

  /**
   * Initializes the gRPC client and discovers the service definition.
   */
  async initialize() {
    try {
      // Use a unique temp file to avoid collisions across runs
      const localPath = path.join(os.tmpdir(), crypto.randomBytes(8).toString('hex') + '.proto');

      // Support URL or local proto file path
      if (/^https?:\/\//i.test(this.protoPath)) {
        const response = await axios.get(this.protoPath);
        fs.writeFileSync(localPath, response.data);
      } 
      else {
        // local path
        const content = fs.readFileSync(this.protoPath, 'utf8');
        fs.writeFileSync(localPath, content);
      };

      const packageDefinition = protoLoader.loadSync(localPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
        // includeDirs: [path.dirname(localPath)], // enable if you add imports
      });

      // Persist for schema mapping
      this.packageDefinition = packageDefinition;

      const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);

      // Find the first ServiceDefinition: an object whose values include MethodDefinitions with 'path'
      const serviceEntry = Object.entries(packageDefinition).find(([_, maybeServiceDef]) => {
        if (!maybeServiceDef || typeof maybeServiceDef !== 'object') return false;
        const values = Object.values(maybeServiceDef);
        return values.some(v => v && typeof v === 'object' && typeof v.path === 'string' && v.requestType && v.responseType);
      });

      if (!serviceEntry) {
        throw new Error("No service definition found in the provided .proto file.");
      };

      const [serviceFullName, serviceDef] = serviceEntry;
      this.serviceFullName = serviceFullName;
      this.serviceDefinition = serviceDef;

      // Navigate protoDescriptor to get the ServiceClientConstructor
      const segments = serviceFullName.split('.');
      let ServiceClass = protoDescriptor;
      for (const segment of segments) {
        ServiceClass = ServiceClass?.[segment];
      };

      if (!ServiceClass) {
        throw new Error(`Could not resolve service constructor for: ${serviceFullName}`);
      };

      // Optional interceptor (only if auth provided)
      const interceptors = [];
      if (this.auth?.keyName && this.auth?.keyValue) {
        const authInterceptor = (options, nextCall) => {
          return new grpc.InterceptingCall(nextCall(options), {
            start: (metadata, listener, next) => {
              metadata.add(this.auth.keyName, this.auth.keyValue);
              next(metadata, listener);
            }
          });
        };
        interceptors.push(authInterceptor);
      };

      this.client = new ServiceClass(
        this.serviceUrl,
        grpc.credentials.createInsecure(),
        interceptors.length ? { interceptors } : undefined
      );

      // Best-effort cleanup
      try { fs.unlinkSync(localPath); } catch { /* ignore */ }
    } 
    catch (error) {
      throw new Error(`gRPC Initialization failed: ${error.message}`);
    }
  }

  /**
   * Returns MCP-compatible tool definitions including input and output schemas.
   * NOTE: tool "name" uses the *client-callable* method name (usually camelCase).
   */
  getMcpTools() {
    if (!this.serviceDefinition || !this.packageDefinition) {
      throw new Error("Bridge not initialized");
    }

    return Object.entries(this.serviceDefinition)
      // Only keep actual RPC method entries (MethodDefinition has a 'path') 
      .filter(([_, methodDef]) => methodDef && typeof methodDef.path === 'string')
      .map(([methodName, methodDef]) => {
        const displayName = methodDef.originalName || methodName; // originalName often preserves proto casing

        return {
          name: methodName,
          description: `Execute gRPC method: ${displayName}`,
          inputSchema: this._mapMessageToSchema(methodDef.requestType),
          outputSchema: this._mapMessageToSchema(methodDef.responseType),
          // Optional metadata (keep or remove)
          x_grpc: {
            service: this.serviceFullName,
            rpc: displayName,
            path: methodDef.path
          }
        };
      });
  }

  /**
   * Invokes the gRPC method using JSON arguments.
   */
  async invoke(methodName, args) {
    return new Promise((resolve, reject) => {
      if (!this.client || typeof this.client[methodName] !== 'function') {
        return reject(new Error(`Method ${methodName} not found on client`));
      };

      this.client[methodName](args, (error, response) => {
        if (error) {
          reject(new Error(`gRPC Error [${error.code}]: ${error.message}`));
        } 
        else {
          resolve(response);
        };
      });
    });
  }

  /**
   * Converts gRPC message types into JSON Schema for MCP.
   *
   * messageType is typically a MessageTypeDefinition from proto-loader.
   */
  _mapMessageToSchema(messageType, visited = new Set()) {
    if (!messageType) return { type: "object", properties: {} };

    // Resolve by name if someone passes a string typeName
    if (typeof messageType === 'string') {
      const key = messageType.startsWith('.') ? messageType.slice(1) : messageType;
      const resolved = this.packageDefinition?.[key];
      if (!resolved) return { type: "object", properties: {} };
      return this._mapMessageToSchema(resolved, visited);
    }

    // messageType is usually MessageTypeDefinition { format, type, serialize/deserialize }
    const descriptor = messageType.type || messageType;

    const schema = {
      type: "object",
      properties: {},
      required: []
    };

    const fields = descriptor?.field;
    if (!Array.isArray(fields)) return schema;

    for (const field of fields) {
      const fieldType = field.type; // often 'TYPE_STRING', etc (enums as String)

      // Normalize typeName for message/enum refs
      const typeName = (field.typeName && field.typeName.startsWith('.'))
        ? field.typeName.slice(1)
        : field.typeName;

      let fieldSchema;

      if (fieldType === 'TYPE_MESSAGE') {
        // Guard recursion
        if (typeName && visited.has(typeName)) {
          fieldSchema = { type: "object" };
        } 
        else {
          const nestedDef = typeName ? this.packageDefinition?.[typeName] : null;
          if (typeName) visited.add(typeName);
          fieldSchema = nestedDef ? this._mapMessageToSchema(nestedDef, visited) : { type: "object" };
        };
      } 
      else if (fieldType === 'TYPE_ENUM') {
        const enumDef = typeName ? this.packageDefinition?.[typeName] : null;
        const allowed = enumDef?.type?.value?.map(v => v.name).filter(Boolean) || [];
        fieldSchema = allowed.length
          ? { type: "string", enum: allowed }
          : { type: "string" };
      } 
      else {
        fieldSchema = { type: this._protoTypeToJsonType(fieldType) };
      };

      // Optional descriptions
      fieldSchema.description = fieldSchema.description || `Protobuf type: ${fieldType}`;

      // repeated => array
      if (field.label === 'LABEL_REPEATED') {
        schema.properties[field.name] = { type: "array", items: fieldSchema };
      } 
      else {
        schema.properties[field.name] = fieldSchema;
      };

      // proto3 rarely uses required; proto2 only. Keep logic, but expect empty required for your proto3.
      if (field.label === 'LABEL_REQUIRED')
        schema.required.push(field.name);
    }

    // Remove required if empty (nice for MCP consumers)
    if (!schema.required.length) delete schema.required;

    return schema;
  }

  _protoTypeToJsonType(protoType) {
    // protoType is typically a string like 'TYPE_STRING' when enums option is String 【1-73a9a8】
    const map = {
      TYPE_STRING: "string",
      TYPE_BOOL: "boolean",
      TYPE_DOUBLE: "number",
      TYPE_FLOAT: "number",
      TYPE_INT32: "integer",
      TYPE_SINT32: "integer",
      TYPE_SFIXED32: "integer",
      TYPE_UINT32: "integer",
      TYPE_FIXED32: "integer",

      // longs are configured as String in your loader options
      TYPE_INT64: "string",
      TYPE_SINT64: "string",
      TYPE_SFIXED64: "string",
      TYPE_UINT64: "string",
      TYPE_FIXED64: "string",

      TYPE_BYTES: "string",
      TYPE_ENUM: "string",
      TYPE_MESSAGE: "object"
    };
    return map[protoType] || "string";
  }
}

module.exports = { GrpcMcpBridge };