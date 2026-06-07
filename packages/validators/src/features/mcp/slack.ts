import { z } from 'zod';

export const mcpServerMetaSchema = z.object({
  serverId: z.string().optional(),
});

export type MCPServerMeta = z.output<typeof mcpServerMetaSchema>;

export const mcpModalStateSchema = z
  .looseObject({
    auth: z.enum(['bearer', 'oauth']).optional(),
    bearerToken: z.string().optional(),
    clientId: z.string().optional(),
    name: z.string().optional(),
    transport: z.enum(['http', 'sse']).optional(),
    url: z.string().optional(),
  })
  .catch({});

export type MCPModalState = z.output<typeof mcpModalStateSchema>;

export const mcpSlackViewValueSchema = z
  .looseObject({ value: z.string().nullish() })
  .catch({});

export const mcpSlackViewSelectedSchema = z
  .looseObject({
    selected_option: z
      .looseObject({
        value: z.string(),
      })
      .nullish(),
  })
  .catch({});

export const mcpToolModeInputSchema = z
  .looseObject({
    selected_option: z
      .looseObject({
        value: z.enum(['allow', 'ask', 'block']),
      })
      .nullish(),
  })
  .catch({});

export const mcpToolsMetaSchema = z.object({
  nonce: z.string().optional(),
  search: z.string().optional(),
  serverId: z.string().optional(),
  tools: z
    .record(
      z.string(),
      z.object({
        group: z.enum(['ro', 'dt', 'gn']),
        name: z.string(),
      })
    )
    .optional(),
});

export type MCPToolsMeta = z.output<typeof mcpToolsMetaSchema>;
