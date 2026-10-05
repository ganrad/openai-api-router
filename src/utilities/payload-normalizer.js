/**
 * AOAI → OpenAI Chat Completions normalizer with config-driven transforms.
 * - Transform order: excludeAttributes → replaceAttributes → includeAttributes
 * - replaceAttributes supports optional 'value': if present, assigns that value
 *   to the destination path; otherwise moves source value.
 * - Streaming: reads SSE lines from Express req, writes normalized SSE to res.
 */

const readline = require('readline');
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger.js');

/* ------------------------------- Path utils -------------------------------- */

function parsePath(pathStr) {
  // Supports dot/bracket and wildcards: a.b[0].c, choices[*].delta.annotations
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
  return findMatches(v, ['_root', ...segments]).map(m => ({
    parent: m.parent, key: m.key, value: m.value, matchedIndices: m.matchedIndices
  }));
}

function deletePath(obj, pathStr) {
  const matches = resolveMatches(obj, pathStr);
  // Delete deepest indices first to avoid array index shifts
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
  if (segments.includes('*')) {
    throw new Error(`setPath does not support wildcards: ${pathStr}`);
  }
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

function stringifyPath(segments) {
  return segments.map((seg, i) => (typeof seg === 'number' ? `[${seg}]` : i === 0 ? `${seg}` : `.${seg}`)).join('');
}

/**
 * Replace (move/rename) fromPath → toPath, supporting mirrored '*' positions.
 * If overrideValueProvided === true, uses overrideValue for destination instead of source value.
 */
function replacePath(obj, fromPathStr, toPathStr, overrideValueProvided, overrideValue) {
  const fromMatches = resolveMatches(obj, fromPathStr);
  const toSegments = parsePath(toPathStr);

  for (const match of fromMatches) {
    const { value, parent, key, matchedIndices } = match;

    // Build concrete destination path by substituting '*' tokens with matched indices/keys
    const toSegsConcrete = [];
    let wildcardIdx = 0;
    for (const seg of toSegments) {
      if (seg === '*') {
        toSegsConcrete.push(matchedIndices[wildcardIdx++]);
      } else {
        toSegsConcrete.push(seg);
      }
    }

    const destPath = stringifyPath(toSegsConcrete);
    const destVal = overrideValueProvided ? overrideValue : value;

    // Set at destination
    setPath(obj, destPath, destVal);

    // Delete source
    if (parent && key !== undefined && key !== null) {
      if (Array.isArray(parent) && typeof key === 'number') parent.splice(key, 1);
      else delete parent[key];
    }
  }

  // If no matches found and an override value is provided, we intentionally do NOT create
  // destination paths out of thin air because there is no index/key mapping from fromPath.
  // If you need forced creation, add a separate includeAttributes rule for the destination.
}

/* ------------------------- Baseline normalization --------------------------- */

function deepClone(x) { return JSON.parse(JSON.stringify(x)); }

/**
 * Batch: normalize to OpenAI chat completion shape
 * - Ensure object = 'chat.completion' if missing
 * - Flatten AOAI content arrays in message.content to a single string
 */
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

/**
 * Streaming chunk: normalize to OpenAI chat.completion.chunk shape
 * - Set object = 'chat.completion.chunk'
 * - Flatten AOAI content arrays in delta.content to a single string
 */
function baselineNormalizeChunk(azureChunk) {
  const out = deepClone(azureChunk);
  out.object = 'chat.completion.chunk';
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

/* ----------------------- Config-driven transforms --------------------------- */

/**
 * Apply transforms in the required order:
 * 1) excludeAttributes
 * 2) replaceAttributes (supports optional 'value')
 * 3) includeAttributes
 */
function applyConfigTransformsInOrder(obj, config) {
  const deleteAttributes = config.excludeAttributes ?? [];
  const replaceAttributes = config.replaceAttributes ?? [];
  const includeAttributes = config.includeAttributes ?? [];

  // 1) Delete
  for (const del of deleteAttributes) {
    if (!del || !del.attributeName) continue;
    try { deletePath(obj, del.attributeName); } catch {}
  }

  // 2) Replace / move with optional override value
  for (const rep of replaceAttributes) {
    if (!rep || !rep.fromAttributeName || !rep.toAttributeName) continue;
    const overrideProvided = Object.prototype.hasOwnProperty.call(rep, 'value');
    const overrideValue = rep.value;
    try {
      replacePath(obj, rep.fromAttributeName, rep.toAttributeName, overrideProvided, overrideValue);
    } catch {}
  }

  // 3) Include / set (no wildcard)
  for (const inc of includeAttributes) {
    if (!inc || !inc.attributeName) continue;
    try { setPath(obj, inc.attributeName, inc.attributeValue); } catch {}
  }

  return obj;
}

/* ------------------------------ Public API --------------------------------- */

/**
 * Apply transforms to the complete AOAI response (batch)
 * @param {object} config
 * @param {object} inputObject - Azure (or AOAI-like) full JSON response
 * @returns {object} transformed object
 */
function processBatch(reqid, config, inputObject) {
  if ( !config )
    return inputObject;

  logger.log({ level: "debug", message: "[%s] processBatch():\n  Request ID: %s\n  Configuration:\n%s\n  Input:\n%s", splat: [scriptName, reqid, JSON.stringify(config, null, 2), JSON.stringify(inputObject, null, 2)] });
  
  return applyConfigTransformsInOrder(baselineNormalizeBatch(inputObject), config);
}

/**
 * Apply transforms to a chunk of data sent over SSE.
 * @param {object} config normalization config.
 * @param {object} chunkObj input chunk object
 * @returns {object} transformed object 
 */
function processStream(config, chunkObj) {
  if ( !config )
    return chunkObj;

  return applyConfigTransformsInOrder(baselineNormalizeChunk(chunkObj), config);
}

/**
 * Streaming path (Express):
 * Reads SSE lines from req and writes normalized SSE to res.
 * @param {object} config
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
async function processStreaming(config, req, res) {
  // Ensure SSE headers (ok to overwrite; callers can set beforehand too)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  // If Express compression is enabled globally, SSE might buffer; recommended to disable per-route.

  const rl = readline.createInterface({ input: req, crlfDelay: Infinity });

  try {
    for await (const rawLine of rl) {
      const line = rawLine; // keep as-is for pass-through of non-data lines
      const trimmed = line.trim();

      // Blank line separates SSE events
      if (trimmed === '') {
        res.write('\n');
        continue;
      }

      // Pass through other SSE fields unchanged (e.g., event:, id:)
      if (!trimmed.startsWith('data:')) {
        res.write(line + '\n');
        continue;
      }

      const payloadStr = line.slice(line.indexOf('data:') + 5).trim();
      if (payloadStr === '[DONE]') {
        res.write('data: [DONE]\n\n');
        // Client typically closes after [DONE]; keep open if upstream continues
        continue;
      }

      // Parse + normalize + transform
      let chunkObj;
      try {
        chunkObj = JSON.parse(payloadStr);
      } catch {
        // In case of non-JSON data payload, pass through
        res.write(line + '\n');
        continue;
      }

      let normalizedChunk = config.normalizeOutput ? baselineNormalizeChunk(chunkObj) : deepClone(chunkObj);
      normalizedChunk = applyConfigTransformsInOrder(normalizedChunk, config);

      res.write(`data: ${JSON.stringify(normalizedChunk)}\n\n`);
      // Flush if your runtime/buffer requires it; e.g., res.flush() when using compression middleware disabled.
    }
  } finally {
    // Do not end() automatically; let caller control lifecycle if piping from upstream.
    // If you want to end after upstream closes:
    // res.end();
  }
}

module.exports = {
  processBatch,
  processStream
  // processStreaming,
  // Export in case you want lower-level composition/testing:
  // baselineNormalizeBatch,
  // baselineNormalizeChunk,
  // applyConfigTransformsInOrder
};