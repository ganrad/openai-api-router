
/**
 * Name: IP/Domain security policy engine
 * Description: A security policy engine that checks if a) IP address of client is allowed b) IP addrs/Domain names of target (outbound) 
 * calls are allowed (Primarily used for restricting external services such as MCP servers, gRPC servers and Web APIs).
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
 * 
 * Notes:
*/

const net = require('net');
const url = require('url');

class SecurityEngine {
  constructor(secConfig) {
    this.secPolicies = secConfig;
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

  // --- INBOUND CHECKS (IPs & CIDRs) ---
  isInboundAllowed(sourceIp) {
    const cleanIp = this.normalizeIp(sourceIp);
    if (!net.isIP(cleanIp)) return false;

    const allowedIps = this.secPolicies.inbound.allowedSources.ips || [];
    return allowedIps.some(rule => this.matchIpOrCidr(cleanIp, rule));
  }

  // --- OUTBOUND CHECKS (IPs, CIDRs, and URI Domains) ---
  isOutboundAllowed(targetUriOrIp) {
    let target = targetUriOrIp.trim();
    let targetHost = target;

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
      return allowedIps.some(rule => this.matchIpOrCidr(cleanIp, rule));
    }

    // Scenario B: The target is a domain name string. Check domain whitelist rules.
    const allowedDomains = this.secPolicies.outbound.allowedDestinations.domains || [];
    return allowedDomains.some(domainRule => this.matchDomain(targetHost, domainRule));
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
    }
    return cleanHost === cleanRule;
  }

  matchIpOrCidr(ip, rule) {
    if (!rule.includes('/')) {
      return ip === this.normalizeIp(rule);
    }

    // Evaluate CIDR calculations natively
    const [range, bitsStr] = rule.split('/');
    const bits = parseInt(bitsStr, 10);

    if (net.isIPv4(ip) && net.isIPv4(range)) {
      return this.matchIPv4Cidr(ip, range, bits);
    }
    // IPv6 CIDR matching can be added here if infrastructure requires it
    return false;
  }

  matchIPv4Cidr(ip, range, bits) {
    const ipBuf = net.parseIPv4(ip);
    const rangeBuf = net.parseIPv4(range);

    // Read 32-bit big-endian unsigned integers natively
    const ipInt = ipBuf.readUInt32BE(0);
    const rangeInt = rangeBuf.readUInt32BE(0);

    const mask = bits === 0 ? 0 : (~0 << (32 - bits));
    return (ipInt & mask) === (rangeInt & mask);
  }
}

module.exports = SecurityEngine;