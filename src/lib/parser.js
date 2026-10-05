'use strict';
/**
 * Minimal YAML subset parser -- zero dependencies.
 *
 * SUPPORTED SUBSET (enforced by tools/validateSkills.js in CI):
 *   key: scalar
 *   key: [a, b, c]          flow sequence of scalars
 *   key: >                  folded block scalar (newlines -> spaces)
 *   key: |                  literal block scalar (newlines preserved)
 *   key:                    nested map (indent) or block sequence
 *     - item                block sequence of scalars
 *     - key: v              block sequence of maps
 *   # comment               full-line and trailing comments
 *   'quoted' / "quoted"     quoted scalars
 *   true/false/null/number  typed scalars
 *
 * NOT supported: anchors, aliases, tags, multi-doc, flow maps, complex keys.
 * If you ever need those, replace parse() with `require('yaml').parse`.
 */

function stripComment(line) {
  let out = '', q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { out += c; if (c === q && line[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'") { q = c; out += c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) break;
    out += c;
  }
  return out;
}

function scalar(raw) {
  const s = String(raw).trim();
  if (s === '') return '';
  if (s === 'null' || s === '~') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).replace(/\\"/g, '"');
  }
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map(v => scalar(v));
  }
  return s;
}

/** Tokenize into { indent, text } skipping blanks and comment-only lines. */
function tokenize(src) {
  const out = [];
  for (const rawLine of src.split(/\r?\n/)) {
    const noComment = stripComment(rawLine);
    if (noComment.trim() === '') { out.push({ blank: true, raw: rawLine }); continue; }
    out.push({ indent: noComment.match(/^ */)[0].length, text: noComment.trim(), raw: rawLine });
  }
  return out;
}

function parseBlockScalar(lines, i, baseIndent, style) {
  const parts = [];
  let j = i;
  while (j < lines.length) {
    const l = lines[j];
    if (l.blank) { parts.push(''); j++; continue; }
    if (l.indent <= baseIndent) break;
    parts.push(l.raw.slice(baseIndent + 2 <= l.indent ? baseIndent + 2 : l.indent));
    j++;
  }
  while (parts.length && parts[parts.length - 1] === '') parts.pop();
  const value = style === '|'
    ? parts.join('\n')
    : parts.reduce((acc, p) => (p === '' ? acc + '\n' : (acc && !acc.endsWith('\n') ? acc + ' ' : acc) + p.trim()), '');
  return [value.trim(), j];
}

function parseNode(lines, i, indent) {
  // Block sequence?
  if (i < lines.length && !lines[i].blank && lines[i].indent === indent && lines[i].text.startsWith('- ')) {
    const arr = [];
    let j = i;
    while (j < lines.length) {
      const l = lines[j];
      if (l.blank) { j++; continue; }
      if (l.indent < indent || !l.text.startsWith('- ')) break;
      if (l.indent > indent) break;
      const rest = l.text.slice(2).trim();
      if (/^[\w.$-]+\s*:/.test(rest)) {
        // sequence of maps: re-materialize the first key at the child indent
        const childIndent = l.indent + 2;
        const synthetic = [{ indent: childIndent, text: rest, raw: ' '.repeat(childIndent) + rest }];
        let k = j + 1;
        const block = [];
        while (k < lines.length && (lines[k].blank || lines[k].indent >= childIndent)) { block.push(lines[k]); k++; }
        const [val] = parseNode(synthetic.concat(block), 0, childIndent);
        arr.push(val);
        j = k;
      } else {
        arr.push(scalar(rest));
        j++;
      }
    }
    return [arr, j];
  }

  // Map
  const obj = {};
  let j = i;
  while (j < lines.length) {
    const l = lines[j];
    if (l.blank) { j++; continue; }
    if (l.indent < indent) break;
    if (l.indent > indent) { j++; continue; }
    const m = l.text.match(/^([\w.$-]+)\s*:\s*(.*)$/);
    if (!m) break;
    const [, key, rest] = m;
    if (rest === '>' || rest === '|' || rest === '>-' || rest === '|-') {
      const [val, next] = parseBlockScalar(lines, j + 1, l.indent, rest[0]);
      obj[key] = val; j = next;
    } else if (rest === '') {
      let k = j + 1;
      while (k < lines.length && lines[k].blank) k++;
      if (k < lines.length && lines[k].indent > l.indent) {
        const [val, next] = parseNode(lines, k, lines[k].indent);
        obj[key] = val; j = next;
      } else { obj[key] = null; j++; }
    } else {
      obj[key] = scalar(rest); j++;
    }
  }
  return [obj, j];
}

function parse(src) {
  const lines = tokenize(src);
  let i = 0;
  while (i < lines.length && lines[i].blank) i++;
  if (i >= lines.length) return {};
  const [val] = parseNode(lines, i, lines[i].indent);
  return val;
}

module.exports = { parse };