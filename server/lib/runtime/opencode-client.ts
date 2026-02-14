interface PreviewAccess {
  previewUrl: string;
  previewAccessToken?: string | null;
}

export interface RuntimeSessionSummary {
  id: string;
  title: string;
  updatedAt?: number;
}

function parsePreviewAccess(input: string | PreviewAccess) {
  const previewUrl = typeof input === 'string' ? input : input.previewUrl;
  const url = new URL(previewUrl);
  const previewAccessToken =
    typeof input === 'string'
      ? url.searchParams.get('tkn')
      : (input.previewAccessToken ?? url.searchParams.get('tkn'));
  url.searchParams.delete('tkn');
  return { baseUrl: url.toString().replace(/\/$/, ''), previewAccessToken };
}

async function previewFetch(
  preview: string | PreviewAccess,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const { baseUrl, previewAccessToken } = parsePreviewAccess(preview);
  const headers = new Headers(init?.headers);
  if (previewAccessToken) {
    headers.set('x-daytona-preview-token', previewAccessToken);
  }
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

export async function waitForRuntimeHealth(
  preview: string | PreviewAccess,
  timeoutMs: number
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const response = await previewFetch(preview, '/global/health').catch(
      () => null
    );

    if (response?.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { healthy?: boolean }
        | null;
      if (payload?.healthy) {
        return true;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return false;
}

export async function createRuntimeSession(
  preview: string | PreviewAccess,
  title: string
): Promise<string> {
  const response = await previewFetch(preview, '/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create runtime session (${response.status})`);
  }
  const payload = (await response.json()) as { id: string };
  return payload.id;
}

export async function runtimeSessionExists(
  preview: string | PreviewAccess,
  runtimeSessionId: string
): Promise<boolean> {
  const response = await previewFetch(preview, `/session/${runtimeSessionId}`, {
    method: 'GET',
  });
  if (response.ok) {
    return true;
  }
  if (response.status === 404) {
    return false;
  }
  throw new Error(`Failed to load runtime session (${response.status})`);
}

export async function listRuntimeSessions(
  preview: string | PreviewAccess,
  limit = 50
): Promise<RuntimeSessionSummary[]> {
  const query = limit > 0 ? `?limit=${limit}` : '';
  const response = await previewFetch(preview, `/session${query}`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Failed to list runtime sessions (${response.status})`);
  }

  const payload = (await response.json()) as Array<{
    id?: string;
    title?: string;
    time?: { updated?: number };
  }>;

  return payload
    .filter((session) => typeof session.id === 'string')
    .map((session) => ({
      id: session.id as string,
      title: session.title ?? '',
      updatedAt: session.time?.updated,
    }));
}

export async function sendRuntimePrompt(
  preview: string | PreviewAccess,
  runtimeSessionId: string,
  text: string
): Promise<string> {
  const response = await previewFetch(
    preview,
    `/session/${runtimeSessionId}/message`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parts: [{ type: 'text', text }],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to send runtime prompt (${response.status})`);
  }

  const payload = (await response.json()) as {
    parts?: Array<{ type: string; text?: string; content?: string }>;
  };

  const textParts = (payload.parts ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text || part.content || '')
    .filter(Boolean);

  return textParts.join('\n\n') || '(No response from runtime)';
}
