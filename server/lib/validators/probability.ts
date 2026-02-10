import { z } from 'zod';

export const probabilitySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1)
    .describe('Explanation for why the message is relevant or not relevant.'),
  probability: z
    .number()
    .min(0)
    .max(1)
    .describe('Likelihood that the message is relevant (0 to 1).'),
});

export type Probability = z.infer<typeof probabilitySchema>;
