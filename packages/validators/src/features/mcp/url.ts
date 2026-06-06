import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { z } from 'zod';

const blockedIpRanges = new Set([
  'broadcast',
  'carrierGradeNat',
  'linkLocal',
  'loopback',
  'multicast',
  'private',
  'reserved',
  'unspecified',
  'uniqueLocal',
]);

export const mcpServerUrlSchema = z
  .string()
  .trim()
  .min(1)
  .transform(async (value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a valid HTTPS URL.',
      });
      return z.NEVER;
    }

    if (url.protocol !== 'https:') {
      ctx.addIssue({
        code: 'custom',
        message: 'MCP server URL must use https.',
      });
      return z.NEVER;
    }

    const parsedIp = isIP(url.hostname);
    const addresses =
      parsedIp === 0
        ? await lookup(url.hostname, { all: true, verbatim: true })
        : [{ address: url.hostname, family: parsedIp }];

    for (const address of addresses) {
      if (blockedIpRanges.has(ipaddr.process(address.address).range())) {
        ctx.addIssue({
          code: 'custom',
          message: 'MCP server URL resolves to a blocked network address.',
        });
        return z.NEVER;
      }
    }

    return url.toString();
  });
