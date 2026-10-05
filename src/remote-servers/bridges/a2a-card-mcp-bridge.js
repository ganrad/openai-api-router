/**
 * Name: A2A MCP Bridge class
 * Description: This class acts as a (MCP) bridge.  This class exposes methods for the following 
 * 1) Fetches A2A Agent card definitions & converts them into MCP compatible tools
 *
 * A2ACardBridge
 * -------------
 * Stateless translator: reads an A2A Agent Card (v1.0.0, with v0.x fallback)
 * from a URI supplied by RAPID gateway configuration and returns MCP-shaped
 * tool descriptors -- the same object shape an MCP server returns from
 * `tools/list`.
 *
 * This class holds no state.
 *
 * Schema strategy: GENERIC PASSTHROUGH. A2A skills publish no JSON Schema
 * (AgentSkill = id/name/description/tags/examples), and agents are in practice
 * "send text, get text/artifacts back", so every bridged tool takes
 * { input: string, context?: object }.
 *
 * Node 18+ (global fetch). No dependencies.
 * --------------
 * 
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 08-12-2026
 * Version (Introduced): 3.0.1
 *
 * Notes:
 * 
 */
'use strict';
const { A2AClient } = require("../clients/a2a-client.js");

const TOOL_PREFIX = 'a2a';
const NAME_SEP = '__';
const MAX_DESCRIPTION_CHARS = 800;

class A2ACardMcpBridge {
  /**
   * @param {object} [opts]
   * @param {number} [opts.timeoutMs=10000]  Card fetch timeout.
   * @param {function} [opts.fetchImpl=fetch]
   */
  constructor(opts = {}) {
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.fetchImpl = opts.fetchImpl || globalThis.fetch; // global This is Nodejs built-in global
    this.skillDescriptors = []; // Init to empty array
  }

  /**
   * Fetch an agent card and translate its skills into MCP tool descriptors.
   * @param {string} cardUri  Agent card URI from gateway config. May be the card
   *                          document itself or the agent base URL.
   * @param {object} [headers] Optional headers (e.g. auth for a protected card).
   * @returns {Promise<object[]>} MCP `tools/list` entries.
   */
  async listTools(cardUri, headers) {
    console.log("In A2ACardMcpBridge.listTools() -");
    const card = await this.fetchCard(cardUri, headers);
    this.skillDescriptors = this.translate(card);

    return this.skillDescriptors;
  }

  /**
   * Invoke an A2A agent skill by name
   * @param {string} requestId The unique gateway request ID
   * @param {string} skillName The name of the tool / skill name
   * @param {object} args The arguments to be passed to the skill
   * @param {object} runtime Runtime arguments
   * @returns {Promise<object>} The result of the skill invocation
   * 
   * Note: This method is a wrapper around the A2AClient.invoke() method. It finds the skill descriptor
   * for the given skill name and invokes the skill using the A2AClient.
   * If the skill descriptor is not found, it returns null.
   * 
   * Example usage:
   * const result = await bridge.invoke(requestId, skillName, args, runtime);
   */
  async invoke(requestId, skillName, args, runtime) {
    const skillDescriptor = this.skillDescriptors.find((skill) => skill.name === skillName);
    if ( skillDescriptor )
      return(new A2AClient().invoke(skillDescriptor, args, runtime));

    return(null);
  }

  /** Fetch + normalize an agent card. */
  async fetchCard(cardUri, headers) {
    console.log(`In A2ACardMcpBridge.fetchCard() - CardUri = ${cardUri}`);

    const url = cardUri.endsWith('.json')
      ? cardUri
      : cardUri.replace(/\/+$/, '') + '/.well-known/agent-card.json';

    let card = await this.#getJson(url, headers).catch((err) => {
      if (url.endsWith('/.well-known/agent-card.json')) return null; // try v0.x path
      throw err;
    });
    if (!card) card = await this.#getJson(url.replace('agent-card.json', 'agent.json'), headers);

    return this.#normalizeCard(card, cardUri);
  }

  /**
   * One MCP tool per skill, so the planner gets the same granularity it has
   * with MCP servers. Tool name encodes the route back to the agent:
   *   a2a__<agentSlug>__<skillSlug>
   */
  translate(card) {
    const agentSlug = slugify(card.name, 'agent');

    return card.skills.map((skill) => ({
      name: `${TOOL_PREFIX}${NAME_SEP}${agentSlug}${NAME_SEP}${slugify(skill.id || skill.name, 'skill')}`,
      title: skill.name || skill.id,
      description: describe(card, skill),
      inputSchema: {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description:
              `Natural language instruction for the "${skill.name || skill.id}" skill. ` +
              `Include every fact the agent needs -- it cannot see the rest of the plan.`
          },
          context: {
            type: 'object',
            description: 'Optional structured context, sent alongside the text as a DataPart.',
            additionalProperties: true
          }
        },
        required: ['input'],
        additionalProperties: false
      },
      outputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Concatenated text output from the agent.' },
          data: { type: 'array', items: { type: 'object' }, description: 'Structured artifacts, if any.' },
          taskId: { type: 'string' },
          contextId: { type: 'string' },
          state: { type: 'string', description: 'Terminal A2A task state.' }
        },
        required: ['text']
      },
      // Everything A2AClient needs to invoke this skill.
      _meta: {
        a2a: {
          agentName: card.name,
          agentVersion: card.version,
          skillId: skill.id,
          endpoint: card.endpoint,
          streaming: card.streaming
        }
      }
    }));
  }

  /** Collapse v0.x and v1.0 card shapes into one internal form. */
  #normalizeCard(card, cardUri) {
    console.log(`In A2ACardMcpBridge.#normalizeCard() -\n  Card URI: ${cardUri}\n  Card: ${JSON.stringify(card, null, 2)}`);

    if (!card || typeof card !== 'object') throw new Error(`invalid agent card at ${cardUri}`);

    // v1.0 uses an ordered supportedInterfaces[]; v0.x used top-level `url`.
    const iface = Array.isArray(card.supportedInterfaces) ? card.supportedInterfaces[0] : null;
    const endpoint = iface?.url || card.url;
    if (!endpoint) throw new Error(`agent card at ${cardUri} declares no endpoint URL`);

    return {
      name: card.name || new URL(cardUri).hostname,
      description: card.description || '',
      version: card.version || card.protocolVersion || '0',
      endpoint,
      streaming: !!card.capabilities?.streaming,
      skills: Array.isArray(card.skills) ? card.skills.filter((s) => s && (s.id || s.name)) : []
    };
  }

  async #getJson(url, headers) {
    console.log(`In A2ACardMcpBridge.#getJson() - URL = ${url}`);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        headers: { accept: 'application/json', ...(headers || {}) },
        signal: ctrl.signal
      });

      if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
      return await res.json();
    } 
    finally {
      clearTimeout(timer);
    };
  }
}

/** Fold agent context + skill examples into the description the planner LLM sees. */
function describe(card, skill) {
  const parts = [];
  if (skill.description) parts.push(skill.description);
  if (card.description) parts.push(`Agent: ${card.description}`);
  if (skill.tags?.length) parts.push(`Tags: ${skill.tags.join(', ')}`);
  const examples = (skill.examples || []).slice(0, 3);
  if (examples.length) parts.push(`Examples: ${examples.map((e) => `"${e}"`).join(' | ')}`);

  const text = parts.join('\n');
  // Cards are remote input that lands in a planner prompt -- cap the length.
  return text.length <= MAX_DESCRIPTION_CHARS ? text : text.slice(0, MAX_DESCRIPTION_CHARS - 1) + '\u2026';
}

function slugify(value, fallback) {
  const out = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return out || fallback;
}

module.exports = { A2ACardMcpBridge };