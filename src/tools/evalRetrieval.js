#!/usr/bin/env node
'use strict';
/**
 * Retrieval evaluation harness.
 *
 *   node tools/evalRetrieval.js ./agents supply-chain-fullfillment-agent [labels.json]
 *
 * With no labels file it bootstraps the eval set from the `examples:` fields in
 * SKILL.md -- each example is a query whose expected tool is the one that
 * declared it. This is circular (the exemplars are also indexed), so treat the
 * absolute numbers as a ceiling; its real value is catching REGRESSIONS when
 * descriptions change or tools are added. Replace with mined query logs when
 * you have them: [{ "query": "...", "expected": ["server.tool"] }]
 *
 * Reports recall@K and MRR, and sweeps K so you can pick topK per app.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadAppSkills } = require('../lib/skillLoader');
const { buildToolIndex } = require('../lib/toolIndexBuilder');
const { ToolRetriever } = require('../lib/toolRetriever');

async function buildLabels(agentsRoot, appName, labelsPath) {
  if (labelsPath && fs.existsSync(labelsPath)) {
    return JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
  }
  const skills = await loadAppSkills(agentsRoot, appName);
  const labels = [];
  for (const s of skills) {
    for (const t of s.tools) {
      for (const ex of t.examples) labels.push({ query: ex, expected: [`${s.server}.${t.name}`], bootstrapped: true });
    }
  }
  return labels;
}

async function main() {
  const [agentsRoot = './agents', appName, labelsPath] = process.argv.slice(2);
  if (!appName) { console.error('usage: evalRetrieval.js <agentsRoot> <appName> [labels.json]'); process.exit(2); }

  // Swap this for GatewayEmbedder in a real run; the hashing stub keeps CI offline.
  const DIMS = 256;
  const embedder = {
    async embedBatch(texts) {
      return texts.map(t => {
        const v = new Array(DIMS).fill(0);
        for (const tok of String(t).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
          let h = 0; for (const c of tok) h = (h * 31 + c.charCodeAt(0)) >>> 0;
          v[h % DIMS] += 1;
        }
        return v;
      });
    },
    async embed(t) { return (await this.embedBatch([t]))[0]; },
  };

  const index = await buildToolIndex({
    agentsRoot, appName, embedder, embeddingCache: new Map(),
    config: { embeddingDimensions: DIMS }, logger: { info: () => {} },
  });
  const labels = await buildLabels(agentsRoot, appName, labelsPath);
  const retriever = new ToolRetriever({ embedder, logger: { warn: () => {} } });

  console.log(`\napp: ${appName}   tools: ${index.entries.length}   queries: ${labels.length}`
    + `${labels[0]?.bootstrapped ? '   (bootstrapped from examples)' : ''}\n`);

  const Ks = [3, 5, 8, 10, 15, 20].filter(k => k <= index.entries.length);
  const rows = [];

  for (const K of Ks) {
    let hits = 0, mrrSum = 0, sizeSum = 0;
    const misses = [];
    for (const label of labels) {
      const r = await retriever.retrieve(index, label.query, {
        config: { topK: K, minK: Math.min(3, K), bypassBelowToolCount: 0, serverCoInclusion: 0, scoreFloor: 0 },
      });
      const ids = r.tools.map(t => t.id);
      sizeSum += ids.length;
      const covered = label.expected.every(e => ids.includes(e));
      if (covered) hits++; else misses.push(label);
      const rank = ids.indexOf(label.expected[0]);
      if (rank >= 0) mrrSum += 1 / (rank + 1);
    }
    rows.push({
      K,
      recall: (hits / labels.length),
      mrr: (mrrSum / labels.length),
      avgSize: (sizeSum / labels.length),
      misses,
    });
  }

  console.log('   K   recall@K     MRR   avg shortlist');
  console.log('  ---  --------   -----   -------------');
  for (const r of rows) {
    console.log(`  ${String(r.K).padStart(3)}    ${(r.recall * 100).toFixed(1).padStart(5)}%   ${r.mrr.toFixed(3)}   ${r.avgSize.toFixed(1).padStart(13)}`);
  }

  // Smallest K that clears the recall bar -- this is the number to put in the app config.
  const TARGET = 0.95;
  const best = rows.find(r => r.recall >= TARGET);
  console.log(best
    ? `\nrecommended topK for ${appName}: ${best.K}  (recall ${(best.recall * 100).toFixed(1)}% >= ${TARGET * 100}%)`
    : `\nno K reaches ${TARGET * 100}% recall -- improve descriptions/aliases before raising topK`);

  const worst = rows[rows.length - 1];
  if (worst.misses.length) {
    console.log(`\nstill missed at K=${worst.K}:`);
    for (const m of worst.misses.slice(0, 10)) console.log(`  "${m.query}"  ->  ${m.expected.join(', ')}`);
  }

  // CI gate: fail if recall at the configured K regresses below threshold.
  const gateK = Number(process.env.EVAL_GATE_K || 10);
  const gate = rows.find(r => r.K === gateK);
  if (gate && gate.recall < Number(process.env.EVAL_GATE_RECALL || 0.9)) {
    console.error(`\nFAIL: recall@${gateK} = ${(gate.recall * 100).toFixed(1)}%`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });