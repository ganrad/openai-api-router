// server.js - production-ready caching gateway (L1 LRU -> L2 Qdrant -> L3 Postgres) with Prometheus metrics
import express from "express";
import fetch from "node-fetch";
const LRU = require('lru-cache');
const crypto = require('node:crypto');
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

// ---------------------- Config ----------------------
const PORT = process.env.PORT || 3000;
const EMBED_DIM = parseInt(process.env.EMBED_DIM || "1536", 10);
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS || String(60 * 60 * 1000), 10);
const L1_SIZE = parseInt(process.env.L1_SIZE || "10", 10);

const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || "";

const PG_CONN_STRING = process.env.PG_CONN_STRING || "postgresql://app:pass@localhost:5432/app";

// Command to generate CACHE_AES_KEY_BASE64:node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
const CACHE_AES_KEY_BASE64 = process.env.CACHE_AES_KEY_BASE64;
if (!CACHE_AES_KEY_BASE64) {
  console.error("Please set CACHE_AES_KEY_BASE64 env var (base64 32 bytes)");
  process.exit(1);
}
const AES_KEY = Buffer.from(CACHE_AES_KEY_BASE64, "base64");
if (AES_KEY.length !== 32) {
  console.error("CACHE_AES_KEY_BASE64 must decode to 32 bytes (256-bit key)");
  process.exit(1);
}

// ---------------------- DB Pools ----------------------
const pgPool = new Pool({ connectionString: PG_CONN_STRING });

// ---------------------- Encryption Helpers ----------------------
function encryptPayload(obj) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", AES_KEY, iv);
  let encrypted = cipher.update(JSON.stringify(obj), "utf8", "base64");
  encrypted += cipher.final("base64");
  return { data: encrypted, iv: iv.toString("base64") }; // store both
}

function decryptPayload(encryptedObj) {
  const iv = Buffer.from(encryptedObj.iv, "base64");
  const decipher = crypto.createDecipheriv("aes-256-cbc", AES_KEY, iv);
  let dec = decipher.update(encryptedObj.data, "base64", "utf8");
  dec += decipher.final("utf8");
  return JSON.parse(dec);
}

// ---------------------- Metrics ----------------------
const metrics = {
  l1Hits: 0,
  l1Misses: 0,
  l2Hits: 0,
  l2Misses: 0,
  pgHits: 0,
  latencies: { l1: [], l2: [], pg: [] },
};

function recordLatency(layer, start) {
  const d = Date.now() - start;
  metrics.latencies[layer].push(d);
}

function getMetricsObj() {
  const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : 0);
  const l1Total = metrics.l1Hits + metrics.l1Misses;
  const l2Total = metrics.l2Hits + metrics.l2Misses;
  return {
    hitRates: {
      l1: l1Total ? metrics.l1Hits / l1Total : 0,
      l2: l2Total ? metrics.l2Hits / l2Total : 0,
    },
    avgLatency: {
      l1: avg(metrics.latencies.l1),
      l2: avg(metrics.latencies.l2),
      pg: avg(metrics.latencies.pg),
    },
    counts: {
      l1Hits: metrics.l1Hits,
      l1Misses: metrics.l1Misses,
      l2Hits: metrics.l2Hits,
      l2Misses: metrics.l2Misses,
      pgHits: metrics.pgHits,
    },
  };
}

// ---------------------- L1 Cache (LRU) ----------------------
const l1Cache = new LRU({
  max: L1_SIZE,
  ttl: CACHE_TTL_MS,
});

// ---------------------- Utilities ----------------------
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function makeKeyFromPrompt(prompt) {
  return crypto.createHash("sha1").update(prompt).digest("hex");
}

// ---------------------- L1 Search ----------------------
async function searchL1(embedding, scoreThreshold = 0.9) {
  const start = Date.now();
  let best = null, bestScore = -Infinity;
  for (const [, encrypted] of l1Cache.entries()) {
    try {
      const entry = decryptPayload(encrypted);
      const score = cosineSimilarity(embedding, entry.embedding);
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    } catch (err) {
      // ignore malformed entries
      console.warn("L1 decrypt error:", err.message);
    }
  }
  recordLatency("l1", start);
  if (best && bestScore >= scoreThreshold) {
    metrics.l1Hits++;
    return { entry: best, score: bestScore };
  } else {
    metrics.l1Misses++;
    return null;
  }
}

// ---------------------- L2 (Qdrant) Search and Insert ----------------------
async function searchL2(embedding, scoreThreshold = 0.9) {
  const start = Date.now();
  const cutoff = Date.now() - CACHE_TTL_MS;
  const url = `${QDRANT_URL}/collections/cache/points/search`;
  const body = {
    vector: embedding,
    limit: 1,
    score_threshold: scoreThreshold,
    filter: { must: [{ key: "ts", range: { gte: cutoff } }] },
  };

  const headers = { "Content-Type": "application/json" };
  if (QDRANT_API_KEY) headers["api-key"] = QDRANT_API_KEY;

  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!resp.ok) {
    // do not throw; treat as miss
    console.warn("Qdrant search error:", resp.status, await resp.text().catch(() => ""));
    recordLatency("l2", start);
    metrics.l2Misses++;
    return null;
  }
  const data = await resp.json();
  recordLatency("l2", start);

  if (data.result && data.result.length > 0) {
    const payload = data.result[0].payload;
    if (payload && payload.encrypted) {
      try {
        const decrypted = decryptPayload(payload.encrypted);
        metrics.l2Hits++;
        return { entry: decrypted, score: data.result[0].score || null };
      } catch (err) {
        console.warn("Qdrant payload decrypt error:", err.message);
      }
    }
  }
  metrics.l2Misses++;
  return null;
}

async function addToL2(entry) {
  // entry: { key, prompt, response, embedding, meta? }
  const encrypted = encryptPayload(entry);
  const point = {
    id: entry.key || crypto.randomUUID(),
    vector: entry.embedding,
    payload: {
      encrypted,
      ts: Date.now(),
    },
  };

  const url = `${QDRANT_URL}/collections/cache/points?wait=true`;
  const headers = { "Content-Type": "application/json" };
  if (QDRANT_API_KEY) headers["api-key"] = QDRANT_API_KEY;
  const resp = await fetch(url, { method: "PUT", headers, body: JSON.stringify({ points: [point] }) });
  if (!resp.ok) {
    console.warn("Qdrant add error:", resp.status, await resp.text().catch(() => ""));
  }
}

// Periodic cleanup job to delete expired points
async function cleanupExpiredQdrantEntries() {
  const cutoff = Date.now() - CACHE_TTL_MS;
  try {
    const url = `${QDRANT_URL}/collections/cache/points/delete`;
    const headers = { "Content-Type": "application/json" };
    if (QDRANT_API_KEY) headers["api-key"] = QDRANT_API_KEY;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        filter: { must: [{ key: "ts", range: { lt: cutoff } }] },
      }),
    });
    if (!resp.ok) {
      console.warn("Qdrant cleanup failed:", resp.status, await resp.text().catch(() => ""));
    } else {
      console.debug("Qdrant cleanup OK");
    }
  } catch (err) {
    console.error("cleanup error:", err);
  }
}
// Run cleanup every 10 minutes
setInterval(cleanupExpiredQdrantEntries, 10 * 60 * 1000);

// ---------------------- L3 Postgres search/insert ----------------------
async function searchPostgres(embedding, limit = 1, distanceThreshold = 0.1) {
  const start = Date.now();
  const client = await pgPool.connect();
  try {
    // Use pgvector's operator. Adjust operator/distance per your index/distance metric.
    const res = await client.query(
      `SELECT id, prompt, response, embedding
FROM cache_entries
ORDER BY embedding <-> $1
LIMIT $2`,
      [embedding, limit]
    );
    recordLatency("pg", start);
    if (res.rows && res.rows.length) {
      metrics.pgHits++;
      // Calculate similarity externally if necessary. Here return best row.
      const row = res.rows[0];
      return { prompt: row.prompt, response: row.response, embedding: row.embedding };
    }
    return null;
  } catch (err) {
    recordLatency("pg", start);
    console.error("pg search error:", err);
    return null;
  } finally {
    client.release();
  }
}

async function addToPostgres(entry) {
  const client = await pgPool.connect();
  try {
    await client.query(
      `INSERT INTO cache_entries (id, prompt, response, embedding)
VALUES ($1, $2, $3, $4)
ON CONFLICT DO NOTHING`,
      [entry.key || crypto.randomUUID(), entry.prompt, entry.response, entry.embedding]
    );
  } catch (err) {
    console.error("pg insert error:", err);
  } finally {
    client.release();
  }
}

// ---------------------- Main Middleware ----------------------
async function cacheMiddleware(req, res, next) {
  try {
    // Expect: body contains { prompt, embedding } - embedding is numeric array
    const { prompt, embedding } = req.body;
    if (!embedding || !Array.isArray(embedding) || embedding.length !== EMBED_DIM) {
      return res.status(400).json({ error: `Invalid embedding - must be array length ${EMBED_DIM}` });
    }

    const key = makeKeyFromPrompt(prompt);

    // L1
    const l1Start = Date.now();
    const l1Hit = await searchL1(embedding);
    // searchL1 recorded latency and metrics
    if (l1Hit) {
      return res.json({ source: "L1", response: l1Hit.entry.response, score: l1Hit.score });
    }

    // L2
    const l2Hit = await searchL2(embedding);
    if (l2Hit) {
      // store in L1
      l1Cache.set(key, encryptPayload(l2Hit.entry));
      return res.json({ source: "L2", response: l2Hit.entry.response, score: l2Hit.score });
    }

    // L3 (Postgres)
    const pgResult = await searchPostgres(embedding);
    if (pgResult) {
      // add to L2 and L1 in background (no await to reduce latency)
      const entry = { key, prompt: pgResult.prompt, response: pgResult.response, embedding: pgResult.embedding };
      l1Cache.set(key, encryptPayload(entry));
      addToL2(entry).catch((e) => console.warn("addToL2 failed:", e));
      return res.json({ source: "Postgres", response: pgResult.response });
    }

    // Cache miss completely — pass to next handler (e.g., model generation)
    // attach a helper to the request so the downstream handler can call cacheInsert
    req.cacheInsert = async function (modelResponse, modelEmbedding) {
      // modelEmbedding is the embedding used; if not provided, use `embedding`
      const emb = modelEmbedding || embedding;
      const entry = { key, prompt, response: modelResponse, embedding: emb };

      // Insert into L1 & L2 & Postgres (best-effort)
      try {
        l1Cache.set(key, encryptPayload(entry));
        await addToL2(entry);
        await addToPostgres(entry);
      } catch (err) {
        console.warn("cacheInsert error:", err);
      }
    };

    next();
  } catch (err) {
    console.error("cache middleware unexpected error:", err);
    next(err);
  }
}

// ---------------------- Express app ----------------------
const app = express();
app.use(express.json({ limit: "10mb" }));

// Chat endpoint uses cacheMiddleware
// Downstream handler must create embedding and/or call model if middleware falls through
app.post("/chat", cacheMiddleware, async (req, res) => {
  try {
    // Example downstream: create model response
    // Expect req.body.prompt exists
    const { prompt } = req.body;

    // 1) compute embedding for prompt (you must implement computeEmbedding)
    const embedding = await computeEmbedding(prompt); // implement this to call your embedding API

    // NOTE: in this flow, middleware earlier used an embedding from the client.
    // If your system computes in-server, you can change logic:
    // - Either compute embedding earlier and send to middleware
    // - Or compute it here and then call cache logic directly.

    // 2) call your model to generate response (implement callModel)
    const modelResponse = await callModel(prompt);

    // 3) Insert to cache (middleware provided helper)
    if (typeof req.cacheInsert === "function") {
      await req.cacheInsert(modelResponse, embedding);
    }

    res.json({ source: "Model", response: modelResponse });
  } catch (err) {
    console.error("/chat handler error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// Prometheus metrics endpoint
app.get("/metrics", (req, res) => {
  const m = getMetricsObj();
  const text = `
# HELP cache_hit_rate_l1 L1 cache hit rate
# TYPE cache_hit_rate_l1 gauge
cache_hit_rate_l1 ${m.hitRates.l1}

# HELP cache_hit_rate_l2 L2 cache hit rate
# TYPE cache_hit_rate_l2 gauge
cache_hit_rate_l2 ${m.hitRates.l2}

# HELP cache_latency_l1_ms Average latency (ms) for L1 cache
# TYPE cache_latency_l1_ms gauge
cache_latency_l1_ms ${m.avgLatency.l1}

# HELP cache_latency_l2_ms Average latency (ms) for L2 cache
# TYPE cache_latency_l2_ms gauge
cache_latency_l2_ms ${m.avgLatency.l2}

# HELP cache_latency_pg_ms Average latency (ms) for Postgres
# TYPE cache_latency_pg_ms gauge
cache_latency_pg_ms ${m.avgLatency.pg}
`;
  res.set("Content-Type", "text/plain");
  res.send(text.trim());
});

// Health
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Helper placeholder implementations — replace with real calls
async function computeEmbedding(prompt) {
  // TODO: call your embedding provider and return float[] of length EMBED_DIM
  // For now throw to ensure developer implements it.
  throw new Error("computeEmbedding() not implemented. Replace with your embedding call.");
}

async function callModel(prompt) {
  // TODO: call your LLM model and return text response
  throw new Error("callModel() not implemented. Replace with your model call.");
}

// Start
app.listen(PORT, () => {
  console.log(`Cache gateway listening at http://0.0.0.0:${PORT}`);
});