import { z } from "zod";

export const tokenRequestSchema = z.object({
  sandboxId: z.string().min(1),
});
