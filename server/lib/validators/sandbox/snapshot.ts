import { z } from 'zod';

export const snapshotRecordSchema = z.object({
  snapshotId: z.string(),
  createdAt: z.number(),
});

export type SnapshotRecord = z.infer<typeof snapshotRecordSchema>;

export const baseSnapshotRecordSchema = z.object({
  snapshotId: z.string(),
  createdAt: z.number(),
  runtime: z.string(),
});

export type BaseSnapshotRecord = z.infer<typeof baseSnapshotRecordSchema>;
