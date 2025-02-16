/**
 * Name: Azure Monitor Initializer
 * Description: Use this module to initialize Azure Monitor OpenTelemetry
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 02-03-2025
 * Version: 2.1.1
 *
 * Notes:
*/

const { useAzureMonitor } = require("@azure/monitor-opentelemetry");
const { Resource } = require("@opentelemetry/resources");
const { SemanticResourceAttributes } = require("@opentelemetry/semantic-conventions");

function initializeTelemetry() {

    // Filter using HTTP instrumentation configuration
    const httpInstrumentationConfig = {
        enabled: true,
        ignoreIncomingRequestHook: (request) => {
            // Ignore OPTIONS incoming requests
            if (request.method === 'OPTIONS') {
                return true;
            };
            
            return false;
        },
        ignoreOutgoingRequestHook: (options) => {
            // Ignore outgoing requests with /test path
            if (options.path === '/test') {
                return true;
            };

            return false;
        }
    };

    // Create a new Resource object with the following custom resource attributes:
    //
    // * service_name: my-service
    // * service_namespace: my-namespace
    // * service_instance_id: my-instance
    const customResource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: "AI-Gateway",
        [SemanticResourceAttributes.SERVICE_NAMESPACE]: "AI-Gateway-NS",
        [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: process.env.API_GATEWAY_ID
    });

    const options = {
        // Sampling could be configured here
        // samplingRatio: 1,
        // Use custom Resource
        resource: customResource,
        instrumentationOptions: {
            // Custom HTTP Instrumentation Configuration
            // http: httpInstrumentationConfig,
            http: { enabled: true},
            // winston: { enabled: true},
            postgreSql: { enabled: true },
        },
    };

    useAzureMonitor(options);
}

module.exports = { initializeTelemetry };