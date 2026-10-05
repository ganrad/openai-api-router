'use strict';
/**
 * Trace emission for the tool retrieval feature.
 *
 * Traces are written to the logger as structured records. Every record is a flat,
 * serializable object with a stable field set, so the future "persist traces to a
 * DB table" work is a change HERE ONLY -- call sites stay untouched.
 *
 * Record shape (this is effectively the table schema):
 *   requestId    string    correlates every log line for one gateway request
 *   phase        string    'tool_retrieval' | 'tool_index_build'
 *   app          string
 *   startedAt    number    epoch ms
 *   durationMs   number
 *   attributes   object    phase-specific scalars
 *   candidates   array     per-tool scoring detail (tool_retrieval only)
 */

const TRACE_MSG = 'rapid.trace';

class TraceLogger {
  /**
   * @param {object}  logger            pino-style: info/warn/error(obj, msg)
   * @param {object} [opts]
   * @param {boolean}[opts.enabled]     master switch
   * @param {boolean}[opts.includeCandidates]  per-tool detail can be chatty; on by default
   *                                            because it is the point of the span
   * @param {number} [opts.maxCandidates]      cap the candidate array size in logs
   */
  constructor(logger = console, opts = {}) {
    this.logger = logger;
    this.enabled = opts.enabled !== false;
    this.includeCandidates = opts.includeCandidates !== false;
    this.maxCandidates = opts.maxCandidates ?? 50;
  }

  /**
   * @param {object} span
   * @param {string} span.requestId
   * @param {string} span.phase
   * @param {string} span.app
   * @param {number} span.startedAt
   * @param {number} span.durationMs
   * @param {object} [span.attributes]
   * @param {array}  [span.candidates]
   */
  span({ requestId, phase, app, startedAt, durationMs, attributes = {}, candidates }) {
    if (!this.enabled) return;

    const record = {
      requestId: requestId || null,
      phase,
      app,
      startedAt,
      durationMs,
      attributes,
    };

    if (this.includeCandidates && Array.isArray(candidates)) {
      record.candidates = candidates.slice(0, this.maxCandidates);
      if (candidates.length > this.maxCandidates) record.candidatesTruncated = candidates.length;
    }

    // Later: also INSERT `record` into the trace table here.
    this.logger.info?.(record, TRACE_MSG);
  }
}

/** No-op sink for tests and for callers that pass no tracer. */
const NULL_TRACER = { span() {} };

module.exports = { TraceLogger, NULL_TRACER, TRACE_MSG };