#!/usr/bin/env node
/**
 * Normalizes Azure OpenAI Chat Completions responses to OpenAI-compatible shape,
 * with config-driven transforms (include/exclude/replace) for both:
 *  - Batch (full JSON) mode
 *  - Streaming (SSE) mode
 *
 * Usage:
 *   Batch:
 *     node normalize-aoai.js --config ./config.json < azure.json > openai.json
 *
 *   Streaming (SSE in → SSE out):
 *     curl -s -N "https://{aoai}/.../chat/completions?api-version=..." \
 *       -H "api-key: $KEY" -H "content-type: application/json" \
 *       -d '{"messages":[{"role":"user","content":"hi"}], "stream": true}' \
 *     | node normalize-aoai.js --config ./config.json --stream
 */

const fs = require('fs');
const readline = require('readline');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { stream: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--config' && args[i + 1]) {
      out.config = args[i + 1];
      i++;
    } else if (a === '--stream') {
      out.stream = true;
    }
  }
  if (!out.config) {
    console.error('Error: --config <path> is required.');
    process.exit(1);
  }
  return out;
}

/** ----------------------------------------------------------------------------
 * Path helpers: dot/bracket paths, with support for [*] wildcard in get/delete/replace
 * ----------------------------------------------------------------------------*/
function parsePath(pathStr) {
  const parts = [];
  const re = /([^[.\]]+)|\[(\*|\d+)\]/g;
  let m;
  while ((m = re.exec(pathStr)) !== null) {
    if (m[1] !== undefined) parts.push(m[1]);
    else if (m[2] !== undefined) parts.push(m[2] === '*' ? '*' : Number(m[2]));
  }
  return parts;
}

function isObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function findMatches(root, segments, matchedIndices = []) {
  if (!segments.length) return [{ parent: null, key: null, value: root, matchedIndices }];
  const [seg, ...rest] = segments;
  const results = [];

  function recurse(parent, key, value, extraIndex) {
    const nextMatched = extraIndex !== undefined ? [...matchedIndices, extraIndex] : matchedIndices;
    if (rest.length === 0) {
      results.push({ parent, key, value, matchedIndices: nextMatched });
    } else {
      results.push(...findMatches(value, rest, nextMatched));
    }
  }

  if (Array.isArray(root)) {
    if (seg === '*') {
      for (let i = 0; i < root.length; i++) recurse(root, i, root[i], i);
    } else if (typeof seg === 'number' && root[seg] !== undefined) {
      recurse(root, seg, root[seg], seg);
    }
    return results;
  } else if (isObject(root)) {
    if (seg === '*') {
      for (const k of Object.keys(root)) recurse(root, k, root[k], k);
    } else {
      const val = root[seg];
      if (val !== undefined) recurse(root, seg, val, seg);
    }
    return results;
  }
  return [];
}

function resolveMatches(obj, pathStr) {
  const segments = parsePath(pathStr);
  const v = { _root: obj };
  return findMatches(v, ['_root', ...segments]).map(m => ({ parent: m.parent, key: m.key, value: m.value, matchedIndices: m.matchedIndices }));
}

function deletePath(obj, pathStr) {
  const matches = resolveMatches(obj, pathStr);
  // Delete deepest-first for arrays so indices don't shift early
  const sorted = matches.sort((a, b) => {
    const ak = typeof a.key === 'number' ? a.key : 0;
    const bk = typeof b.key === 'number' ? b.key : 0;
    return bk - ak;
  });
  for (const m of sorted) {
    if (m.parent && m.key !== null && m.key !== undefined) {
      if (Array.isArray(m.parent) && typeof m.key === 'number') {
        m.parent.splice(m.key, 1);
      } else {
        delete m.parent[m.key];
      }
    }
  }
}

function setPath(obj, pathStr, value) {
  const segments = parsePath(pathStr);
  if (segments.includes('*')) throw new Error(`setPath does not support wildcards: ${pathStr}`);
  let curr = obj;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const last = i === segments.length - 1;
    if (last) {
      curr[seg] = value;
      return;
    }
    const nextSeg = segments[i + 1];
    if (curr[seg] === undefined) curr[seg] = typeof nextSeg === 'number' ? [] : {};
    curr = curr[seg];
  }
}

function replacePath(obj, fromPathStr, toPathStr) {
  const fromMatches = resolveMatches(obj, fromPathStr);
  const toSegments = parsePath(toPathStr);
  for (const match of fromMatches) {
    const { value, parent, key, matchedIndices } = match;
    const toSegsConcrete = [];
    let wildcardIdx = 0;
    for (const seg of toSegments) {
      if (seg === '*') {
        toSegsConcrete.push(matchedIndices[wildcardIdx++]);
      } else {
        toSegsConcrete.push(seg);
      }
    }
    setPath(obj, stringifyPath(toSegsConcrete), value);
    if (parent && key !== undefined && key !== null) {
      if (Array.isArray(parent) && typeof key === 'number') parent.splice(key, 1);
      else delete parent[key];
    }
  }
}

function stringifyPath(segments) {
  return segments
    .map((seg, i) => (typeof seg === 'number' ? `[${seg}]` : i === 0 ? `${seg}` : `.${seg}`))
    .join('');
}

/** ----------------------------------------------------------------------------
 * Baseline AOAI → OpenAI normalization (batch & streaming chunk)
 * ----------------------------------------------------------------------------*/
function deepClone(x) { return JSON.parse(JSON.stringify(x)); }

function baselineNormalizeBatch(azure) {
  const out = deepClone(azure);
  if (!out.object) out.object = 'chat.completion';
  if (Array.isArray(out.choices)) {
    for (const ch of out.choices) {
      if (ch && ch.message) {
        const c = ch.message.content;
        if (Array.isArray(c)) {
          const text = c
            .filter(p => p && (p.type === 'text' || p.type === 'input_text'))
            .map(p => p.text || p.content || '')
            .join('');
          ch.message.content = text;
        }
      }
    }
  }
  return out;
}

function baselineNormalizeChunk(azureChunk) {
  // Ensure OpenAI-style chunk object name
  const out = deepClone(azureChunk);
  out.object = 'chat.completion.chunk';

  // Flatten delta.content arrays (Azure may stream structured content parts)
  if (Array.isArray(out.choices)) {
    for (const ch of out.choices) {
      if (ch && ch.delta) {
        const dc = ch.delta.content;
        if (Array.isArray(dc)) {
          const text = dc
            .filter(p => p && (p.type === 'text' || p.type === 'input_text'))
            .map(p => p.text || p.content || '')
            .join('');
          ch.delta.content = text;
        }
      }
    }
  }
  return out;
}

/** ----------------------------------------------------------------------------
 * Config-driven transforms
 * ----------------------------------------------------------------------------*/
function applyConfigTransforms(obj, config) {
  const { includeAttributes = [], excludeAttributes = [], replaceAttributes = [] } = config || {};

  // includeAttributes: set (no wildcard)
  for (const inc of includeAttributes) {
    if (!inc || !inc.attributeName) continue;
    try { setPath(obj, inc.attributeName, inc.attributeValue); } catch { }
  }
  // replaceAttributes: move/rename (supports mirrored '*')
  for (const rep of replaceAttributes) {
    if (!rep || !rep.fromAttributeName || !rep.toAttributeName) continue;
    try { replacePath(obj, rep.fromAttributeName, rep.toAttributeName); } catch { }
  }
  // excludeAttributes: delete (supports wildcards)
  for (const exc of excludeAttributes) {
    if (!exc || !exc.attributeName) continue;
    try { deletePath(obj, exc.attributeName); } catch { }
  }
  return obj;
}

/** ----------------------------------------------------------------------------
 * IO helpers
 * ----------------------------------------------------------------------------*/
function readAllStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', err => reject(err));
  });
}

async function processBatch(config) {
  const inputJson = await readAllStdin();
  let azure;
  try { azure = JSON.parse(inputJson); }
  catch (e) {
    console.error('Failed to parse input JSON from stdin:', e.message);
    process.exit(1);
  }
  const normalized = (config.normalizeOutput ? baselineNormalizeBatch(azure) : deepClone(azure));
  const transformed = applyConfigTransforms(normalized, config);
  process.stdout.write(JSON.stringify(transformed, null, 2) + '\n');
}

async function processStreaming(config) {
  // Process stdin as an SSE stream line-by-line.
  // We preserve non-"data:" lines (e.g., "event:", comments) and normalize JSON payloads after "data:".
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  for await (const rawLine of rl) {
    const line = rawLine; // keep original whitespace
    const trimmed = line.trim();

    // Pass through empty lines (SSE event delimiters)
    if (trimmed === '') {
      process.stdout.write('\n');
      continue;
    }

    // Pass through comments or other SSE fields verbatim
    if (!trimmed.startsWith('data:')) {
      process.stdout.write(line + '\n');
      continue;
    }

    // Handle "data:" payloads
    const payloadStr = line.slice(line.indexOf('data:') + 5).trim();
    if (payloadStr === '[DONE]') {
      process.stdout.write('data: [DONE]\n\n');
      continue;
    }

    // Parse JSON payload, normalize, transform, and write back as SSE
    let chunkObj;
    try {
      chunkObj = JSON.parse(payloadStr);
    } catch (e) {
      // If a provider ever sends multi-line JSON (rare), you could buffer until blank line.
      // For now, pass through unmodified on parse failure.
      process.stdout.write(line + '\n');
      continue;
    }

    let normalizedChunk = config.normalizeOutput ? baselineNormalizeChunk(chunkObj) : deepClone(chunkObj);
    normalizedChunk = applyConfigTransforms(normalizedChunk, config);

    process.stdout.write(`data: ${JSON.stringify(normalizedChunk)}\n\n`);
  }
}

/** ----------------------------------------------------------------------------
 * Main
 * ----------------------------------------------------------------------------*/
(async function main() {
  const { config: configPath, stream } = parseArgs();
  let config;
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(raw);
  } catch (e) {
    console.error(`Failed to read/parse config at ${configPath}:`, e.message);
    process.exit(1);
  }

  if (stream) await processStreaming(config);
  else await processBatch(config);
})().catch(err => {
  console.error(err);
  process.exit(1);
});