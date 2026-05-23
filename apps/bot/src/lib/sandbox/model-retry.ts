import type { PiRpcClient } from '@/lib/sandbox/rpc/client';

export async function runInference({
  client,
  prompt,
  timeoutPromise,
}: {
  client: PiRpcClient;
  prompt: string;
  timeoutPromise: Promise<never>;
}): Promise<void> {
  const idle = client.waitForIdle();
  await client.prompt(prompt);
  await Promise.race([idle, timeoutPromise]);
}
