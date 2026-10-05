/**
 * Name: IP/Domain security policy engine
 * Description: A security policy engine that checks if a) IP address of client is allowed b) IP addrs/Domain names of target (outbound) 
 * calls are allowed.
 * Inbound policy rules are used to restrict access to the AI Gateway endpoints.
 * Outbound policy rules are primarily used for restricting access to external services such as LLM endpoints, MCP servers, gRPC servers and Web APIs.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 05-28-2026
 * Version: 3.0.1
 *
 * Sample policy JSON:
 *  {
      "inbound": {
        "allowedSources": {
          "ips": ["192.168.1.50", "10.0.0.0/24"]
        }
      },
      "outbound": {
        "allowedDestinations": {
          "ips": ["142.250.190.46"],
          "domains": ["://openai.com", "*.anthropic.com", "api.cohere.ai"]
        }
      }
    }
   Policy with pii JSON:
   {
    "inbound": {
      "allowedSources": {
        "ips": [
          "10.0.0.1",
          "192.168.1.50"
        ]
      },
      "piiPolicy": {
        "enabled": true,
        "action": "REDACT",
        "redactionCharacter": "X",
        "builtinIdentifiers": [
          "EMAIL_ADDRESS",
          "US_SSN"
        ],
        "customIdentifiers": [
          {
            "name": "INTERNAL_EMPLOYEE_ID",
            "regex": "^EMP-[0-9]{5}$"
          }
        ]
      }
    },
    "outbound": {
      "allowedDestinations": {
        "ips": [
          "8.8.8.8"
        ],
        "domains": [
          "*.openai.com",
          "://anthropic.com"
        ]
      },
      "piiPolicy": {
        "enabled": true,
        "action": "BLOCK",
        "builtinIdentifiers": [
          "CREDIT_CARD"
        ],
        "customIdentifiers": []
      }
    }
  }
 * 
 * Notes:
*/

const net = require('net');
const url = require('url');
const { Buffer } = require('node:buffer');

class SecurityEngine {
  constructor(secConfig) {
    this.secPolicies = secConfig;

    this.inboundRegexes = this.compileCustomRegexes('inbound');
    this.outboundRegexes = this.compileCustomRegexes('outbound');

    // Built-in regex registry
    this.builtinPatterns = {
      'EMAIL_ADDRESS': /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      'CREDIT_CARD': /\b(?:\d[ -]*?){13,16}\b/g,
      'US_SSN': /\b\d{3}-\d{2}-\d{4}\b/g,
      'PHONE_NUMBER': /\b(?:\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}\b/g,
      'IP_ADDRESS': /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g
    };
    // this.loadPolicies();
  }

  /*
  loadPolicies() {
    try {
      const rawData = fs.readFileSync(this.configPath, 'utf8');
      this.secPolicies = JSON.parse(rawData);
    } catch (error) {
      console.error(`Failed to load security policies: ${error.message}`);
      this.secPolicies = { inbound: { allowed_sources: { ips: [] } }, outbound: { allowed_destinations: { ips: [], domains: [] } } };
    }
  }
  */

  // Compile custom regex arrays from JSON strings
  compileCustomRegexes(direction) {
    const customs = this.secPolicies?.[direction]?.piiPolicy?.customIdentifiers || [];
    return customs.map(item => ({
      name: item.name,
      regex: new RegExp(item.regex, 'g')
    }));
  }

  // Helper to deep scan and process PII strings inside JSON objects
  processPii(payload, direction) {
    const policy = this.secPolicies?.[direction]?.piiPolicy;
    if (!policy || !policy.enabled) return { allowed: true, modifiedPayload: payload };

    let containsPii = false;
    const char = policy.redactionCharacter || '*';

    // Deep traversal and string replacement helper
    const traverseAndTransform = (obj) => {
      if (typeof obj === 'string') {
        let currentString = obj;

        // 1. Check Built-ins
        policy.builtinIdentifiers.forEach(id => {
          const regex = this.builtinPatterns[id];
          if (regex) {
            // Direct replacement (or tracking) without calling regex.test() first
            const updated = currentString.replace(regex, (match) => char.repeat(match.length));
            if (updated !== currentString) {
              containsPii = true;
              if (policy.action === 'REDACT') currentString = updated;
            }
          }
        });

        // 2. Check Custom Regexes
        const customRegexes = direction === 'inbound' ? this.inboundRegexes : this.outboundRegexes;
        customRegexes.forEach(item => {
          const updated = currentString.replace(item.regex, (match) => char.repeat(match.length));
          if (updated !== currentString) {
            containsPii = true;
            if (policy.action === 'REDACT') currentString = updated;
          }
        });

        return currentString;
      }
      else if (Array.isArray(obj)) {
        return obj.map(traverseAndTransform);
      }
      else if (obj !== null && typeof obj === 'object') {
        const newObj = {};
        for (const key in obj) {
          newObj[key] = traverseAndTransform(obj[key]);
        };
        return newObj;
      };

      return obj;
    };

    const cleanedPayload = traverseAndTransform(payload);

    // If PII is found and action is BLOCK, fail the request
    if (containsPii && policy.action === 'BLOCK') {
      return { allowed: false, modifiedPayload: payload };
    };

    return { allowed: true, modifiedPayload: cleanedPayload };
  }

  // --- 1. INBOUND CHECKS (IPs & CIDRs) ---
  // --- 2. PII check on request payload ---
  // payloadContainer = { body: req.body }
  isInboundAllowed(sourceIp, payloadContainer = {}) {
    // 1. IP validation logic
    const cleanIp = this.normalizeIp(sourceIp);
    if (!net.isIP(cleanIp)) return false;

    const allowedIps = this.secPolicies.inbound.allowedSources.ips || [];
    // return allowedIps.some(rule => this.matchIpOrCidr(cleanIp, rule));
    if (!allowedIps.some(rule => this.matchIpOrCidr(cleanIp, rule)))
      return false;

    if ((Object.keys(payloadContainer).length > 0) && this.secPolicies.inbound.piiPolicy) {
      // 2. Integrated PII Logic
      const result = this.processPii(payloadContainer.body, 'inbound');
      if (!result.allowed) return false;

      // Mutate the original reference with redacted text if applicable
      payloadContainer.body = result.modifiedPayload;
    };

    return true;
  }

  // --- 1. OUTBOUND CHECKS (IPs, CIDRs, and URI Domains) ---
  // --- 2. PII check on response payload ---
  isOutboundAllowed(targetUriOrIp, payloadContainer = {}) {
    let target = targetUriOrIp.trim();
    let targetHost = target;

    // 1. IP / Domain validation logic
    // Extract hostname if a complete URI is passed
    if (target.includes('://')) {
      try {
        targetHost = new url.URL(target).hostname;
      }
      catch {
        return false;
      };
    }

    // Scenario A: The egress engine is trying to hit a raw IP string
    if (net.isIP(targetHost)) {
      const cleanIp = this.normalizeIp(targetHost);
      const allowedIps = this.secPolicies.outbound.allowedDestinations.ips || [];
      if (!allowedIps.some(rule => this.matchIpOrCidr(cleanIp, rule)))
        return false;
    }
    else {
      // Scenario B: The target is a domain name string. Check domain whitelist rules.
      const allowedDomains = this.secPolicies.outbound.allowedDestinations.domains || [];
      if (!allowedDomains.some(domainRule => this.matchDomain(targetHost, domainRule)))
        return false;
    };

    // 2. Integrated PII logic
    if ((Object.keys(payloadContainer).length > 0) && this.secPolicies.outbound.piiPolicy) {
      const result = this.processPii(payloadContainer.body, 'outbound');
      if (!result.allowed) return false;

      // Mutate the original reference with redacted text if applicable
      payloadContainer.body = result.modifiedPayload;
    };

    return true;
  }

  // --- HELPER UTILITIES ---
  normalizeIp(ip) {
    if (typeof ip !== 'string') return '';
    return ip.startsWith('::ffff:') ? ip.substring(7) : ip.trim();
  }

  matchDomain(targetHost, rule) {
    const cleanHost = targetHost.toLowerCase();
    const cleanRule = rule.toLowerCase();

    if (cleanRule.startsWith('*.')) {
      const baseDomain = cleanRule.substring(2);
      return cleanHost === baseDomain || cleanHost.endsWith('.' + baseDomain);
    };

    return cleanHost === cleanRule;
  }

  matchIpOrCidr(ip, rule) {
    if (!rule.includes('/')) {
      return ip === this.normalizeIp(rule);
    };

    // Evaluate CIDR calculations natively
    const [range, bitsStr] = rule.split('/');
    const bits = parseInt(bitsStr, 10);

    if (net.isIPv4(ip) && net.isIPv4(range)) {
      return this.matchIPv4Cidr(ip, range, bits);
    };

    // IPv6 CIDR matching can be added here if infrastructure requires it
    return false;
  }

  /**
  matchIPv4Cidr(ip, range, bits) {
    const ipBuf = net.parseIPv4(ip);
    const rangeBuf = net.parseIPv4(range);

    // Read 32-bit big-endian unsigned integers natively
    const ipInt = ipBuf.readUInt32BE(0);
    const rangeInt = rangeBuf.readUInt32BE(0);

    const mask = bits === 0 ? 0 : (~0 << (32 - bits));
    return (ipInt & mask) === (rangeInt & mask);
  }
  */

  matchIPv4Cidr(ip, range, bits) {
    // Helper to split IP string and convert directly to a 32-bit Integer
    const parseIPv4ToInt = (ipStr) => {
      const octets = ipStr.split('.').map(Number);
      if (octets.length !== 4 || octets.some(isNaN)) {
        throw new Error(`Invalid IPv4 address format: ${ipStr}`);
      }
      return Buffer.from(octets).readUInt32BE(0);
    };

    try {
      const ipInt = parseIPv4ToInt(ip);
      const rangeInt = parseIPv4ToInt(range);

      const mask = bits === 0 ? 0 : (~0 << (32 - bits));
      return (ipInt & mask) === (rangeInt & mask);
    }
    catch (error) {
      // Gracefully handle or log parsing errors
      return false;
    };
  }
}

module.exports = SecurityEngine;