import {
  deleteExpiredProxyTokens,
  issueProxyToken,
  revokeProxyToken,
  validateProxyToken,
} from "@repo/db/queries";
import { Hono } from "hono";
import { z } from "zod";
import { env } from "../env";
import logger from "../logger";
import { getBearerToken, isInternalToken } from "./auth";
import { listProviders, providers } from "./providers";

const tokenRequestSchema = z.object({
  sandboxId: z.string().min(1),
});

function jsonError(message: string, status: 400 | 401 | 404 | 502) {
  return { message, status };
}

export const proxyApp = new Hono()
  .get("/health", (c) =>
    c.json({
      ok: true,
      providers: listProviders(),
    })
  )
  .post("/internal/tokens", async (c) => {
    const token = getBearerToken(c.req.header("Authorization"));
    if (!isInternalToken(token)) {
      return c.json(jsonError("Unauthorized", 401), 401);
    }

    const parsed = tokenRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(jsonError("Invalid token request", 400), 400);
    }

    await deleteExpiredProxyTokens();
    const issued = await issueProxyToken({
      sandboxId: parsed.data.sandboxId,
      ttlMs: env.PROXY_TOKEN_TTL_MS,
    });

    return c.json({
      expiresAt: issued.expiresAt.toISOString(),
      token: issued.token,
    });
  })
  .delete("/internal/tokens/:sandboxId", async (c) => {
    const token = getBearerToken(c.req.header("Authorization"));
    if (!isInternalToken(token)) {
      return c.json(jsonError("Unauthorized", 401), 401);
    }

    await revokeProxyToken({ sandboxId: c.req.param("sandboxId") });
    return c.json({ success: true });
  })
  .all("/:provider/*", async (c) => {
    const token = getBearerToken(c.req.header("Authorization"));
    if (!token) {
      return c.json(jsonError("Missing Authorization header", 401), 401);
    }

    const session = await validateProxyToken(token);
    if (!session) {
      return c.json(jsonError("Invalid or expired token", 401), 401);
    }

    const provider = c.req.param("provider");
    const entry = providers[provider];
    if (!entry) {
      return c.json(jsonError(`Unknown provider: ${provider}`, 400), 400);
    }

    const requestUrl = new URL(c.req.url);
    const upstreamPath = c.req.path.slice(1 + provider.length);
    const upstream = `${entry.baseUrl}${upstreamPath}${requestUrl.search}`;
    const headers = new Headers(c.req.raw.headers);
    headers.set("Authorization", `Bearer ${entry.apiKey}`);
    headers.delete("host");

    const upstreamResponse = await fetch(upstream, {
      body:
        c.req.method === "GET" || c.req.method === "HEAD"
          ? undefined
          : c.req.raw.body,
      headers,
      method: c.req.method,
      // Required by Bun when streaming a request body through fetch.
      duplex: "half",
    }).catch((error: unknown) => {
      logger.error(
        { err: error, provider, sandboxId: session.sandboxId },
        "[proxy]"
      );
      return null;
    });

    if (!upstreamResponse) {
      return c.json(jsonError("Upstream fetch failed", 502), 502);
    }

    logger.debug(
      {
        path: upstreamPath,
        provider,
        sandboxId: session.sandboxId,
        status: upstreamResponse.status,
      },
      "[proxy] forwarded"
    );

    return new Response(upstreamResponse.body, {
      headers: upstreamResponse.headers,
      status: upstreamResponse.status,
    });
  });

export type ProxyApp = typeof proxyApp;
