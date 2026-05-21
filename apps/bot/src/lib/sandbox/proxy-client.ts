import { env } from "@/env";
import logger from "@/lib/logger";

interface IssueProxyTokenResponse {
  expiresAt: string;
  token: string;
}

function proxyUrl(path: string): string {
  return new URL(path, env.PROXY_BASE_URL).toString();
}

function proxyHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.PROXY_API_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function issueSandboxProxyToken(
  sandboxId: string
): Promise<IssueProxyTokenResponse> {
  const response = await fetch(proxyUrl("/internal/tokens"), {
    body: JSON.stringify({ sandboxId }),
    headers: proxyHeaders(),
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `[proxy] Failed to issue sandbox token: HTTP ${response.status}`
    );
  }

  return response.json() as Promise<IssueProxyTokenResponse>;
}

export async function revokeSandboxProxyToken(
  sandboxId: string
): Promise<void> {
  const response = await fetch(proxyUrl(`/internal/tokens/${sandboxId}`), {
    headers: proxyHeaders(),
    method: "DELETE",
  });

  if (!response.ok) {
    logger.warn(
      { sandboxId, status: response.status },
      "[proxy] Failed to revoke sandbox token"
    );
  }
}
