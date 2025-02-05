/**
 * Name: Azure Monitor Initializer
 * Description: Use this module to initialize Azure Monitor OpenTelemetry
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 02-04-2025
 * Version: 2.1.1
 *
 * Notes:
*/

const { AzureMonitorTraceExporter } = require('@azure/monitor-opentelemetry-exporter');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');

function initializeTelemetry(srvVersion) {
    // Create a new Resource object with the following custom resource attributes:
    //
    // * service_name: my-service
    // * service_namespace: my-namespace
    // * service_instance_id: my-instance
    const customResource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: "AI-Gateway",
        [SemanticResourceAttributes.SERVICE_NAMESPACE]: "AI-Gateway-NS",
        [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: process.env.API_GATEWAY_ID ?? "RAPID", // Set this value to Rapid instance name!
        [SemanticResourceAttributes.SERVICE_VERSION]: srvVersion
    });

    // Create a Tracer Provider
    const tracerProvider = new NodeTracerProvider({
        resource: customResource
    });

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

module.exports = { initializeTelemetry };
