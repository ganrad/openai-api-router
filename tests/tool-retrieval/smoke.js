'use strict';
/* Smoke test: parser -> index build -> retrieval, with a deterministic fake embedder. */

const assert = require('node:assert');
const path = require('node:path');
const { loadAppSkills } = require('../lib/skillLoader');
const { buildToolIndex } = require('../lib/toolIndexBuilder');
const { ToolRetriever } = require('../lib/toolRetriever');

const AGENTS = path.join(__dirname, '..', 'agents');
const APP = 'supply-chain-fullfillment-agent';

// Deterministic hashing "embedder": token-bag vectors. Not semantically meaningful,
// but exercises the whole path and makes lexically-similar text score high.
const DIMS = 64;
const fakeEmbedder = {
  async embedBatch(texts) {
    return texts.map(t => {
      const v = new Array(DIMS).fill(0);
      for (const tok of String(t).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
        let h = 0;
        for (const c of tok) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        v[h % DIMS] += 1;
      }
      return v;
    });
  },
  async embed(t) { return (await this.embedBatch([t]))[0]; },
};

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
};

(async () => {
  console.log('\n--- skillLoader ---');
  const skills = await loadAppSkills(AGENTS, APP);
  check('loads one skill file', () => assert.strictEqual(skills.length, 1));
  const s = skills[0];
  check('frontmatter name matches directory', () => assert.strictEqual(s.server, 'inventory-mgmt-mcp-server'));
  check('frontmatter metadata rapid.* extracted', () => assert.strictEqual(s.config.owner, 'supply-chain-platform'));
  check('parses all 7 tools', () => assert.strictEqual(s.tools.length, 7));
  check('folded block scalar description joined onto one line', () => {
    const t = s.tools.find(t => t.name === 'get_stock_level');
    assert.ok(!t.description.includes('\n'), 'description contains a newline');
    assert.ok(t.description.startsWith('Returns on-hand'), t.description.slice(0, 40));
    assert.ok(t.description.includes('available-to-promise'));
  });
  check('flow-sequence tags parsed', () => {
    const t = s.tools.find(t => t.name === 'get_stock_level');
    assert.deepStrictEqual(t.tags, ['inventory', 'read', 'stock', 'availability']);
  });
  check('block-sequence examples parsed', () => {
    const t = s.tools.find(t => t.name === 'get_stock_level');
    assert.strictEqual(t.examples.length, 3);
    assert.strictEqual(t.examples[0], 'how many units of SKU 88213 are left in DC07');
  });
  check('alwaysInclude boolean parsed', () => {
    assert.strictEqual(s.tools.find(t => t.name === 'lookup_sku').alwaysInclude, true);
    assert.strictEqual(s.tools.find(t => t.name === 'get_stock_level').alwaysInclude, false);
  });
  check('destructive boolean parsed', () => {
    assert.strictEqual(s.tools.find(t => t.name === 'transfer_stock').destructive, true);
  });

  console.log('\n--- toolIndexBuilder ---');
  const cache = new Map();
  const index = await buildToolIndex({
    agentsRoot: AGENTS, appName: APP, embedder: fakeEmbedder, embeddingCache: cache,
    config: { embeddingDimensions: DIMS }, logger: { info: () => {} },
  });
  check('index has 7 entries', () => assert.strictEqual(index.entries.length, 7));
  check('semanticReady', () => assert.strictEqual(index.semanticReady, true));
  check('ids are server.tool', () => assert.ok(index.entries.some(e => e.id === 'inventory-mgmt-mcp-server.get_stock_level')));
  check('retrieval text folds identifiers and includes aliases', () => {
    const e = index.entries.find(e => e.name === 'get_stock_level');
    assert.ok(e.text.includes('get stock level'), 'identifier not split');
    assert.ok(e.text.includes('available to promise'), 'alias missing');
  });
  check('embeddings cached and normalized', () => {
    assert.ok(cache.size > 0);
    const v = index.entries[0].embeddings[0];
    let n = 0; for (let i = 0; i < v.length; i++) n += v[i] * v[i];
    assert.ok(Math.abs(Math.sqrt(n) - 1) < 1e-5, 'vector not unit-normalized');
  });

  const cache2 = new Map(cache);
  const before = cache2.size;
  await buildToolIndex({ agentsRoot: AGENTS, appName: APP, embedder: {
    embedBatch: async () => { throw new Error('should not be called -- cache miss'); },
  }, embeddingCache: cache2, config: { embeddingDimensions: DIMS }, logger: { info: () => {} } });
  check('rebuild is fully cache-served (no embedder calls)', () => assert.strictEqual(cache2.size, before));

  console.log('\n--- alwaysInclude budget ---');
  await (async () => {
    const skillsCopy = JSON.parse(JSON.stringify(skills));
    let threw = false;
    const builder = require('../lib/toolIndexBuilder');
    try {
      await builder.buildToolIndex({
        agentsRoot: AGENTS, appName: APP, embedder: fakeEmbedder, embeddingCache: new Map(),
        config: { embeddingDimensions: DIMS, maxAlwaysInclude: 0 }, logger: { info: () => {} },
      });
    } catch (e) { threw = /alwaysInclude/.test(e.message); }
    check('build fails when alwaysInclude budget is exceeded', () => assert.ok(threw));
  })();

  console.log('\n--- toolRetriever ---');
  const retriever = new ToolRetriever({ embedder: fakeEmbedder, logger: { warn: () => {} } });
  const cfg = { topK: 4, minK: 2, serverCoInclusion: 0, bypassBelowToolCount: 3, scoreFloor: 0 };

  const traces = [];
  const r1 = await retriever.retrieve(index, 'how many blue widgets do we have in stock at DC07', {
    config: cfg, trace: { span: t => traces.push(t) },
  });
  check('shortlist respects topK', () => assert.ok(r1.tools.length <= 4, `got ${r1.tools.length}`));
  check('alwaysInclude tool is always present', () => {
    const lk = r1.tools.find(t => t.name === 'lookup_sku');
    assert.ok(lk, 'lookup_sku missing');
    assert.strictEqual(lk.reason, 'always_include');
  });
  check('stock query retrieves get_stock_level', () => {
    assert.ok(r1.tools.some(t => t.name === 'get_stock_level'), r1.tools.map(t => t.name).join(','));
  });
  check('trace span emitted with candidates and attributes', () => {
    assert.strictEqual(traces.length, 1);
    assert.strictEqual(traces[0].phase, 'tool_retrieval');
    assert.strictEqual(traces[0].attributes.catalogSize, 7);
    assert.ok(traces[0].candidates.length === r1.tools.length);
    assert.ok('lexicalRank' in traces[0].candidates[0]);
  });

  const r2 = await retriever.retrieve(index, 'when are we going to run out of SKU 88213', { config: cfg });
  check('forecast query retrieves get_replenishment_plan', () => {
    assert.ok(r2.tools.some(t => t.name === 'get_replenishment_plan'), r2.tools.map(t => t.name).join(','));
  });

  const r3 = await retriever.retrieve(index, 'move 200 units from DC07 to DC02', { config: cfg });
  check('transfer query retrieves transfer_stock', () => {
    assert.ok(r3.tools.some(t => t.name === 'transfer_stock'), r3.tools.map(t => t.name).join(','));
  });
  check('destructive tools are not suppressed', () => {
    assert.strictEqual(r3.tools.find(t => t.name === 'transfer_stock').destructive, true);
  });

  console.log('\n--- policy paths ---');
  const rSmall = await retriever.retrieve(index, 'anything', { config: { ...cfg, bypassBelowToolCount: 25 } });
  check('small catalog bypasses retrieval entirely', () => {
    assert.strictEqual(rSmall.meta.mode, 'bypass_small_catalog');
    assert.strictEqual(rSmall.tools.length, 7);
  });

  const rOff = await retriever.retrieve(index, 'anything', { config: { ...cfg, strategy: 'none' } });
  check('strategy=none returns full catalog (A/B control)', () => assert.strictEqual(rOff.meta.mode, 'disabled'));

  const rLex = await retriever.retrieve(index, 'backorders', { config: { ...cfg, strategy: 'lexical' } });
  check('lexical-only mode works without embeddings', () => {
    assert.deepStrictEqual(rLex.meta.scorers, ['lexical']);
    assert.ok(rLex.tools.some(t => t.name === 'list_backorders'));
  });

  const rExp = await retriever.retrieve(index, 'stock', { config: { ...cfg, topK: 2 }, expand: true });
  check('expand fallback widens the shortlist', () => {
    assert.strictEqual(rExp.meta.mode, 'expanded');
    assert.ok(rExp.tools.length > 2, `got ${rExp.tools.length}`);
  });

  const rCo = await retriever.retrieve(index, 'reserve units for an order', { config: { ...cfg, topK: 6, serverCoInclusion: 2 } });
  check('server co-inclusion adds siblings', () => {
    assert.ok(rCo.tools.some(t => t.reason === 'server_co_inclusion'), rCo.tools.map(t => t.reason).join(','));
  });

  console.log('\n--- semantic query cache ---');
  const cr = new ToolRetriever({ embedder: fakeEmbedder, logger: { warn: () => {} } });
  const q = 'how many units of SKU 88213 are left in DC07';
  const a3 = await cr.retrieve(index, q, { config: { ...cfg, topK: 3, serverCoInclusion: 0 } });
  const a5 = await cr.retrieve(index, q, { config: { ...cfg, topK: 5, serverCoInclusion: 0 } });
  check('cache does not leak a shortlist across different topK', () => {
    assert.strictEqual(a3.tools.length, 3);
    assert.strictEqual(a5.tools.length, 5, `got ${a5.tools.length} -- stale cache hit from topK=3`);
  });
  const a3b = await cr.retrieve(index, q, { config: { ...cfg, topK: 3, serverCoInclusion: 0 } });
  check('identical query + config does hit the cache', () => assert.strictEqual(a3b.meta.mode, 'semantic_cache_hit'));
  check('cache does not leak across index versions', async () => {
    const bumped = { ...index, version: index.version + 'x' };
    const other = cr._cacheLookup(`${APP}::${bumped.version}::hybrid:3:2:0:0:4`, new Float32Array(DIMS), 0.95);
    assert.strictEqual(other, null);
  });
  cr.invalidate(APP);
  const a3c = await cr.retrieve(index, q, { config: { ...cfg, topK: 3, serverCoInclusion: 0 } });
  check('invalidate() clears every bucket for the app', () => assert.notStrictEqual(a3c.meta.mode, 'semantic_cache_hit'));

  console.log('\n--- degradation ---');
  const brokenRetriever = new ToolRetriever({
    embedder: { embed: async () => { throw new Error('gateway down'); } },
    logger: { warn: () => {} },
  });
  const rDeg = await brokenRetriever.retrieve(index, 'how much stock is on hand', { config: cfg });
  check('embedding failure degrades to lexical instead of throwing', () => {
    assert.deepStrictEqual(rDeg.meta.scorers, ['lexical']);
    assert.ok(rDeg.tools.length > 0);
  });

  console.log('\n--- recall signal ---');
  const calls = [];
  const rr = new ToolRetriever({ embedder: fakeEmbedder, metrics: { retrievalRecall: { inc: l => calls.push(l) } }, logger: { warn: () => {} } });
  rr.recordRecall(APP, ['a.b', 'a.c'], ['a.b']);
  rr.recordRecall(APP, ['a.b'], ['a.z']);
  check('recall metric records covered and uncovered', () => {
    assert.strictEqual(calls[0].covered, 'true');
    assert.strictEqual(calls[1].covered, 'false');
  });

  console.log('\n--- registry ---');
  const { ToolIndexRegistry, LruMap } = require('../lib/toolIndexRegistry');
  let builds = 0;
  const reg = new ToolIndexRegistry({
    agentsRoot: AGENTS,
    embedder: { embedBatch: async (t) => { builds++; return fakeEmbedder.embedBatch(t); } },
    getAppConfig: async () => ({ toolRetrieval: { embeddingDimensions: DIMS } }),
    listToolsCached: () => null,
    logger: { info: () => {} },
  });
  const [i1, i2, i3] = await Promise.all([reg.get(APP), reg.get(APP), reg.get(APP)]);
  check('single-flight: 3 concurrent gets build once', () => {
    assert.strictEqual(i1, i2); assert.strictEqual(i2, i3);
    assert.strictEqual(builds, 1, `embedBatch called ${builds} times`);
  });

  const lru = new LruMap(2);
  lru.set('a', 1); lru.set('b', 2); lru.get('a'); lru.set('c', 3);
  check('LRU evicts least recently used', () => {
    assert.ok(lru.has('a') && lru.has('c') && !lru.has('b'));
  });

  console.log('\n--- reconcile ---');
  const { reconcile } = require('../lib/toolIndexBuilder');
  const drift = reconcile(index, () => ([{ name: 'get_stock_level' }, { name: 'brand_new_tool' }]), { logger: {} });
  check('detects tool present in MCP but missing from SKILL.md', () => {
    assert.ok(drift.missingFromSkill.includes('inventory-mgmt-mcp-server.brand_new_tool'));
  });
  check('detects orphan declared in SKILL.md', () => {
    assert.ok(drift.orphanInSkill.includes('inventory-mgmt-mcp-server.transfer_stock'));
  });

  console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED'}\n`);
  process.exit(failures ? 1 : 0);
})();