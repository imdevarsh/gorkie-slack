import { zValidator } from "@hono/zod-validator";
import {
  deleteExpiredProxyTokens,
  issueProxyToken,
  revokeProxyToken,
} from "@repo/db/queries";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { env } from "../env";
import { tokenRequestSchema } from "./schemas";

export const internalRoutes = new Hono()
  .post(
    "/tokens",
    bearerAuth({ token: env.PROXY_API_KEY }),
    zValidator("json", tokenRequestSchema),
    async (c) => {
      const { sandboxId } = c.req.valid("json");

      await deleteExpiredProxyTokens();
      const issued = await issueProxyToken({
        sandboxId,
        ttlMs: env.PROXY_TOKEN_TTL_MS,
      });

      return c.json({
        expiresAt: issued.expiresAt.toISOString(),
        token: issued.token,
      });
    }
  )
  .delete(
    "/tokens/:sandboxId",
    bearerAuth({ token: env.PROXY_API_KEY }),
    async (c) => {
      await revokeProxyToken({ sandboxId: c.req.param("sandboxId") });
      return c.json({ success: true });
    }
  );
