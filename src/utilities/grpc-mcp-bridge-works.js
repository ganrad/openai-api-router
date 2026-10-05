const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto'); // Built-in Node.js module
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

class GrpcMcpBridge {
  /**
   * @param {Object} comprises of the following attributes (below)
   * {string} protoPath - Path to your .proto file
   * {string} serviceUrl - e.g., 'localhost:50051'
   * {Object} auth - type, keyName, keyValue
   */
  constructor(config = {}) { // protoPath, serviceUrl) {
    this.protoPath = config.protoPath;
    this.serviceUrl = config.serviceUrl;
    this.auth = config.auth;
    this.client = null;
    this.serviceDefinition = null;
    this.packageDefinition = null; // Store the full package definition for schema mapping
  }

  /**
   * Initializes the gRPC client and discovers the service definition.
   */
  /**
  async initialize() {
    try {
      // Generate a random 16-character hex string for the filename
      const randomName = crypto.randomBytes(8).toString('hex') + '.proto';
      // const localPath = path.join(os.tmpdir(), randomName);
      const localPath = path.join(__dirname, 'temp.proto');

      // Download the proto def to temp directory
      const response = await axios.get(this.protoPath);
      fs.writeFileSync(localPath, response.data);

      const packageDefinition = protoLoader.loadSync(localPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });
      console.log("Proto file loaded and parsed successfully.");

      const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
      console.log("Step 2");

      // Dynamically find the first service in the proto file
      const serviceEntry = Object.entries(packageDefinition).find(
        ([_, value]) => value.format !== 'Protocol Buffer 3 DescriptorProto' && value.path);

      if (!serviceEntry) {
        throw new Error("No service definition found in the provided .proto file.");
      }

      const [serviceFullName, definition] = serviceEntry;
      this.serviceDefinition = definition;

      // Navigate the namespace (e.g., 'mypackage.MyService') to get the constructor
      const namespace = serviceFullName.split('.');
      let ServiceClass = protoDescriptor;
      for (const segment of namespace) {
        ServiceClass = ServiceClass[segment];
      }

      // Client interceptor.  Injects the API key into the metadata for every request.
      const authInterceptor = (options, nextCall) => {
        return new grpc.InterceptingCall(nextCall(options), {
          start: (metadata, listener, next) => {
            // Add the API key to the outgoing metadata
            metadata.add(this.auth.keyName, this.auth.keyValue);
            next(metadata, listener);
          }
        })
      };

      // In production, use grpc.credentials.createSsl() for TLS
      this.client = new ServiceClass(
        this.serviceUrl,
        grpc.credentials.createInsecure(),
        { interceptors: [authInterceptor] }
      );
    }
    catch (error) {
      throw new Error(`gRPC Initialization failed: ${error.message}`);
    }
  }
  */

  async initialize() {
    try {
      const localPath = path.join(__dirname, 'temp.proto');
      const response = await axios.get(this.protoPath);
      fs.writeFileSync(localPath, response.data);

      const packageDefinition = protoLoader.loadSync(localPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });
      this.packageDefinition = packageDefinition; // Store for later schema mapping
      console.log("Package definition contents: ", packageDefinition);

      const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);

      // 1. Find the service key. 
      // In proto-loader, Services have a 'format' property usually undefined or 
      // we can check for the existence of methods within the object.
      const serviceFullName = Object.keys(packageDefinition).find(key => {
        const item = packageDefinition[key];
        // A service definition in the flat map contains method definitions 
        // which are objects containing a 'path' property (e.g. /package.Service/Method)
        return Object.values(item).some(val => val && val.path);
      });

      if (!serviceFullName) {
        throw new Error("No service definition found in the provided .proto file.");
      }

      // 2. SUCCESS: Store the definition for getMethodDefs()
      // This is the object containing 'CheckEligibility' and 'GetBenefits' keys
      this.serviceDefinition = packageDefinition[serviceFullName];

      // 3. Navigate protoDescriptor for the Client Constructor
      const segments = serviceFullName.split('.');
      let ServiceClass = protoDescriptor;
      for (const segment of segments) {
        ServiceClass = ServiceClass[segment];
      }

      const authInterceptor = (options, nextCall) => {
        return new grpc.InterceptingCall(nextCall(options), {
          start: (metadata, listener, next) => {
            metadata.add(this.auth.keyName, this.auth.keyValue);
            next(metadata, listener);
          }
        });
      };

      this.client = new ServiceClass(
        this.serviceUrl,
        grpc.credentials.createInsecure(),
        { interceptors: [authInterceptor] }
      );

      console.log(`Initialized: ${serviceFullName}`);
    }
    catch (error) {
      throw new Error(`gRPC Initialization failed: ${error.message}`);
    }
  }

  /**
   * Returns MCP-compatible tool definitions including input and output schemas.
   */
  /**
  getMcpTools() {
    if (!this.serviceDefinition) throw new Error("Bridge not initialized");

    return Object.entries(this.serviceDefinition).map(([methodName, methodDef]) => {
      return {
        name: methodName,
        description: `Execute gRPC method: ${methodName}`,
        inputSchema: this._mapMessageToSchema(methodDef.requestType),
        outputSchema: this._mapMessageToSchema(methodDef.responseType),
      };
    });
  }
  */

  getMcpTools() {
    if (!this.serviceDefinition) throw new Error("Bridge not initialized");

    return Object.entries(this.serviceDefinition).map(([methodName, methodDef]) => {
      // methodDef.requestType and methodDef.responseType are already the objects 
      // from packageDefinition that _mapMessageToSchema needs.
      // You don't need to look them up by name again.

      return {
        name: methodName,
        description: `Execute gRPC method: ${methodName}`,
        inputSchema: this._mapMessageToSchema(methodDef.requestType),
        outputSchema: this._mapMessageToSchema(methodDef.responseType),
      };
    });
  }

  /**
   * Invokes the gRPC method using JSON arguments.
   */
  async invoke(methodName, args) {
    return new Promise((resolve, reject) => {
      if (typeof this.client[methodName] !== 'function') {
        return reject(new Error(`Method ${methodName} not found on client`));
      }

      this.client[methodName](args, (error, response) => {
        if (error) {
          reject(new Error(`gRPC Error [${error.code}]: ${error.message}`));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Converts gRPC message types into JSON Schema for MCP.
   */
  /**
  _mapMessageToSchema(messageType) {
    const schema = {
      type: "object",
      properties: {},
      required: []
    };

    // messageType.type.field contains the protobuf field descriptors
    if (messageType && messageType.type && messageType.type.field) {
      messageType.type.field.forEach(field => {
        schema.properties[field.name] = {
          type: this._protoTypeToJsonType(field.type),
          description: `Protobuf type: ${field.type}`
        };

        // In proto3, fields are optional by default, but you can logic-check labels here
        if (field.label === 'LABEL_REQUIRED') {
          schema.required.push(field.name);
        }
      });
    }

    return schema;
  }

  _protoTypeToJsonType(protoType) {
    const map = {
      TYPE_STRING: "string",
      TYPE_INT32: "integer",
      TYPE_INT64: "string", // Int64 often handled as string in JSON to avoid precision loss
      TYPE_BOOL: "boolean",
      TYPE_DOUBLE: "number",
      TYPE_FLOAT: "number",
      TYPE_MESSAGE: "object"
    };
    return map[protoType] || "string";
  }
  */

  _mapMessageToSchema(messageType) {
    const schema = {
      type: "object",
      properties: {},
      required: []
    };

    // Ensure we are looking at the 'type' property of the descriptor
    const definition = messageType?.type || messageType;

    if (definition && definition.field) {
      definition.field.forEach(field => {
        let fieldSchema = {};

        // Remove leading dot from typeName (e.g., '.eligibility.v1.Money' -> 'eligibility.v1.Money')
        const typeName = field.typeName?.startsWith('.')
          ? field.typeName.substring(1)
          : field.typeName;

        if (field.type === 'TYPE_MESSAGE') {
          const nestedType = this.packageDefinition[typeName];
          // Recursive call
          fieldSchema = nestedType ? this._mapMessageToSchema(nestedType) : { type: "object" };
        }
        else if (field.type === 'TYPE_ENUM') {
          const enumType = this.packageDefinition[typeName];
          // Enums in packageDefinition have values in enumType.type.value
          const allowedValues = enumType?.type?.value?.map(v => v.name) || [];

          fieldSchema = {
            type: "string",
            enum: allowedValues,
            description: `Allowed values: ${allowedValues.join(', ')}`
          };
        }
        else {
          fieldSchema = {
            type: this._protoTypeToJsonType(field.type)
          };
        }

        // Add field description
        fieldSchema.description = fieldSchema.description || `Protobuf type: ${field.type}`;

        // Handle Collections (repeated fields)
        if (field.label === 'LABEL_REPEATED') {
          schema.properties[field.name] = {
            type: "array",
            items: fieldSchema
          };
        } else {
          schema.properties[field.name] = fieldSchema;
        }

        if (field.label === 'LABEL_REQUIRED') {
          schema.required.push(field.name);
        }
      });
    }

    return schema;
  }

  _protoTypeToJsonType(protoType) {
    const map = {
      TYPE_STRING: "string",
      TYPE_INT32: "integer",
      TYPE_INT64: "string",
      TYPE_BOOL: "boolean",
      TYPE_DOUBLE: "number",
      TYPE_FLOAT: "number",
      TYPE_ENUM: "string", // Enums usually passed as strings or ints in JSON
      TYPE_MESSAGE: "object"
    };
    return map[protoType] || "string";
  }
}

module.exports = {
  GrpcMcpBridge
}