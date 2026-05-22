import { z } from 'zod';

export const showFileInputSchema = z.object({
  path: z.string().min(1),
  title: z.string().optional(),
});
