import { z } from 'zod';

export const historyEntrySchema = z.object({
  command: z.string(),
  workdir: z.string(),
  status: z.string().optional(),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
});
export const historySchema = z.array(historyEntrySchema);
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
