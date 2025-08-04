/**
 * Name: MetricsDataHandler
 * Description: This class retrieves metrics associated with an Ai Application / Ai App Gateway.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 07-24-2025
 * Version (Introduced): 2.4.0
 *
 * Notes:
 *
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger');

const { ServerTypes } = require("../utilities/app-gtwy-constants");
const AbstractDataHandler = require('./abstract-data-handler');

class MetricsDataHandler extends AbstractDataHandler {
  constructor() {
    super();
  }

  #retrieveSDServerMetrics(
    req,
    appConnections,
    cacheMetrics,
    apiCalls) {
    logger.log({ level: "debug", message: "[%s] %s.#retrieveSDServerMetrics():\n  Req ID: %s", splat: [scriptName, this.constructor.name, req.id] });

    let conList = [];
    appConnections.getAllConnections().forEach(function (epdata, ky) {
      let priorityIdx = 0;
      let epDict = [];
      epdata.forEach(function (value, key) {
        let dict = {
          id: value.getUniqueId(), // ID04172025.n
          endpoint: key,
          priority: priorityIdx,
          metrics: value.toJSON()
        };
        epDict.push(dict);
        priorityIdx++;
      });

      let conObject = {
        applicationId: ky,
        cacheMetrics: cacheMetrics.getCacheMetrics(ky),
        endpointMetrics: epDict
      };
      conList.push(conObject);
    });

    let srv_data = {
      hostName: process.env.API_GATEWAY_HOST,
      listenPort: process.env.API_GATEWAY_PORT,
      // instanceName: process.env.API_GATEWAY_NAME, ID09032024.o
      serverName: req.targeturis.serverId, // ID09032024.n (+ To be consistent with server, changed 'instanceName' to 'serverName')
      serverType: req.targeturis.serverType, // ID09032024.n
      // ID09032024.sn
      containerInfo: {
        imageID: process.env.IMAGE_ID,
        nodeName: process.env.NODE_NAME,
        podName: process.env.POD_NAME,
      },
      // ID09032024.en
      collectionIntervalMins: Number(process.env.API_GATEWAY_METRICS_CINTERVAL),
      historyCount: Number(process.env.API_GATEWAY_METRICS_CHISTORY),
      applicationMetrics: conList,
      // successApiCalls: (instanceCalls - instanceFailedCalls) - cachedCalls, // ID04222024.n
      successApiCalls: (apiCalls[0] - apiCalls[1]) - apiCalls[2],
      cachedApiCalls: apiCalls[2], // ID02202024.n
      failedApiCalls: apiCalls[1],
      totalApiCalls: apiCalls[0],
      endpointUri: req.originalUrl,
      currentDate: new Date().toLocaleString(),
      serverStatus: req.srvctx.ServerStatus
    };

    return ({
      http_code: 200,
      data: srv_data
    });
  }

  #retrieveAiAppMetrics(
    req,
    appId,
    appConnections,
    cacheMetrics) { // ID04172025.n
    const appsConfig = req.targeturis; // AI application configurations
    let application = this._getAiApplication(appId, appsConfig);
    logger.log({ level: "info", message: "[%s] %s.#retrieveAiAppMetrics():\n  Req ID: %s\n  AI Application ID: %s", splat: [scriptName, this.constructor.name, req.id, appId] });

    if (!application) {
      return (
        {
          http_code: 404, // Resource not found!
          data: {
            error: {
              target: req.originalUrl,
              message: `AI Application ID [${appId}] not found. Unable to process request.`,
              code: "invalidPayload"
            }
          }
        }
      );
    };

    let payload = null;
    let appConnection = appConnections.getConnection(appId);
    if (appConnection) { // A map keyed by endpoint uri's containing metrics data
      let priorityIdx = 0;
      let epDict = [];

      appConnection.forEach(function (value, key) {
        let dict = {
          id: value.getUniqueId(),
          endpoint: key,
          priority: priorityIdx,
          metrics: value.toJSON()
        };
        epDict.push(dict);
        priorityIdx++;
      });

      payload = {
        applicationId: appId,
        appType: application.appType,
        description: application.description,
        cacheMetrics: cacheMetrics.getCacheMetrics(appId),
        endpointMetrics: epDict
      };
    }
    else { // AI Application has not been invoked yet. Hence connection metrics have not been lazy loaded.
      payload = {
        applicationId: appId,
        appType: application.appType,
        description: application.description,
        cacheMetrics: {
          hitCount: 0,
          avgScore: 0.0
        },
        endpointMetrics: []
      };
    }

    return (
      {
        http_code: 200,
        data: payload
      }
    );
  }

  #retrieveMDServerMetrics(req, metricsContainer, apiCalls) {
    logger.log({ level: "debug", message: "[%s] %s.#retrieveMDServerMetrics():\n  Req ID: %s", splat: [scriptName, this.constructor.name, req.id] });

    let appCtx = req.targeturis;
    let appList = [];

    for (const application of appCtx.applications) {
      const appDetails = {
        appId: application.appId,
        description: application.description,
        metrics: metricsContainer.getAiAppMetrics(application.appId)
      }
      appList.push(appDetails);
    };

    let res_obj = {
      hostName: process.env.API_GATEWAY_HOST,
      listenPort: process.env.API_GATEWAY_PORT,
      serverName: appCtx.serverId,
      serverType: appCtx.serverType,
      containerInfo: {
        imageID: process.env.IMAGE_ID,
        nodeName: process.env.NODE_NAME,
        podName: process.env.POD_NAME,
      },
      applicationMetrics: appList,
      successApiCalls: apiCalls[0],
      failedApiCalls: apiCalls[1],
      totalApiCalls: apiCalls[0] + apiCalls[1],
      endpointUri: req.originalUrl,
      currentDate: new Date().toLocaleString(),
      status: req.srvctx.ServerStatus
    };

    return (
      {
        http_code: 200,
        data: res_obj
      }
    );
  }

  handleRequest(request) {
    let response = null;

    switch (request.targeturis.serverType) {
      case ServerTypes.SingleDomain:
        const appId = request.params.app_id; // AI Application ID;
        response = appId ?
          this.#retrieveAiAppMetrics(request, appId, arguments[1], arguments[2]) :
          this.#retrieveSDServerMetrics(request, arguments[1], arguments[2], arguments[3]);
        break;
      case ServerTypes.MultiDomain:
        response = this.#retrieveMDServerMetrics(request, arguments[1], arguments[2]);
        break;
    };

    return (response);
  }
}

module.exports = MetricsDataHandler;