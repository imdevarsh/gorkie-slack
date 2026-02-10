import { z } from 'zod';

export const snapshotRecordSchema = z.object({
  snapshotId: z.string(),
  createdAt: z.number(),
});
