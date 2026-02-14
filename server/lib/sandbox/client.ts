export interface PreviewAccess {
  baseUrl: string;
  previewToken: string | null;
}

export async function waitForHealth(
  access: PreviewAccess,
  timeoutMs = 60_000
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const headers = new Headers();
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
