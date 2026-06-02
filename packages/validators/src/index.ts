import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { z } from 'zod';

export const showFileInputSchema = z.object({
  path: z.string().min(1),
  title: z.string().optional(),
});

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

export const mcpOAuthStatePayloadSchema = z.object({
  nonce: z.string(),
  serverId: z.string(),
  userId: z.string(),
});

export const mcpOAuthTokensSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
  id_token: z.string().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  token_type: z.string(),
});

export const mcpOAuthClientInformationSchema = z.object({
  client_id: z.string(),
  client_id_issued_at: z.number().optional(),
  client_secret: z.string().optional(),
  client_secret_expires_at: z.number().optional(),
});
