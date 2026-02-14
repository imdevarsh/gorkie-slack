export interface PreviewAccess {
  baseUrl: string;
  previewToken: string | null;
}

const TRAILING_SLASH = /\/$/;

export function parsePreviewUrl(url: string): PreviewAccess {
  const parsed = new URL(url);
  const previewToken = parsed.searchParams.get('tkn');
  parsed.searchParams.delete('tkn');

  return {
    baseUrl: parsed.toString().replace(TRAILING_SLASH, ''),
    previewToken,
  };
}

export async function waitForHealth(
  access: PreviewAccess,
  token: string,
  timeoutMs = 60_000
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const headers = new Headers({ Authorization: `Bearer ${token}` });
    if (access.previewToken) {
      headers.set('x-daytona-preview-token', access.previewToken);
    }

    const response = await fetch(`${access.baseUrl}/v1/health`, {
      method: 'GET',
      headers,
    }).catch(() => null);

    if (response?.ok) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });
  }

  throw new Error('Timed out waiting for sandbox-agent health check');
}
