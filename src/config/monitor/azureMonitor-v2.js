/**
 * Name: Azure Monitor Initializer (distro path)
 * Description: Initializes Azure Monitor OpenTelemetry using the Microsoft distro package
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 05-12-2026
 * Version (Introduced): 3.0.1
 *
 * Notes:
 * - Updated for current Azure Monitor distro API:
 *   * resourceFromAttributes
 *   * supported spanProcessors option
 *   * optional addCustomPropertiesToSpan helper
 */

const { useAzureMonitor } = require("@azure/monitor-opentelemetry");
const { resourceFromAttributes } = require("@opentelemetry/resources");
const { trace, context } = require("@opentelemetry/api");

let telemetryInitialized = false;

// Custom span processor used by Azure Monitor distro
class SpanEnrichingProcessor {
  forceFlush() {
    return Promise.resolve();
  }

  shutdown() {
    return Promise.resolve();
  }

  onStart(_span) {}

  onEnd(span) {
    // span.attributes["CustomDimension1"] = "value1";
    // span.attributes["CustomDimension2"] = "value2";
  }
}

function initializeTelemetry(srvVersion) {
  if (telemetryInitialized) return;

  try {
    const httpInstrumentationConfig = {
      enabled: true,
      ignoreIncomingRequestHook: (request) => {
        return request?.method === "OPTIONS";
      },
      ignoreOutgoingRequestHook: (options) => {
        return options?.path === "/test";
      },
    };

    const customResource = resourceFromAttributes({
      "service.name": "AI-Gateway",
      "service.namespace": (process.env.API_GATEWAY_ENV) ? `AI-Gateway-NS-${process.env.API_GATEWAY_ENV}` : "AI-Gateway-NS",
      "service.instance.id": process.env.API_GATEWAY_ID || "unknown-gateway",
      "service.version": srvVersion || "unknown-version",
    });

    useAzureMonitor({
      resource: customResource,
      spanProcessors: [new SpanEnrichingProcessor()],
      instrumentationOptions: {
        http: httpInstrumentationConfig,
        postgreSql: { enabled: true },
        // winston: { enabled: true }, // enable if you want winston logs bridged
      },
    });

    telemetryInitialized = true;
    // console.log("Azure Monitor distro telemetry initialized successfully.");
  } 
  catch (error) {
    console.error("Error initializing Azure Monitor telemetry:", error);
  };
}

function addCustomPropertiesToSpan(propertiesMap) {
  const span = trace.getSpan(context.active());
  if (!span || !propertiesMap) return;

  propertiesMap.forEach((value, key) => {
    if (value !== undefined && value !== null) {
      span.setAttribute(key, value);
    }
  });
}

module.exports = {
  initializeTelemetry,
  addCustomPropertiesToSpan,
};