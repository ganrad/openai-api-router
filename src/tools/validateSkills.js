#!/usr/bin/env node
'use strict';
/**
 * CI validator for ./agents/{app}/{server}/SKILL.md
 *
 *   node tools/validateSkills.js ./agents
 *
 * Enforces the Agent Skills spec constraints plus the RAPID tools-block
 * conventions, and keeps authors inside the YAML subset miniYaml.js supports.
 * Exits non-zero on any error.
 */

const fs = require('node:fs');
const path = require('node:path');
const { parseSkillMarkdown } = require('../lib/skillLoader');

const MAX_BODY_LINES = 500;        // spec guidance: keep SKILL.md under ~500 lines
const MAX_ALWAYS_INCLUDE = 10;
const TRIGGER_HINTS = ['use when', 'use for', 'use whenever', 'prerequisite'];

const errors = [];
const warnings = [];

// Reject YAML features miniYaml.js does not implement, before they cause silent misparses.
const UNSUPPORTED = [
  [/^\s*[\w.$-]+\s*:\s*&\S/m, 'anchors (&) are not supported'],
  [/^\s*[\w.$-]+\s*:\s*\*\S/m, 'aliases (*) are not supported'],
  [/^\s*[\w.$-]+\s*:\s*\{/m, 'flow maps ({...}) are not supported; use nested keys'],
  [/^\s*\?\s/m, 'complex keys (?) are not supported'],
  [/\t/, 'tab characters are not valid YAML indentation'],
];

function walk(root) {
  const out = [];
  for (const app of fs.readdirSync(root, { withFileTypes: true })) {
    if (!app.isDirectory() || app.name.startsWith('.')) continue;
    for (const server of fs.readdirSync(path.join(root, app.name), { withFileTypes: true })) {
      if (!server.isDirectory() || server.name.startsWith('.')) continue;
      const f = path.join(root, app.name, server.name, 'SKILL.md');
      if (fs.existsSync(f)) out.push({ app: app.name, file: f });
      else errors.push(`${path.join(root, app.name, server.name)}: directory has no SKILL.md`);
    }
  }
  return out;
}

function validate(root) {
  const files = walk(root);
  const perApp = new Map();

  for (const { app, file } of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const rel = path.relative(process.cwd(), file);

    for (const [re, msg] of UNSUPPORTED) {
      if (re.test(raw)) errors.push(`${rel}: ${msg}`);
    }

    let skill;
    try { skill = parseSkillMarkdown(raw, file); }
    catch (err) { errors.push(err.message); continue; }

    if (skill.bodyLines > MAX_BODY_LINES) {
      warnings.push(`${rel}: body is ${skill.bodyLines} lines; the spec recommends staying under ${MAX_BODY_LINES}`);
    }
    if (!skill.tools.length) errors.push(`${rel}: tools block is empty`);

    for (const t of skill.tools) {
      const where = `${rel} [${t.name}]`;
      if (!/^[A-Za-z0-9_.-]+$/.test(t.name)) {
        errors.push(`${where}: tool name must match the MCP tools/list name exactly (alphanumerics, _ . -)`);
      }
      if (t.description.length < 30) {
        errors.push(`${where}: description is too short to retrieve on (${t.description.length} chars)`);
      }
      if (t.description.length > 1024) {
        errors.push(`${where}: description exceeds 1024 characters`);
      }
      const lower = t.description.toLowerCase();
      if (!TRIGGER_HINTS.some(h => lower.includes(h))) {
        warnings.push(`${where}: description has no "use when"-style trigger clause; retrieval quality will suffer`);
      }
      if (!t.examples.length && !t.aliases.length) {
        warnings.push(`${where}: no examples and no aliases; this tool relies entirely on description wording`);
      }
      for (const ex of t.examples) {
        if (ex.length < 8) errors.push(`${where}: example "${ex}" is too short to be a useful exemplar query`);
      }
    }

    if (!perApp.has(app)) perApp.set(app, []);
    perApp.get(app).push(skill);
  }

  // App-level checks
  for (const [app, skills] of perApp) {
    const always = skills.flatMap(s => s.tools.filter(t => t.alwaysInclude).map(t => `${s.server}.${t.name}`));
    if (always.length > MAX_ALWAYS_INCLUDE) {
      errors.push(`${app}: ${always.length} tools marked alwaysInclude, limit is ${MAX_ALWAYS_INCLUDE} -> ${always.join(', ')}`);
    }
    const servers = new Set();
    for (const s of skills) {
      if (servers.has(s.server)) errors.push(`${app}: duplicate server name "${s.server}"`);
      servers.add(s.server);
    }
  }

  return { files: files.length, apps: perApp.size };
}

const root = process.argv[2] || './agents';
const { files, apps } = validate(root);

for (const w of warnings) console.warn(`WARN  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);
console.log(`\nvalidated ${files} SKILL.md file(s) across ${apps} app(s): ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);