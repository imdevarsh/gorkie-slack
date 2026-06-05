import type { ModelMessage } from 'ai';
import { z } from 'zod';

export const approvalStateSchema = z.object({
  messages: z.array(z.custom<ModelMessage>()),
  requestHints: z.object({
    channel: z.string(),
    customization: z
      .object({
        prompt: z.string(),
      })
      .optional(),
    server: z.string(),
    time: z.string(),
  }),
});
