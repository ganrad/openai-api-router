/**
 * Name: Payload Normalizer Engine (Module)
 * 
 * Description:
 * Chat Completions normalizer with config-driven transforms.
 * Order: deleteAttributes → replaceAttributes → includeAttributes
 * - replaceAttributes supports optional 'value' (if present, assign that to destination)
 * - includeAttributes supports:
 *   - op: 'set' (default), 'merge', 'append', 'insert', 'upsert'
 *   - broadcast: true (apply include op to each wildcard match in attributeName)
 *   - arrayMerge: 'replace' | 'concat' for merge behavior on arrays (default: 'replace')
 *   - insert: requires index
 *   - upsert: requires match { key, value }, and mode 'merge' | 'replace'
 * Batch: processBatch(config, inputObject) → object
 * Stream: processStreaming(config, req, res)  // reads SSE from req, writes SSE to res
 * 
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 11-06-2025
 * Version (Introduced): 2.9.0
 *
 * Notes:
 */

const readline = require('readline');
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger.js');
const { NormalizerPolicyOperator } = require("./app-gtwy-constants.js"); 

/* ------------------------------- Path utils -------------------------------- */

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
  return findMatches(v, ['_root', ...segments]).map(m => ({
    parent: m.parent, key: m.key, value: m.value, matchedIndices: m.matchedIndices
  }));
}

function deletePath(obj, pathStr) {
  const matches = resolveMatches(obj, pathStr);
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

function getPath(obj, pathStr) {
  const segments = parsePath(pathStr);
  if (segments.includes('*')) throw new Error(`getPath does not support wildcards: ${pathStr}`);
  let curr = obj;
  for (const seg of segments) {
    if (curr === undefined || curr === null) return undefined;
    curr = curr[seg];
  }
  return curr;
}

function ensurePathObject(obj, pathStr) {
  const segments = parsePath(pathStr);
  if (segments.includes('*')) throw new Error(`ensurePathObject does not support wildcards: ${pathStr}`);
  let curr = obj;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const last = i === segments.length - 1;
    if (last) {
      if (curr[seg] === undefined) curr[seg] = {};
      else if (!isObject(curr[seg])) curr[seg] = {};
      return curr[seg];
    }
    const nextSeg = segments[i + 1];
    if (curr[seg] === undefined) curr[seg] = typeof nextSeg === 'number' ? [] : {};
    curr = curr[seg];
  }
}

function ensurePathArray(obj, pathStr) {
  const segments = parsePath(pathStr);
  if (segments.includes('*')) throw new Error(`ensurePathArray does not support wildcards: ${pathStr}`);
  let curr = obj;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const last = i === segments.length - 1;
    if (last) {
      if (!Array.isArray(curr[seg])) curr[seg] = [];
      return curr[seg];
    }
    const nextSeg = segments[i + 1];
    if (curr[seg] === undefined) curr[seg] = typeof nextSeg === 'number' ? [] : {};
    curr = curr[seg];
  }
}

function stringifyPath(segments) {
  return segments.map((seg, i) => (typeof seg === 'number' ? `[${seg}]` : i === 0 ? `${seg}` : `.${seg}`)).join('');
}

function replacePath(obj, fromPathStr, toPathStr, overrideValueProvided, overrideValue) {
  const fromMatches = resolveMatches(obj, fromPathStr);
  const toSegments = parsePath(toPathStr);

  for (const match of fromMatches) {
    const { value, parent, key, matchedIndices } = match;

    const toSegsConcrete = [];
    let wildcardIdx = 0;
    for (const seg of toSegments) {
      if (seg === '*') toSegsConcrete.push(matchedIndices[wildcardIdx++]);
      else toSegsConcrete.push(seg);
    }

    const destPath = stringifyPath(toSegsConcrete);
    const destVal = overrideValueProvided ? overrideValue : value;

    setPath(obj, destPath, destVal);

    if (parent && key !== undefined && key !== null) {
      if (Array.isArray(parent) && typeof key === 'number') parent.splice(key, 1);
      else delete parent[key];
    }
  }
}

/* ----------------------------- Deep merge utils ----------------------------- */

function deepClone(x) { return JSON.parse(JSON.stringify(x)); }

/**
 * Deep merge src into dst (mutates dst). Arrays are handled per arrayMerge:
 *  - 'replace': dstArray = deepClone(srcArray)
 *  - 'concat' : dstArray = dstArray.concat(deepClone(srcArray))
 */
function deepMerge(dst, src, arrayMerge = NormalizerPolicyOperator.Replace) {
  if (src === null || src === undefined) return dst;
  if (!isObject(src)) return deepClone(src); // scalar overwrite

  if (!isObject(dst)) dst = {};
  for (const [k, v] of Object.entries(src)) {
    if (Array.isArray(v)) {
      if (!Array.isArray(dst[k])) dst[k] = [];
      if (arrayMerge === NormalizerPolicyOperator.Concat) dst[k] = dst[k].concat(deepClone(v));
      else dst[k] = deepClone(v);
    } else if (isObject(v)) {
      dst[k] = deepMerge(isObject(dst[k]) ? dst[k] : {}, v, arrayMerge);
    } else {
      dst[k] = v;
    }
  }
  return dst;
}

/* ----------------------- Baseline normalization ----------------------------- */

/**
 * Batch: normalize to OpenAI chat completion shape
 */
function baselineNormalizeBatch(azure) {
  const out = deepClone(azure);
  // if (!out.object) out.object = 'chat.completion';
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
 */
function baselineNormalizeChunk(azureChunk) {
  const out = deepClone(azureChunk);
  // out.object = 'chat.completion.chunk';
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

/* ---------------------- includeAttributes operations ------------------------ */

/**
 * Apply a single include rule to a SINGLE target object at attributeName (no wildcard).
 */
function applyIncludeSingle(root, rule) {
  const op = rule.op || NormalizerPolicyOperator.Set;

  if (op === NormalizerPolicyOperator.Set) {
    setPath(root, rule.attributeName, rule.attributeValue);
    return;
  }

  if (op === NormalizerPolicyOperator.Merge) {
    // Ensure an object at the path, then deep-merge
    const parentPath = rule.attributeName;
    const tgt = ensurePathObject(root, parentPath);
    deepMerge(tgt, rule.attributeValue, rule.arrayMerge || NormalizerPolicyOperator.Replace);
    return;
  }

  if (op === NormalizerPolicyOperator.Append || op === NormalizerPolicyOperator.Insert || op === NormalizerPolicyOperator.Upsert) {
    const arr = ensurePathArray(root, rule.attributeName);

    if (op === NormalizerPolicyOperator.Append) {
      const vals = Array.isArray(rule.attributeValue) ? rule.attributeValue : [rule.attributeValue];
      for (const v of vals) arr.push(deepClone(v));
      return;
    }

    if (op === NormalizerPolicyOperator.Insert) {
      const idx = Number(rule.index ?? 0);
      const vals = Array.isArray(rule.attributeValue) ? rule.attributeValue : [rule.attributeValue];
      arr.splice(idx, 0, ...vals.map(deepClone));
      return;
    }

    if (op === NormalizerPolicyOperator.Upsert) {
      const { match, value, mode = NormalizerPolicyOperator.Merge } = rule;
      if (!match || match.key === undefined) return;
      const key = match.key;
      const matchVal = match.value;
      const pos = arr.findIndex(el => isObject(el) && el[key] === matchVal);
      if (pos === -1) {
        arr.push(deepClone(value));
      } else {
        if (mode === NormalizerPolicyOperator.Replace) {
          arr[pos] = deepClone(value);
        } else {
          if (!isObject(arr[pos])) arr[pos] = {};
          deepMerge(arr[pos], value, rule.arrayMerge || NormalizerPolicyOperator.Replace);
        }
      }
      return;
    }
  }
}

/**
 * Apply a single include rule that may have wildcards + broadcast.
 * If broadcast=true and attributeName contains [*], apply to each resolved match.
 * Otherwise, treat as single path operation.
 */
function applyIncludeRule(root, rule) {
  const hasWildcard = rule.attributeName && parsePath(rule.attributeName).includes('*');
  const broadcast = !!rule.broadcast;

  if (hasWildcard && broadcast) {
    const matches = resolveMatches(root, rule.attributeName);
    for (const m of matches) {
      // When attributeName resolves to an existing value (m.value), we want to operate on it directly.
      // For set/merge: if m.parent && m.key exists, operate on parent/key as a concrete path.
      const concretePath = buildConcretePathFromMatch(m);
      if (!concretePath) continue;

      const clonedRule = { ...rule, attributeName: concretePath };
      // Remove broadcast for the concrete operation
      delete clonedRule.broadcast;
      applyIncludeSingle(root, clonedRule);
    }
  } else {
    // No wildcard broadcast: single target creation/merge
    applyIncludeSingle(root, rule);
  }
}

function buildConcretePathFromMatch(match) {
  // Reconstruct a concrete path string from a match's ancestry (parent+key are at the final segment)
  // We cannot derive the full path from the root here without additional tracking,
  // but setPath works with concrete absolute paths we already had in rule.attributeName.
  // Strategy: We will not attempt to reverse the full path; instead,
  // leverage that resolveMatches returned the final parent/key for attributeName.
  // To construct a concrete path string, we require the caller's original path.
  // Since we don't carry it here, we rebuild by walking 'parent' chain is not available.
  // Simplest: we avoid reconstructing path and instead directly mutate via parent/key.
  // However, our includeSingle uses setPath which requires a string path…
  //
  // Workaround: generate a synthetic setter using parent/key directly only for set/merge/array ops.
  // To keep code simple, we convert parent/key into a special '@@direct@@' path.
  return null; // See alternative approach below
}

/**
 * Alternative approach: For wildcard+broadcast, we avoid reconstructing paths and apply
 * the operation directly to match.parent[match.key].
 * Implement specialized handlers mirroring includeSingle behavior.
 */
function applyIncludeRuleBroadcastDirect(root, rule) {
  const matches = resolveMatches(root, rule.attributeName);
  const op = rule.op || NormalizerPolicyOperator.Set;

  for (const m of matches) {
    if (!(m.parent && m.key !== undefined && m.key !== null)) continue;

    if (op === NormalizerPolicyOperator.Set) {
      m.parent[m.key] = deepClone(rule.attributeValue);
      continue;
    }

    if (op === NormalizerPolicyOperator.Merge) {
      const arrayMerge = rule.arrayMerge || NormalizerPolicyOperator.Replace;
      const curr = m.parent[m.key];
      if (!isObject(curr)) m.parent[m.key] = {};
      m.parent[m.key] = deepMerge(m.parent[m.key], rule.attributeValue, arrayMerge);
      continue;
    }

    if (op === NormalizerPolicyOperator.Append || op === NormalizerPolicyOperator.Insert || op === NormalizerPolicyOperator.Upsert) {
      if (!Array.isArray(m.parent[m.key])) m.parent[m.key] = [];
      const arr = m.parent[m.key];

      if (op === NormalizerPolicyOperator.Append) {
        const vals = Array.isArray(rule.attributeValue) ? rule.attributeValue : [rule.attributeValue];
        for (const v of vals) arr.push(deepClone(v));
      } else if (op === NormalizerPolicyOperator.Insert) {
        const idx = Number(rule.index ?? 0);
        const vals = Array.isArray(rule.attributeValue) ? rule.attributeValue : [rule.attributeValue];
        arr.splice(idx, 0, ...vals.map(deepClone));
      } else if (op === NormalizerPolicyOperator.Upsert) {
        const { match, value, mode = NormalizerPolicyOperator.Merge } = rule;
        if (!match || match.key === undefined) continue;
        const key = match.key;
        const matchVal = match.value;
        const pos = arr.findIndex(el => isObject(el) && el[key] === matchVal);
        if (pos === -1) arr.push(deepClone(value));
        else if (mode === NormalizerPolicyOperator.Replace) arr[pos] = deepClone(value);
        else {
          if (!isObject(arr[pos])) arr[pos] = {};
          deepMerge(arr[pos], value, rule.arrayMerge || NormalizerPolicyOperator.Replace);
        }
      }
    }
  }
}

/* --------------------- Config-driven transforms in order -------------------- */
/**
 * Apply transforms in the required order:
 * 1) excludeAttributes
 * 2) replaceAttributes (supports optional 'value')
 * 3) includeAttributes
 */
function applyConfigTransformsInOrder(obj, config) {
  const deleteAttributes = config.deleteAttributes ?? config.excludeAttributes ?? [];
  const replaceAttributes = config.replaceAttributes ?? [];
  const includeAttributes = config.includeAttributes ?? [];

  // 1) Delete
  for (const del of deleteAttributes) {
    if (!del || !del.attributeName) continue;
    try { deletePath(obj, del.attributeName); } catch {}
  }

  // 2) Replace (with optional override value)
  for (const rep of replaceAttributes) {
    if (!rep || !rep.fromAttributeName || !rep.toAttributeName) continue;
    const overrideProvided = Object.prototype.hasOwnProperty.call(rep, 'value');
    const overrideValue = rep.value;
    try { replacePath(obj, rep.fromAttributeName, rep.toAttributeName, overrideProvided, overrideValue); } catch {}
  }

  // 3) Include (object/array ops)
  for (const inc of includeAttributes) {
    if (!inc || !inc.attributeName) continue;
    const hasWildcard = parsePath(inc.attributeName).includes('*');
    const broadcast = !!inc.broadcast;

    try {
      if (hasWildcard && broadcast) {
        applyIncludeRuleBroadcastDirect(obj, inc);
      } else {
        applyIncludeRule(obj, inc);
      }
    } catch {}
  }

  return obj;
}

/* --------------------------------- API ------------------------------------- */

/**
 * Apply transforms to the complete AOAI response (batch)
 * @param {object} config - Normalizer Policy Definition
 * @param {object} inputObject - Azure (or AOAI-like) full JSON request / response
 * @returns {object} transformed object
 */
function processBatch(reqid, config, inputObject) {
  if ( !config )
    return inputObject;

  logger.log({ level: "debug", message: "[%s] processBatch():\n  Request ID: %s\n  Normalizer Policy:\n%s\n  Payload:\n%s", splat: [scriptName, reqid, JSON.stringify(config, null, 2), JSON.stringify(inputObject, null, 2)] });
  
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

  const rl = readline.createInterface({ input: req, crlfDelay: Infinity });

  try {
    for await (const rawLine of rl) {
      const line = rawLine;
      const trimmed = line.trim();

      if (trimmed === '') { res.write('\n'); continue; }
      if (!trimmed.startsWith('data:')) { res.write(line + '\n'); continue; }

      const payloadStr = line.slice(line.indexOf('data:') + 5).trim();
      if (payloadStr === '[DONE]') { res.write('data: [DONE]\n\n'); continue; }

      let chunkObj;
      try { chunkObj = JSON.parse(payloadStr); }
      catch { res.write(line + '\n'); continue; }

      let normalizedChunk = config.normalizeOutput ? baselineNormalizeChunk(chunkObj) : deepClone(chunkObj);
      normalizedChunk = applyConfigTransformsInOrder(normalizedChunk, config);

      res.write(`data: ${JSON.stringify(normalizedChunk)}\n\n`);
    }
  } finally {
    // Caller controls lifecycle; don't res.end() automatically.
  }
}

module.exports = {
  processBatch,
  processStream
  // processStreaming,
  // For testing / composition:
  // baselineNormalizeBatch,
  // baselineNormalizeChunk,
  // applyConfigTransformsInOrder
};