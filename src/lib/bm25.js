'use strict';
/** Hand-rolled BM25 over an in-memory corpus. Zero dependencies. */

const STOP = new Set(('a an and are as at be by for from has have how i in is it its of on or that the to '
  + 'was were what when where which who will with you your do does can could should would this these those'
).split(' '));

const K1 = 1.2;
const B = 0.75;

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2 && !STOP.has(t));
}

/** Very light suffix folding -- avoids pulling in a stemmer dependency. */
function fold(t) {
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 3 && t.endsWith('es') && !t.endsWith('ses')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3);
  return t;
}

const terms = text => tokenize(text).map(fold);

/**
 * @param {{id:string,text:string}[]} docs
 */
function build(docs) {
  const postings = new Map();   // term -> Map<docIdx, tf>
  const lengths = new Array(docs.length).fill(0);

  docs.forEach((doc, idx) => {
    const ts = terms(doc.text);
    lengths[idx] = ts.length;
    const tf = new Map();
    for (const t of ts) tf.set(t, (tf.get(t) || 0) + 1);
    for (const [t, n] of tf) {
      if (!postings.has(t)) postings.set(t, new Map());
      postings.get(t).set(idx, n);
    }
  });

  const avgdl = lengths.reduce((a, b) => a + b, 0) / (docs.length || 1);
  const N = docs.length;

  return {
    size: N,
    /** @returns {{idx:number, score:number}[]} sorted desc */
    search(query, limit = 50) {
      const qTerms = terms(query);
      if (!qTerms.length) return [];
      const scores = new Map();
      const seen = new Set();
      for (const t of qTerms) {
        if (seen.has(t)) continue;   // don't double-weight repeats
        seen.add(t);
        const post = postings.get(t);
        if (!post) continue;
        const idf = Math.log(1 + (N - post.size + 0.5) / (post.size + 0.5));
        for (const [idx, tf] of post) {
          const dl = lengths[idx] || 1;
          const denom = tf + K1 * (1 - B + B * (dl / (avgdl || 1)));
          scores.set(idx, (scores.get(idx) || 0) + idf * ((tf * (K1 + 1)) / denom));
        }
      }
      return [...scores.entries()]
        .map(([idx, score]) => ({ idx, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
  };
}

module.exports = { build, tokenize, terms };