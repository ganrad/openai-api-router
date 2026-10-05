'use strict';
/**
 * Loads ./agents/{appName}/{mcpServerName}/SKILL.md files.
 *
 * Per the Agent Skills spec: YAML frontmatter (name, description required;
 * name must match the parent directory) followed by a Markdown body.
 * RAPID convention: the body contains one fenced ```yaml block declaring `tools:`.
 *
 * NOTE: the prose loaded here is used ONLY to build the retrieval index.
 * It is never injected into the planner prompt -- the planner receives the
 * cached tools/list output (server, name, description, input/output schema)
 * for shortlisted tools only.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('./miniYaml');

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const TOOLS_BLOCK_RE = /```ya?ml\s*\r?\n([\s\S]*?)```/g;

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

class SkillError extends Error {
  constructor(file, msg) { super(`${file}: ${msg}`); this.file = file; }
}

function parseSkillMarkdown(raw, filePath) {
  const m = raw.match(FM_RE);
  if (!m) throw new SkillError(filePath, 'missing YAML frontmatter delimited by ---');

  const fm = yaml.parse(m[1]) || {};
  const body = m[2] || '';

  if (!fm.name) throw new SkillError(filePath, 'frontmatter is missing required field: name');
  if (!fm.description) throw new SkillError(filePath, 'frontmatter is missing required field: description');

  const dirName = path.basename(path.dirname(filePath));
  if (fm.name !== dirName) {
    throw new SkillError(filePath, `frontmatter name "${fm.name}" must match parent directory "${dirName}"`);
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name) || fm.name.length > 64) {
    throw new SkillError(filePath, `name "${fm.name}" violates the spec (1-64 chars, lowercase alphanumeric and single hyphens)`);
  }
  if (String(fm.description).length > 1024) {
    throw new SkillError(filePath, 'description exceeds the 1024 character limit');
  }

  let tools = [];
  let matched = false;
  for (const [, block] of body.matchAll(TOOLS_BLOCK_RE)) {
    const parsed = yaml.parse(block);
    if (parsed && Array.isArray(parsed.tools)) { tools = parsed.tools; matched = true; break; }
  }
  if (!matched) throw new SkillError(filePath, 'body has no fenced ```yaml block declaring `tools:`');

  const seen = new Set();
  for (const t of tools) {
    if (!t || !t.name) throw new SkillError(filePath, 'every tool entry requires a `name`');
    if (seen.has(t.name)) throw new SkillError(filePath, `duplicate tool name "${t.name}"`);
    seen.add(t.name);
    if (!t.description) throw new SkillError(filePath, `tool "${t.name}" is missing a description`);
  }

  return {
    server: fm.name,
    serverDescription: String(fm.description),
    // rapid.* keys from frontmatter metadata, with the prefix stripped
    config: Object.fromEntries(
      Object.entries(fm.metadata || {})
        .filter(([k]) => k.startsWith('rapid.'))
        .map(([k, v]) => [k.slice('rapid.'.length), v])
    ),
    tools: tools.map(t => ({
      name: String(t.name),
      description: String(t.description),
      tags: Array.isArray(t.tags) ? t.tags.map(String) : [],
      aliases: Array.isArray(t.aliases) ? t.aliases.map(String) : [],
      examples: Array.isArray(t.examples) ? t.examples.map(String) : [],
      alwaysInclude: t.alwaysInclude === true,
      destructive: t.destructive === true,
    })),
    sourceHash: sha256(raw),
    bodyLines: body.split(/\r?\n/).length,
    filePath,
  };
}

/**
 * Load every SKILL.md under ./agents/{appName}/
 * @param {string} agentsRoot
 * @param {string} appName
 * @param {object} [ctx]
 * @param {string} [ctx.requestId]  correlates this load with the gateway request that triggered it
 * @param {object} [ctx.logger]
 */
async function loadAppSkills(agentsRoot, appName, { requestId = null, logger = console } = {}) {
  const appDir = path.join(agentsRoot, appName);
  let dirents;
  try {
    dirents = await fs.readdir(appDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      logger.warn?.({ requestId, app: appName, dir: appDir }, 'no agents directory for app -- no tools will be indexed');
      return [];
    }
    throw err;
  }

  const skills = [];
  for (const d of dirents) {
    if (!d.isDirectory() || d.name.startsWith('.')) continue;
    const file = path.join(appDir, d.name, 'SKILL.md');
    let raw;
    try { raw = await fs.readFile(file, 'utf8'); }
    catch (err) {
      if (err.code === 'ENOENT') {
        logger.warn?.({ requestId, app: appName, dir: d.name }, 'server directory has no SKILL.md -- skipped');
        continue;
      }
      throw err;
    }
    skills.push(parseSkillMarkdown(raw, file));
  }

  logger.debug?.({ requestId, app: appName, servers: skills.length }, 'skills loaded');
  return skills.sort((a, b) => a.server.localeCompare(b.server));
}

module.exports = { loadAppSkills, parseSkillMarkdown, SkillError, sha256 };