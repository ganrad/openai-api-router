/**
 * Name: MetricsDataHandler
 * Description: This class retrieves user metrics data - api requests, threads, endpoints, tokens consumed, cost metrics, model cache reads & writes, latency info.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 09-28-2026
 * Version (Introduced): v3.0.1
 *
 * Notes:
 *
*/
const fs = require('fs');
const path = require('path');
const minify = require('pg-minify');
const format = require('pg-format');

const scriptName = path.basename(__filename);
const logger = require('../utilities/logger');

const AbstractDataHandler = require('./abstract-data-handler');
const persistdb = require("../services/pp-pg.js");
const { TblNames, PersistDao } = require("../utilities/persist-dao.js");

const { ServerTypes, EpMetricsOutputFormat } = require("../utilities/app-gtwy-constants");

// Read the usermetrics-queries.sql file as a single string
const usermetricsQueriesFileContent = fs.readFileSync(path.join(__dirname, '../sql-queries/usermetrics-queries.sql'), 'utf8');

class UserMetricsDataHandler extends AbstractDataHandler {
  constructor() {
    super();
  }

  #transformMetricsQuery(priceData) {
    // 1. Map through rows and build an explicitly casted tuple string for each row
    const rowStrings = priceData.map(row => {
      // Safely escape the string input for the varchar column
      const safeModelName = format('%L', row.gen_model);

      // Construct the typed columns for this specific row tuple
      return `(${safeModelName}::varchar, ${row.in_rate}::numeric, ${row.cr_rate}::numeric, ${row.cw_rate}::numeric, ${row.out_rate}::numeric)`;
    });

    // 2. Join all individual rows with commas to form the full VALUES content
    const inlinedValuesString = rowStrings.join(', ');

    // 3. Assemble the complete WITH statement string
    const dynamicWithClause = `WITH price (gen_model, in_rate, cr_rate, cw_rate, out_rate) AS ( VALUES ${inlinedValuesString} )`;

    return (dynamicWithClause);
  }

  async #retrieveAiAppUserMetrics(req, appConnections) {
    let persistPrompts = (process.env.API_GATEWAY_PERSIST_PROMPTS === 'true') ? true : false

    if (!persistPrompts) { // Prompt persistence is disabled for this AI Application Platform instance!

    };

    const gatewayConfig = req.targeturis; // AI application platform config

    const serverId = gatewayConfig.serverId; // AI Application Platform ID
    const appId = req.params.aiAppName; // AI Application ID
    const userId = req.query.userName; // User name
    const from = req.query.from; // From time
    const to = req.query.to; // To time
    const bucket = req.query.bucket || "1h"; // eg., 1h
    const threadCount = parseInt(req.query.topThreads) || 20;

    let application = this._getAiApplication(appId, gatewayConfig);
    logger.log({ level: "info", message: "[%s] %s.#retrieveAiAppUserMetrics():\n  Req ID: %s\n  AI Application ID: %s", splat: [scriptName, this.constructor.name, req.id, appId] });

    if (!application) {
      return (
        {
          http_code: 404, // Resource not found!
          format: EpMetricsOutputFormat.JSON,
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

    if (!userId) { // User name / id is required to retrieve user level metrics
    };

    if (!application?.budgetSettings || !application?.budgetSettings.useBudget) { // If budget class is not defined for the app or if budgeting is disabled, return an exception
    };

    let responseHdrs = {  // Set the response headers
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
    };

    // let appConnection = appConnections.getConnection(appId); // Required ?

    // Extract individual query strings safely
    // pg-minify handles PostgreSQL comments, blocks, and literal strings perfectly
    const userMetricsQueryStmts = minify(usermetricsQueriesFileContent, { compress: false })
      .split(/(?<=;)/) // Splits right after each valid semicolon tokenized by minify
      .map(q => q.trim())
      .filter(q => q.length > 0);

    const budgetClass = application?.budgetSettings.budgetName;
    const modelClassDef = gatewayConfig.budgetConfig.find(bclass => bclass.budgetName === budgetClass);

    const budgetModelNames = application.endpoints.map(ep => ep.budget?.modelName).filter(Boolean);
    const modelPriceDefs = modelClassDef.models.filter(modelDef => budgetModelNames.find(bmName => bmName === modelDef.modelName)).map(priceDef => {
      return {
        gen_model: priceDef.modelName,
        in_rate: priceDef.tokenPriceInfo.inputTokensCostPer1k,
        cr_rate: priceDef.tokenPriceInfo.cachedInputTokensCostPer1k || 0,
        cw_rate: priceDef.tokenPriceInfo.cachedWriteTokensCostPer1k || 0,
        out_rate: priceDef.tokenPriceInfo.outputTokensCostPer1k
      };
    });
    const withClause = this.#transformMetricsQuery(modelPriceDefs);

    let payload = {};
    payload.serverName = serverId;
    payload.appName = appId;
    payload.userName = userId;
    payload.from = from;
    payload.to = to;
    payload.generatedAt = new Date().toISOString();
    payload.budgetClass = budgetClass;
    payload.currency = "USD"; // Hard-coded for testing

    let userMetricsDao = new PersistDao(persistdb, TblNames.UserMetrics);
    let values = [
      serverId,
      appId,
      userId,
      from,
      to
    ];

    const round = (v, d = 4) => (v == null ? null : Number(v.toFixed(d)));

    // Query 1
    let sqlQuery = withClause + ", " + userMetricsQueryStmts[0];
    const summary = await userMetricsDao.queryTable("req_metrics_id_0", 0, values, sqlQuery);
    // console.log(`Summary: ${JSON.stringify(summary,null,2)}`);
    if (summary.errors) {
      payload.errors = summary.errors;

      return (
        {
          http_code: 500, // DB error
          format: EpMetricsOutputFormat.JSON,
          responseHdrs,
          data: payload
        });
    };
    if (summary.rCount === 1) {
      payload.summary = {
        requests: Number(summary.data[0].requests),
        threads: Number(summary.data[0].threads),
        endpoints: Number(summary.data[0].endpoints),
        models: Number(summary.data[0].models),
        unpricedRequests: Number(summary.data[0].unpricedRequests),
        tokens: {
          input: Number(summary.data[0].input_tokens),
          cachedRead: Number(summary.data[0].cache_read_tokens),
          cachedWrite: Number(summary.data[0].cache_write_tokens),
          output: Number(summary.data[0].output_tokens),
          total: Number(summary.data[0].total_tokens)
        },
        cost: {
          total: Number(summary.data[0].total_cost),
          avgPerRequest: Number(summary.data[0].avg_cost_per_request),
          input: 0.0,
          cacheRead: 0.0,
          cacheWrite: 0.0,
          output: 0.0
        },
        cache: {
          savings: Number(summary.data[0].cache_savings),
          writeCost: Number(summary.data[0].cache_write_cost),
          net: Number(summary.data[0].cache_net),
          readWriteRatio: 0 // Populated below
        },
        toolCalls: Number(summary.data[0].tool_calls),
        feedbackCount: Number(summary.data[0].feedback_count),
        latency: {
          avg: Number(summary.data[0].avg_latency_secs),
          p50: Number(summary.data[0].p50_latency_secs),
          p90: Number(summary.data[0].p90_latency_secs),
          p95: Number(summary.data[0].p95_latency_secs),
          p99: Number(summary.data[0].p99_latency_secs),
          max: Number(summary.data[0].max_latency_secs)
        }
      };
      const reads = Number(payload.summary.tokens.cachedRead) || 0;
      const writes = Number(payload.summary.tokens.cachedWrite) || 0;
      payload.summary.cache.readWriteRatio = writes > 0 ? round(reads / writes, 2) : null;
    }
    else {
      return (
        {
          http_code: 200, // OK
          format: EpMetricsOutputFormat.JSON,
          responseHdrs,
          data: "No data found!"
        });
    };

    // Query 2
    sqlQuery = withClause + " " + userMetricsQueryStmts[1];
    const byEndpoint = await userMetricsDao.queryTable("req_metrics_id_1", 1, values, sqlQuery);
    if (byEndpoint.errors) {
      payload.errors = byEndpoint.errors;

      return (
        {
          http_code: 500, // DB error
          format: EpMetricsOutputFormat.JSON,
          responseHdrs,
          data: payload
        });
    };
    if (byEndpoint.rCount >= 1) {
      payload.byEndpoint = [];
      let epObj;
      for (const endpoint of byEndpoint.data) {
        epObj = {
          endpointId: endpoint.endpoint_id,
          model: endpoint.gen_model,
          priced: endpoint.priced,
          requests: Number(endpoint.requests),
          threads: Number(endpoint.threads),
          tokens: {
            input: Number(endpoint.input_tokens),
            cacheRead: Number(endpoint.cache_read_tokens),
            cacheWrite: Number(endpoint.cache_write_tokens),
            output: Number(endpoint.output_tokens),
            total: Number(endpoint.total_tokens)
          },
          cost: {
            total: Number(endpoint.cost),
            input: Number(endpoint.cost_input),
            cacheRead: Number(endpoint.cost_cache_read),
            cacheWrite: Number(endpoint.cost_cache_write),
            output: Number(endpoint.cost_output)
          },
          costShare: 0.0, // Populated below
          tokenShare: 0.0, // Populated below
          latency: {
            avg: Number(endpoint.avg_latency_secs),
            p95: Number(endpoint.p95_latency_secs)
          },
          firstSeen: endpoint.first_seen,
          lastSeen: endpoint.last_seen
        };

        payload.summary.cost.input += epObj.cost.input;
        payload.summary.cost.cacheRead += epObj.cost.cacheRead;
        payload.summary.cost.cacheWrite += epObj.cost.cacheWrite;
        payload.summary.cost.output += epObj.cost.output;

        payload.byEndpoint.push(epObj);
      };

      // Derive endpoint cost/token shares
      const rows = payload.byEndpoint;
      const totalCost = rows.reduce((s, r) => s + (Number(r.cost.total) || 0), 0);
      const totalTokens = rows.reduce((s, r) => s + (Number(r.tokens.total) || 0), 0);

      for (const r of rows) {
        r.costShare = totalCost > 0 ? round((Number(r.cost.total) || 0) / totalCost) : 0;
        r.tokenShare = totalTokens > 0 ? round((Number(r.tokens.total) || 0) / totalTokens) : 0;
      };
    };

    // Query 2b
    sqlQuery = withClause + " " + userMetricsQueryStmts[2];
    const byModel = await userMetricsDao.queryTable("req_metrics_id_2", 2, values, sqlQuery);
    if (byModel.errors) {
      payload.errors = byModel.errors;

      return (
        {
          http_code: 500, // DB error
          format: EpMetricsOutputFormat.JSON,
          responseHdrs,
          data: payload
        });
    };
    if (byModel.rCount >= 1) {
      payload.byModel = [];
      let modelObj;
      for (const amodel of byModel.data) {
        modelObj = {
          model: amodel.gen_model,
          endpoints: Number(amodel.endpoints),
          priced: amodel.priced,
          requests: Number(amodel.requests),
          totalTokens: Number(amodel.total_tokens),
          cost: Number(amodel.cost)
        };

        payload.byModel.push(modelObj);
      };
    };

    // Query 3 - top N conversations by cost
    values.push(threadCount);
    sqlQuery = withClause + " " + userMetricsQueryStmts[3];
    const topThreads = await userMetricsDao.queryTable("req_metrics_id_3", 3, values, sqlQuery);
    if (topThreads.errors) {
      payload.errors = topThreads.errors;

      return (
        {
          http_code: 500, // DB error
          format: EpMetricsOutputFormat.JSON,
          responseHdrs,
          data: payload
        });
    };
    if (topThreads.rCount >= 1) {
      payload.topThreads = [];
      let threadObj;
      for (const thread of topThreads.data) {
        threadObj = {
          threadId: thread.threadid,
          turns: Number(thread.turns),
          endpoints: Number(thread.endpoints),
          endpointIds: thread.endpoint_ids,
          models: thread.models,
          totalTokens: Number(thread.total_tokens),
          cacheReadTokens: Number(thread.cache_read_tokens),
          toolCalls: Number(thread.tool_calls),
          feedbackCount: Number(thread.feedback_count),
          cost: Number(thread.cost),
          totalLatencySecs: Number(thread.total_latency_secs),
          avgLatencySecs: Number(thread.avg_latency_secs),
          startedAt: thread.started_at,
          endedAt: thread.ended_at,
          spanSecs: Number(thread.span_secs)
        };
        payload.topThreads.push(threadObj);
      };
    };

    // Query 5 - Trend series
    values.pop();
    values.push(bucket);
    sqlQuery = withClause + " " + userMetricsQueryStmts[6];
    const trend = await userMetricsDao.queryTable("req_metrics_id_6", 6, values, sqlQuery);
    if (trend.errors) {
      payload.errors = trend.errors;

      return (
        {
          http_code: 500, // DB error
          format: EpMetricsOutputFormat.JSON,
          responseHdrs,
          data: payload
        });
    };
    if (trend.rCount >= 1) {
      let points = [];
      payload.trend = {
        bucket,
        points
      };
      for (const atrend of trend.data) {
        let trendObj = {
          t: atrend.bucket,
          requests: Number(atrend.requests),
          threads: Number(atrend.threads),
          totalTokens: Number(atrend.total_tokens),
          cost: Number(atrend.cost),
          avgLatency: Number(atrend.avg_latency_secs),
          p95Latency: Number(atrend.p95_latency_secs)
        };

        points.push(trendObj);
      };
    };

    payload.warnings = {
      code: "UNPRICED_MODELS",
      message: `2 models are not in budget class ${budgetClass}`,
      models: ["gpt-to"],
      affectedRequests: summary.data[0]?.unpricedRequests
    };

    return (
      {
        http_code: 200,
        format: EpMetricsOutputFormat.JSON,
        responseHdrs,
        data: payload
      }
    );
  }

  async #retrieveUsersForTypeAhead(req) {
    const gatewayConfig = req.targeturis; // AI application platform config

    const serverId = gatewayConfig.serverId; // AI Application Platform ID
    const appId = req.params.aiAppName; // AI Application ID
    const userId = req.query.q; // Query: User name
    const from = req.query.from; // From time
    const to = req.query.to; // To time

    let application = this._getAiApplication(appId, gatewayConfig);
    logger.log({ level: "info", message: "[%s] %s.#retrieveUsersForTypeAhead():\n  Req ID: %s\n  AI Application ID: %s", splat: [scriptName, this.constructor.name, req.id, appId] });

    if (!application) {
      return (
        {
          http_code: 404, // Resource not found!
          format: EpMetricsOutputFormat.JSON,
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

    let responseHdrs = {  // Set the response headers
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
    };

    // Extract individual query strings safely
    // pg-minify handles PostgreSQL comments, blocks, and literal strings perfectly
    const userMetricsQueryStmts = minify(usermetricsQueriesFileContent, { compress: false })
      .split(/(?<=;)/) // Splits right after each valid semicolon tokenized by minify
      .map(q => q.trim())
      .filter(q => q.length > 0);

    let userMetricsDao = new PersistDao(persistdb, TblNames.UserMetrics);
    let values = [
      serverId,
      appId,
      userId,
      from,
      to
    ];
    // Query 7
    const userData = await userMetricsDao.queryTable("req_metrics_id_8", 7, values, userMetricsQueryStmts[8]);

    if (userData.errors) {
      return (
        {
          http_code: 500, // DB error
          format: EpMetricsOutputFormat.JSON,
          responseHdrs,
          data: userData.errors
        });
    };
    console.log(`*****\nUSER OUTPUT:\n${JSON.stringify(userData.data)}\n****`);

    return (
      {
        http_code: 200,
        format: EpMetricsOutputFormat.JSON,
        responseHdrs,
        data: (userData.rCount >= 1) ? userData.data : []
      }
    );
  }

  async #processUserMetricsRequest(req, appConnections) {
    const { aiAppName, resource, requestId } = req.params;

    // 1. GET /usermetrics/{aiAppName}
    if (!resource) {
      return await this.#retrieveAiAppUserMetrics(req, appConnections);
    };

    // 2. GET /usermetrics/{aiAppName}/requests
    if (resource === 'requests') {
      return res.send(`All requests for app: ${aiAppName}`);
    };

    // 3. GET /usermetrics/{aiAppName}/request/{requestId}
    if (resource === 'request' && requestId) {
      return res.send(`Request detail for ID: ${requestId} in app: ${aiAppName}`);
    };

    // 4. GET /usermetrics/{aiAppName}/users
    if (resource === 'users') {
      return await this.#retrieveUsersForTypeAhead(req);
    };

    // Fallback for unmatched patterns (e.g., /usermetrics/myApp/invalid-resource)
    return (
      {
        http_code: 404, // Resource not found!
        format: EpMetricsOutputFormat.JSON,
        data: {
          error: {
            target: req.originalUrl,
            message: `User metrics resource not found.`,
            code: "invalidPayload"
          }
        }
      }
    );
  }

  async handleRequest(request) {
    let response = null;

    switch (request.targeturis.serverType) {
      case ServerTypes.SingleDomain:
        response = await this.#processUserMetricsRequest(request, arguments[1]);
        break;
    };

    return (response);
  }
}

module.exports = UserMetricsDataHandler;