'use strict';
/**
 * Wiring sketch: where tool retrieval sits in the RAPID request path.
 * Adapt the RAPID-side calls (marked <<RAPID>>) to your actual interfaces.
 *
 * `requestId` is threaded through every call so a single gateway request can be
 * traced end to end: grep the logs for one requestId and you get the index build
 * (if it was cold), the retrieval span with per-tool scores, and the recall check.
 */

const { ToolIndexRegistry } = require('./toolIndexRegistry');
const { ToolRetriever } = require('./toolRetriever');
const { GatewayEmbedder } = require('./gatewayEmbedder');
const { TraceLogger } = require('./traceLogger');

// ---------------------------------------------------------------------------
// Startup (once per RAPID process)
// ---------------------------------------------------------------------------
function initToolRetrieval({ gateway, appConfigStore, logger }) {
  const tracer = new TraceLogger(logger, { enabled: true, includeCandidates: true, maxCandidates: 50 });

  const embedder = new GatewayEmbedder({
    // <<RAPID>> dogfood the gateway: route the embedding call through RAPID itself.
    // Pass requestId along so the embedding call shows up under the same request.
    invoke: ({ model, input, dimensions, requestId }) =>
      gateway.embeddings({ model, input, dimensions, requestId }).then(r => r.data.map(d => d.embedding)),
    model: 'text-embedding-3-small',
    dimensions: 512,
    logger,
  });

  const retriever = new ToolRetriever({ embedder, tracer, logger });

  const registry = new ToolIndexRegistry({
    agentsRoot: './agents',
    embedder,
    getAppConfig: appName => appConfigStore.get(appName),
    retriever, tracer, logger,
    options: { maxResidentApps: 32 },
  });

  return { registry, retriever, tracer };
}

// ---------------------------------------------------------------------------
// Per request
// ---------------------------------------------------------------------------
async function planWithRetrieval({ requestId, appName, userTurn, thread, ctx }) {
  const { registry, retriever, mcpToolCache, planner, appConfigStore, logger } = ctx;
  const appCfg = await appConfigStore.get(appName);
  const rCfg = appCfg.toolRetrieval || {};

  // 1. Lazy-build (or reuse) the index for this app.
  const index = await registry.get(appName, requestId);

  // 2. Shortlist. Retrieval is stateless across turns -- current user turn only.
  const { tools: shortlist, meta } = await retriever.retrieve(index, userTurn, { requestId, config: rCfg });

  // 3. Resolve ids against the cached tools/list. ONLY this goes to the planner:
  //    server, name, description, inputSchema, outputSchema. No SKILL.md prose.
  //
  //    A shortlisted tool that is no longer exposed by the MCP server is dropped
  //    here and logged. That log line is the signal that a SKILL.md file is stale
  //    and needs a manual correction plus an app reload.
  const buildPlannerTools = list => list.flatMap(t => {
    // <<RAPID>> your EXISTING tools/list cache -- retrieval never calls the MCP server
    const live = (mcpToolCache.get(t.server) || []).find(x => x.name === t.name);
    if (!live) {
      logger.warn?.(
        { requestId, app: appName, tool: t.id },
        'shortlisted tool is not in the tools/list cache -- SKILL.md may be stale; dropped'
      );
      return [];
    }
    return [{
      server: t.server,
      name: live.name,
      description: live.description,
      inputSchema: live.inputSchema,
      outputSchema: live.outputSchema,
    }];
  });

  let plannerTools = buildPlannerTools(shortlist);

  // 4. Plan.
  let plan = await planner.plan({ requestId, query: userTurn, thread, tools: plannerTools });

  // 5. Fallback: planner found nothing usable -> retry once with a wider net.
  //    Costs latency on the rare miss instead of silently answering without tools.
  if (!plan?.steps?.length && rCfg.fallback?.onEmptyPlan !== 'none' && meta.mode !== 'expanded') {
    logger.info?.({ requestId, app: appName }, 'planner returned an empty plan -- expanding the shortlist');
    const wide = await retriever.retrieve(index, userTurn, { requestId, config: rCfg, expand: true });
    plannerTools = buildPlannerTools(wide.tools);
    plan = await planner.plan({ requestId, query: userTurn, thread, tools: plannerTools });
    shortlist.push(...wide.tools);
  }

  // 6. Correctness signal: was every planned tool actually in the shortlist?
  //    Grep `shortlistMiss:true` -- if that never appears, topK can come down.
  retriever.recordRecall({
    requestId,
    appName,
    shortlistIds: shortlist.map(t => t.id),
    plannedToolIds: (plan?.steps || []).map(s => `${s.server}.${s.tool}`),
  });

  logger.info?.(
    { requestId, app: appName, plannerToolCount: plannerTools.length, catalogSize: meta.total },
    'planner prompt assembled'
  );

  return { plan, shortlist, retrievalMeta: meta };
}

// ---------------------------------------------------------------------------
// Admin: POST /admin/apps/:name/reload  (and fs.watch in dev)
// ---------------------------------------------------------------------------
function registerAdminRoutes(app, { registry }) {
  app.post('/admin/apps/:name/reload', async (req, res) => {
    const requestId = req.id || req.headers['x-request-id'] || null;
    registry.invalidate(req.params.name, requestId);
    const index = await registry.get(req.params.name, requestId);
    res.json({ ok: true, app: req.params.name, tools: index.entries.length, version: index.version });
  });

  app.get('/admin/tool-index/stats', (req, res) => res.json(registry.stats()));
}

module.exports = { initToolRetrieval, planWithRetrieval, registerAdminRoutes };