import { z } from 'zod';

export const snapshotRecordSchema = z.object({
  imageId: z.string(),
  createdAt: z.number(),
});
