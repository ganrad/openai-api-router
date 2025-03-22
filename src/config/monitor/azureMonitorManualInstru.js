/**
 * Name: Azure Monitor Initializer
 * Description: Use this module to initialize Azure Monitor OpenTelemetry
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 02-04-2025
 * Version: 2.1.1
 *
 * Notes:
 * ID03122025: ganrad: v2.3.0: (Enhancement) Ai App Gateway API request ID will be saved within the span in AppInsights. This should
 * help with troubleshooting performance issues.
*/

const { AzureMonitorTraceExporter } = require('@azure/monitor-opentelemetry-exporter');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');
const { trace, context } = require('@opentelemetry/api'); // ID03122025.n
const { AsyncHooksContextManager } = require('@opentelemetry/context-async-hooks'); // ID03122025.n

function initializeTelemetry(srvVersion) {
  try {
    // Create a new Resource object with the following custom resource attributes:
    //
    // * service_name: my-service
    // * service_namespace: my-namespace
    // * service_instance_id: my-instance
    const customResource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: "AI-Gateway",
        [SemanticResourceAttributes.SERVICE_NAMESPACE]: "AI-Gateway-NS",
        [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: process.env.API_GATEWAY_ID,
        [SemanticResourceAttributes.SERVICE_VERSION]: srvVersion
    });

    // Create a Tracer Provider
    const tracerProvider = new NodeTracerProvider({
        resource: customResource
    });

    // Initialize and set the context manager; ID03122025.n
    const contextManager = new AsyncHooksContextManager();
    contextManager.enable();
    context.setGlobalContextManager(contextManager);

    // Register the Tracer Provider as the global tracer
    tracerProvider.register();

    // Create an Azure Monitor Exporter instance
    const exporter = new AzureMonitorTraceExporter({
        connectionString: process.env['APPLICATIONINSIGHTS_CONNECTION_STRING'],
    });

    // Add the exporter to the Tracer Provider
    tracerProvider.addSpanProcessor(new BatchSpanProcessor(exporter, {
        bufferTimeout: 15000,
        bufferSize: 1000
    }));

    // Register automatic instrumentation
    registerInstrumentations({
        tracerProvider,
        instrumentations: [
            getNodeAutoInstrumentations(),
            new PgInstrumentation(),
        ],
        enableLiveMetrics: true
    });
  }
  catch (error) {
    console.error("Error initializing telemetry:", error);
  }
}

function addCustomPropertiesToSpan(propertiesMap) { // ID03122025.n
  const span = trace.getSpan(context.active());
  if (span) {
    propertiesMap.forEach((value, key) => {
      span.setAttribute(key, value);
    });
  };
}

module.exports = { 
  initializeTelemetry,
  addCustomPropertiesToSpan // ID03122025.n
};