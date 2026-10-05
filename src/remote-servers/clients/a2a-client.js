/**
 * Name: A2A client class
 * Description: This class provides functions to send requests to A2A servers and handle responses, including streaming SSE responses.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 08-12-2026
 * Version (Introduced): 3.0.1
 *
 * A2AClient
 * ---------
 * Invokes a bridged A2A skill and presents the orchestrator with the same
 * synchronous boundary an MCP `tools/call` gives it:
 *
 *   const result = await client.invoke(tool, { input }, { contextId: runId });
 *   // -> { content: [{ type:'text', text }], structuredContent, isError }
 *
 * A2A's async task lifecycle is absorbed here:
 *   working                       -> poll `tasks/get` until terminal
 *   input-required / auth-required -> fail the step with the agent's question
 *   completed | failed | canceled | rejected -> return
 *
 * Streaming (message/stream + SSE) is deliberately out of scope for v1;
 * polling keeps the executor contract identical to MCP.
 *
 * Node 18+ (global fetch). No dependencies.
 * 
 * Notes:
 */
const {
  A2ATaskStatus,
  CustomRequestHeaders
} = require("../../utilities/app-gtwy-constants.js")
'use strict';

const TERMINAL_STATES = new Set([A2ATaskStatus.Completed, A2ATaskStatus.Failed, A2ATaskStatus.Canceled, A2ATaskStatus.Rejected]);
// new Set(['completed', 'failed', 'canceled', 'rejected']);

class A2AClient {
  /**
   * @param {object} [opts]
   * @param {number} [opts.timeoutMs=120000]        Total budget for one invocation.
   * @param {number} [opts.requestTimeoutMs=30000]  Per-request timeout.
   * @param {number} [opts.pollIntervalMs=1000]     Initial poll interval (backs off to 5s).
   * @param {function} [opts.credentialResolver]    async (a2aMeta) => ({ header: value })
   * @param {function} [opts.fetchImpl=fetch]
   */
  constructor(opts = {}) {
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 30_000;
    this.pollIntervalMs = opts.pollIntervalMs ?? 1_000;
    this.credentialResolver = opts.credentialResolver || null;
    this.fetchImpl = opts.fetchImpl || globalThis.fetch;
    this.seq = 0;
  }

  /**
   * @param {object} tool     Descriptor from A2ACardBridge.translate()
   * @param {object} args     { input: string, context?: object }
   * @param {object} [runtime] { contextId?: string, signal?: AbortSignal }
   */
  async invoke(tool, args = {}, runtime = {}) {
    const meta = tool?._meta?.a2a;
    if (!meta) throw new Error(`tool "${tool?.name}" is not an A2A-bridged tool`);
    if (typeof args.input !== 'string' || !args.input.trim()) {
      throw new Error(`tool "${tool.name}": "input" (string) is required`);
    };

    const deadline = Date.now() + this.timeoutMs;
    const headers = this.credentialResolver ? (await this.credentialResolver(meta)) || {} : {};

    const message = {
      role: 'user',
      messageId: this.#id('msg'),
      parts: [{ kind: 'text', text: args.input }],
      metadata: { skillId: meta.skillId }
    };
    if (args.context && Object.keys(args.context).length) {
      message.parts.push({ kind: 'data', data: args.context });
    }
    // contextId groups related tasks into one agent-side session. Pass the
    // plan/run id so chained steps against the same agent retain state, and so
    // MCP and A2A steps share a join key in the trace view.
    if (runtime.contextId) message.contextId = runtime.contextId;

    if (runtime.requestId) headers[CustomRequestHeaders.RequestId] = runtime.requestId;

    try {
      const sent = await this.#rpc(meta, 'message/send', { message }, headers, runtime.signal);
      const settled = await this.#settle(meta, sent, headers, deadline, runtime.signal);
      return this.#toMcpResult(settled);
    } 
    catch (err) {
      return {
        content: [{ type: 'text', text: `A2A agent "${meta.agentName}" failed: ${err.message}` }],
        isError: true
      };
    };
  }

  /** Drive a Task to a terminal state. An inline Message reply short-circuits. */
  async #settle(meta, result, headers, deadline, signal) {
    let task = result;
    let interval = this.pollIntervalMs;

    for (;;) {
      if (task?.kind === 'message') return task; // agent answered without creating a task

      const state = task?.status?.state;
      if (TERMINAL_STATES.has(state)) return task;

      // if (state === 'input-required' || state === 'auth-required') {
      if (state == A2ATaskStatus.InputRequired || state === A2ATaskStatus.AuthRequired) {
        const question = textOf(task?.status?.message?.parts) || 'more information needed';
        throw new Error(`agent paused in "${state}": ${question}`);
      };

      if (!task?.id) throw new Error('agent returned neither a task id nor a terminal result');

      if (Date.now() >= deadline) {
        throw new Error(`timed out after ${this.timeoutMs}ms in state "${state || A2ATaskStatus.Unknown}"`);
      };

      await sleep(Math.min(interval, Math.max(0, deadline - Date.now())), signal);
      interval = Math.min(interval * 1.5, 5_000);
      task = await this.#rpc(meta, 'tasks/get', { id: task.id }, headers, signal);
    };
  }

  /** Flatten task artifacts into the MCP tools/call result shape. */
  #toMcpResult(result) {
    const texts = [];
    const data = [];

    const collect = (parts = []) => {
      for (const p of parts) {
        if (p?.kind === 'text' && p.text) texts.push(p.text);
        else if (p?.kind === 'data' && p.data) data.push(p.data);
        else if (p?.kind === 'file' && p.file) texts.push(`[file] ${p.file.name || p.file.uri || 'attachment'}`);
      }
    };

    if (result?.kind === 'message') collect(result.parts);
    for (const artifact of result?.artifacts || []) collect(artifact.parts);
    if (!texts.length && !data.length) collect(result?.status?.message?.parts);

    const state = result?.status?.state || (result?.kind === 'message' ? A2ATaskStatus.Completed : A2ATaskStatus.Unknown);
    const isError = state === A2ATaskStatus.Failed || state === A2ATaskStatus.Rejected || state === A2ATaskStatus.Canceled;
    const text = texts.join('\n\n') || (isError ? `agent returned state "${state}"` : '');

    return {
      content: [{ type: 'text', text: text || '(no output)' }],
      structuredContent: { text, data, taskId: result?.id, contextId: result?.contextId, state },
      isError
    };
  }

  async #rpc(meta, method, params, headers, signal) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => ctrl.abort(), this.requestTimeoutMs);

    try {
      const res = await this.fetchImpl(meta.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
        body: JSON.stringify({ jsonrpc: '2.0', id: this.#id('rpc'), method, params }),
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error(`${method} -> HTTP ${res.status}`);

      const json = await res.json();
      if (json.error) throw new Error(`${method} -> ${json.error.message || 'JSON-RPC error'}`);
      return json.result;
    } 
    finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
  }

  #id(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${(++this.seq).toString(36)}`;
  }
}

function textOf(parts = []) {
  return parts.filter((p) => p?.kind === 'text').map((p) => p.text).join(' ').trim();
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); }, { once: true });
  });
}

module.exports = { A2AClient };