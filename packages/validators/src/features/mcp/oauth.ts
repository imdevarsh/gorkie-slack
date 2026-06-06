import { z } from 'zod';

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
