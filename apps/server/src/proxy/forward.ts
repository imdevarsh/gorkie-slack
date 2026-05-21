import { validateProxyToken } from "@repo/db/queries";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import logger from "../logger";
import { providers } from "./providers";

interface ProxyVariables {
  sandboxId: string;
}

const authSandbox = bearerAuth<{ Variables: ProxyVariables }>({
  verifyToken: async (token, c) => {
    const session = await validateProxyToken(token);
    if (!session) {
      return false;
    }

    c.set("sandboxId", session.sandboxId);
    return true;
  },
});

export const forwardRoutes = new Hono<{ Variables: ProxyVariables }>().all(
  "/:provider/*",
  authSandbox,
  async (c) => {
    const provider = c.req.param("provider");
    const entry = providers[provider];
    if (!entry) {
      return c.json(
        { message: `Unknown provider: ${provider}`, status: 400 },
        400
      );
    }

    const requestUrl = new URL(c.req.url);
    const upstreamPath = c.req.path.slice(1 + provider.length);
    const headers = new Headers(c.req.raw.headers);
    headers.set("Authorization", `Bearer ${entry.apiKey}`);
    headers.delete("host");

    const upstreamResponse = await fetch(
      `${entry.baseUrl}${upstreamPath}${requestUrl.search}`,
      {
        body:
          c.req.method === "GET" || c.req.method === "HEAD"
            ? undefined
            : c.req.raw.body,
        headers,
        method: c.req.method,
        // Bun requires this when forwarding a streaming request body.
        duplex: "half",
      }
    ).catch((error: unknown) => {
      logger.error(
        { err: error, provider, sandboxId: c.var.sandboxId },
        "[proxy]"
      );
      return null;
    });

    if (!upstreamResponse) {
      return c.json({ message: "Upstream fetch failed", status: 502 }, 502);
    }

    logger.debug(
      {
        path: upstreamPath,
        provider,
        sandboxId: c.var.sandboxId,
        status: upstreamResponse.status,
      },
      "[proxy] forwarded"
    );

    return new Response(upstreamResponse.body, {
      headers: upstreamResponse.headers,
      status: upstreamResponse.status,
    });
  }
);
