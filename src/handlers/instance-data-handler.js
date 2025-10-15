/**
 * Name: InstanceInfoDataHandler
 * Description: This class retrieves data associated with an Ai Application Gateway instance.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 07-24-2025
 * Version (Introduced): 2.4.0
 *
 * Notes:
 * ID08252025: ganrad: v2.5.0: (Enhancement) Introduced cost tracking (/ budgeting) for models deployed on Azure AI Foundry.
 * ID10132025: ganrad: v2.7.0: (Enhancement) An AI Application can be enabled (active) or disabled.  In the disabled state, the AI gateway will
 * not accept inference requests and will return an exception.
 * ID10142025: ganrad: v2.7.0: (Enhancement) Introduced new feature to support normalization of AOAI output.
 *
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger');

const { ServerTypes, EndpointRouterTypes, AiAppGateway } = require("../utilities/app-gtwy-constants");
const AbstractDataHandler = require('./abstract-data-handler');

class InstanceInfoDataHandler extends AbstractDataHandler {
  constructor() {
    super();
  }

  #getSingleDomainAgentMetadata(req) {
    logger.log({ level: "debug", message: "[%s] %s.#getSingleDomainAgentMetadata():\n  Req ID: %s", splat: [scriptName, this.constructor.name, req.id] });

    let context = req.targeturis;
    let cacheConfig = req.cacheconfig;
    let serverContext = req.srvctx;

    let appcons = [];

    if (context.applications)
      context.applications.forEach((aiapp) => {
        let epIdx = 0; // Priority index
        let eps = new Map();
        aiapp.endpoints.forEach((element) => {
          let ep = { // ID08252025.n
            id: element.id ?? epIdx, // ID06162025.n
            weight: element.weight, // ID06162025.n
            rpm: element.rpm,
            uri: element.uri,
            model: element.model,
            payloadThreshold: element.payloadThreshold,
            task: element.task,
            days: element.days,
            startHour: element.startHour,
            endHour: element.endHour,
            budget: element.budget,
            healthPolicy: element.healthPolicy // ID05122025.n
          };
          eps.set(epIdx, ep);
          epIdx++;
        });

        let appeps = new Map();
        appeps.set("applicationId", aiapp.appId);
        appeps.set("description", aiapp.description);
        appeps.set("type", aiapp.appType);
        appeps.set("isActive", aiapp.isActive); // ID10132025.n
        if (aiapp.searchAiApp)
          appeps.set("searchAiApp", aiapp.searchAiApp);
        if (aiapp.normalizeOutput) // ID10142025.n
          appeps.set("normalizeOutput", aiapp.normalizeOutput); 
        appeps.set("cacheSettings", {
          useCache: aiapp.cacheSettings.useCache,
          searchType: aiapp.cacheSettings.searchType,
          searchDistance: aiapp.cacheSettings.searchDistance,
          searchContent: aiapp.cacheSettings.searchContent,
          entryExpiry: aiapp.cacheSettings.entryExpiry
        });
        // ID05062024.sn
        if (aiapp.memorySettings)
          appeps.set("memorySettings", {
            affinity: aiapp.memorySettings.affinity, // ID05082025.n
            useMemory: aiapp.memorySettings.useMemory,
            msgCount: aiapp.memorySettings.msgCount,
            entryExpiry: aiapp.memorySettings.entryExpiry
          });
        // ID05062024.en
        // ID05142025.sn
        if (aiapp.personalizationSettings)
          appeps.set("personalizationSettings", {
            userMemory: aiapp.personalizationSettings.userMemory,
            generateFollowupMsgs: aiapp.personalizationSettings.generateFollowupMsgs,
            userFactsAppName: aiapp.personalizationSettings.userFactsAppName,
            extractionPrompt: aiapp.personalizationSettings.extractionPrompt,
            followupPrompt: aiapp.personalizationSettings.followupPrompt
          });
        // ID05142025.en
        // ID08252025.sn
        if (aiapp.budgetSettings)
          appeps.set("budgetSettings", {
            useBudget: aiapp.budgetSettings.useBudget,
            budgetName: aiapp.budgetSettings.budgetName
        });
        // ID08252025.en
        appeps.set("endpointRouterType", aiapp.endpointRouterType ?? EndpointRouterTypes.PriorityRouter); 
        appeps.set("endpoints", Object.fromEntries(eps));
        appcons.push(Object.fromEntries(appeps));
      });

    let resp_obj = {
      serverName: context.serverId,
      serverType: context.serverType,
      serverVersion: AiAppGateway.Version,
      serverConfig: {
        host: serverContext.host,
        listenPort: serverContext.port,
        environment: process.env.API_GATEWAY_ENV,
        persistPrompts: process.env.API_GATEWAY_PERSIST_PROMPTS,
        collectInterval: Number(process.env.API_GATEWAY_METRICS_CINTERVAL),
        collectHistoryCount: Number(process.env.API_GATEWAY_METRICS_CHISTORY),
        configFile: process.env.API_GATEWAY_CONFIG_FILE
      },
      cacheSettings: {
        cacheEnabled: cacheConfig.cacheResults,
        embeddAiApp: cacheConfig.embeddApp,
        searchEngine: cacheConfig.srchEngine,
        cacheInvalidationSchedule: process.env.API_GATEWAY_CACHE_INVAL_SCHEDULE,
      },
      memorySettings: {
        memoryEnabled: process.env.API_GATEWAY_STATE_MGMT,
        memoryInvalidationSchedule: process.env.API_GATEWAY_MEMORY_INVAL_SCHEDULE
      },
      budgetConfig: context.budgetConfig, // ID08252025.n
      aiApplications: appcons,
      containerInfo: {
        imageID: process.env.IMAGE_ID,
        nodeName: process.env.NODE_NAME,
        podName: process.env.POD_NAME,
        podNamespace: process.env.POD_NAMESPACE,
        podServiceAccount: process.env.POD_SVC_ACCOUNT
      },
      aiAppGatewayUri: serverContext.endpoint,
      endpointUri: req.originalUrl,
      serverStartDate: serverContext.srvStartDate,
      serverStatus: serverContext.serverStatus
    };

    return (
      {
        http_code: 200,
        data: resp_obj
      }
    );
  }

  #getMultiDomainAgentMetadata(req) {
    logger.log({ level: "debug", message: "[%s] %s.#getMultiDomainAgentMetadata():\n  Req ID: %s", splat: [scriptName, this.constructor.name, req.id] });

    let context = req.targeturis;
    let serverContext = req.srvctx;

    let apps = [];
    if (context.applications)
      context.applications.forEach((aiapp) => {
        let appcont = new Map();
        appcont.set("applicationId", aiapp.appId);
        appcont.set("description", aiapp.description);
        appcont.set("enableToolTrace", aiapp.enableToolTrace);

        let tools = [];
        aiapp.appTools.forEach((tool) => {
          let tooldef = new Map();
          tooldef.set("toolName", tool.toolName);
          tooldef.set("description", tool.description);
          tooldef.set("toolType", tool.toolType);
          tooldef.set("targetUri", tool.targetUri);
          tooldef.set("aiApplicationName", tool.appName);
          tooldef.set("statefulAiApp", tool.stateful);
          tooldef.set("condition", tool.condition);
          tooldef.set("payloadToolId", tool.payloadToolId);

          tools.push(Object.fromEntries(tooldef));
        });
        appcont.set("appTools", tools);

        apps.push(Object.fromEntries(appcont));
      });

    let resp_obj = {
      serverName: context.serverId,
      serverType: context.serverType,
      serverVersion: AiAppGateway.Version,
      defaultAiGatewayUri: context.aiGatewayUri,
      serverConfig: {
        host: serverContext.host,
        listenPort: serverContext.port,
        environment: process.env.API_GATEWAY_ENV,
        configFile: process.env.API_GATEWAY_CONFIG_FILE
      },
      aiApplications: apps,
      containerInfo: {
        imageID: process.env.IMAGE_ID,
        nodeName: process.env.NODE_NAME,
        podName: process.env.POD_NAME,
        podNamespace: process.env.POD_NAMESPACE,
        podServiceAccount: process.env.POD_SVC_ACCOUNT
      },
      aiAppGatewayUri: serverContext.endpoint,
      endpointUri: req.originalUrl,
      serverStartDate: serverContext.srvStartDate,
      serverStatus: serverContext.serverStatus
    };

    return (
      {
        http_code: 200,
        data: resp_obj
      }
    );
  }

  handleRequest(request) {
    let response = null;

    switch (request.targeturis.serverType) {
      case ServerTypes.SingleDomain:
        response = this.#getSingleDomainAgentMetadata(request);
        break;
      case ServerTypes.MultiDomain:
        response = this.#getMultiDomainAgentMetadata(request);
        break;
    };

    return (response);
  }
}

module.exports = InstanceInfoDataHandler;