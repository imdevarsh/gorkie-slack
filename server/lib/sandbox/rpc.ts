import type { PtyHandle, PtyResult, Sandbox } from '@daytonaio/sdk';
import type { ImageContent } from '@mariozechner/pi-ai';
import { sandbox as config } from '~/config';
import { env } from '~/env';
import logger from '~/lib/logger';
import type {
  AgentEvent,
  AgentMessage,
  CompactionResult,
  PendingRequest,
  RpcCommand,
  RpcCommandBody,
  RpcEventListener,
  RpcResponse,
  RpcSessionState,
  ThinkingLevel,
} from '~/types/sandbox/rpc';
import { errorMessage } from '~/utils/error';

type BashResult = Extract<
  RpcResponse,
  { command: 'bash'; success: true }
>['data'];
type SessionStats = Extract<
  RpcResponse,
  { command: 'get_session_stats'; success: true }
>['data'];
type ModelInfo = Extract<
  RpcResponse,
  { command: 'get_available_models'; success: true }
>['data']['models'][number];

export class PiRpcClient {
  private buffer = '';
  private exited = false;
  private readonly exitPromise: Promise<never>;
  private rejectExit!: (error: Error) => void;
  private readonly listeners = new Set<RpcEventListener>();
  private readonly pending = new Map<string, PendingRequest>();
  private requestId = 0;
  private readonly pty: PtyHandle;

  constructor(pty: PtyHandle) {
    this.pty = pty;
    this.exitPromise = new Promise<never>((_, reject) => {
      this.rejectExit = reject;
    });
    this.exitPromise.catch(() => null);
  }

  handleProcessExit(result: PtyResult): void {
    if (this.exited) {
      return;
    }
    this.exited = true;

    const detail = result.error ?? `exit code ${result.exitCode ?? 'unknown'}`;
    const error = new Error(
      `[pi-rpc] Pi process exited unexpectedly (${detail})`
    );

    logger.warn(
      { exitCode: result.exitCode, error: result.error },
      '[pi-rpc] Pi process exited unexpectedly'
    );

    this.rejectExit(error);
    this.rejectPending(error);
  }

  handleStdout(chunk: string): void {
    this.buffer += chunk.replace(/\r/g, '');
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const obj = parsed as { type?: unknown; id?: unknown };
      if (obj.type === 'response') {
        const id = typeof obj.id === 'string' ? obj.id : undefined;
        if (id) {
          const req = this.pending.get(id);
          if (req) {
            this.pending.delete(id);
            req.resolve(parsed as RpcResponse);
          }
        }
        continue;
      }
      this.emit(parsed as AgentEvent);
    }
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        logger.warn({ err }, '[pi-rpc] Event listener threw');
      }
    }
  }

  onEvent(listener: RpcEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async prompt(message: string, images?: ImageContent[]): Promise<void> {
    await this.send({ type: 'prompt', message, images });
  }

  async steer(message: string, images?: ImageContent[]): Promise<void> {
    await this.send({ type: 'steer', message, images });
  }

  async followUp(message: string, images?: ImageContent[]): Promise<void> {
    await this.send({ type: 'follow_up', message, images });
  }

  async abort(): Promise<void> {
    await this.send({ type: 'abort' });
  }

  async newSession(parentSession?: string): Promise<{ cancelled: boolean }> {
    const res = await this.send({ type: 'new_session', parentSession });
    return this.getData(res);
  }

  async getState(): Promise<RpcSessionState> {
    const res = await this.send({ type: 'get_state' });
    return this.getData(res);
  }

  async setModel(
    provider: string,
    modelId: string
  ): Promise<{ provider: string; id: string }> {
    const res = await this.send({ type: 'set_model', provider, modelId });
    return this.getData(res);
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    const res = await this.send({ type: 'get_available_models' });
    return this.getData<{ models: ModelInfo[] }>(res).models;
  }

  async setThinkingLevel(level: ThinkingLevel): Promise<void> {
    await this.send({ type: 'set_thinking_level', level });
  }

  async cycleThinkingLevel(): Promise<{ level: ThinkingLevel } | null> {
    const res = await this.send({ type: 'cycle_thinking_level' });
    return this.getData(res);
  }

  async setSteeringMode(mode: 'all' | 'one-at-a-time'): Promise<void> {
    await this.send({ type: 'set_steering_mode', mode });
  }

  async setFollowUpMode(mode: 'all' | 'one-at-a-time'): Promise<void> {
    await this.send({ type: 'set_follow_up_mode', mode });
  }

  async compact(customInstructions?: string): Promise<CompactionResult> {
    const res = await this.send({ type: 'compact', customInstructions });
    return this.getData(res);
  }

  async setAutoCompaction(enabled: boolean): Promise<void> {
    await this.send({ type: 'set_auto_compaction', enabled });
  }

  async setAutoRetry(enabled: boolean): Promise<void> {
    await this.send({ type: 'set_auto_retry', enabled });
  }

  async abortRetry(): Promise<void> {
    await this.send({ type: 'abort_retry' });
  }

  async bash(command: string): Promise<BashResult> {
    const res = await this.send({ type: 'bash', command });
    return this.getData(res);
  }

  async abortBash(): Promise<void> {
    await this.send({ type: 'abort_bash' });
  }

  async switchSession(sessionPath: string): Promise<{ cancelled: boolean }> {
    const res = await this.send({ type: 'switch_session', sessionPath });
    return this.getData(res);
  }

  async getSessionStats(): Promise<SessionStats> {
    const res = await this.send({ type: 'get_session_stats' });
    return this.getData(res);
  }

  async exportHtml(outputPath?: string): Promise<{ path: string }> {
    const res = await this.send({ type: 'export_html', outputPath });
    return this.getData(res);
  }

  async getLastAssistantText(): Promise<string | null> {
    const res = await this.send({ type: 'get_last_assistant_text' });
    return this.getData<{ text: string | null }>(res).text;
  }

  async getMessages(): Promise<AgentMessage[]> {
    const res = await this.send({ type: 'get_messages' });
    return this.getData<{ messages: AgentMessage[] }>(res).messages;
  }

  async setSessionName(name: string): Promise<void> {
    await this.send({ type: 'set_session_name', name });
  }

  async waitUntilReady(): Promise<void> {
    const deadline = Date.now() + config.rpc.startupTimeoutMs;
    const attemptMs = 5000;
    const retryDelayMs = 500;
    let attempt = 0;
    let lastError: Error | undefined;

    while (Date.now() < deadline) {
      attempt++;
      try {
        await this.send(
          { type: 'get_state' },
          Math.min(attemptMs, deadline - Date.now())
        );
        if (attempt > 1) {
          logger.info({ attempt }, '[pi-rpc] Pi ready after retries');
        }
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    throw (
      lastError ??
      new Error(
        `[pi-rpc] Startup timed out after ${config.rpc.startupTimeoutMs}ms`
      )
    );
  }

  waitForIdle(): Promise<void> {
    const idlePromise = new Promise<void>((resolve) => {
      const off = this.onEvent((event) => {
        if (event.type === 'agent_end') {
          off();
          resolve();
        }
      });
    });
    return Promise.race([idlePromise, this.exitPromise]);
  }

  collectEvents(): Promise<AgentEvent[]> {
    const collectPromise = new Promise<AgentEvent[]>((resolve) => {
      const events: AgentEvent[] = [];
      const off = this.onEvent((event) => {
        events.push(event);
        if (event.type === 'agent_end') {
          off();
          resolve(events);
        }
      });
    });
    return Promise.race([collectPromise, this.exitPromise]);
  }

  async promptAndWait(
    message: string,
    images?: ImageContent[]
  ): Promise<AgentEvent[]> {
    const eventsPromise = this.collectEvents();
    await this.prompt(message, images);
    return eventsPromise;
  }

  async disconnect(): Promise<void> {
    this.exited = true;
    this.rejectPending(
      new Error('[pi-rpc] Client disconnected before response was received')
    );
    await this.pty.kill().catch(() => null);
    await this.pty.disconnect().catch(() => null);
  }

  private send(
    payload: RpcCommandBody,
    timeoutMs = config.rpc.commandTimeoutMs
  ): Promise<RpcResponse> {
    const id = `req_${++this.requestId}`;
    const command = { ...payload, id } as RpcCommand;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `[pi-rpc] Timeout waiting for response to "${payload.type}" (${timeoutMs}ms)`
          )
        );
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.pty
        .sendInput(`${JSON.stringify(command)}\n`)
        .catch((err: unknown) => {
          this.pending.delete(id);
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
  }

  private rejectPending(error: Error): void {
    for (const [id, request] of this.pending.entries()) {
      this.pending.delete(id);
      request.reject(error);
    }
  }

  private getData<T = unknown>(response: RpcResponse): T {
    if (!response.success) {
      const message = errorMessage(response.error);
      throw new Error(
        `[pi-rpc] Command "${response.command}" failed: ${message}`
      );
    }
    if (!('data' in response)) {
      return undefined as T;
    }
    return response.data as T;
  }
}

export async function boot(
  sandbox: Sandbox,
  sessionId?: string
): Promise<PiRpcClient> {
  const ptySessionId = `pi-${Date.now()}`;
  const decoder = new TextDecoder();
  let client: PiRpcClient | null = null;

  const pty = await sandbox.process.createPty({
    id: ptySessionId,
    cwd: config.runtime.workdir,
    envs: {
      HACKCLUB_API_KEY: env.HACKCLUB_API_KEY,
      HOME: config.runtime.workdir,
    },
    onData: (data) => {
      if (!client) {
        return;
      }
      client.handleStdout(decoder.decode(data, { stream: true }));
    },
  });

  await pty.waitForConnection();
  client = new PiRpcClient(pty);

  const piClient = client;
  pty
    .wait()
    .catch(() => null)
    .then((result) => piClient.handleProcessExit(result ?? {}));

  const command = sessionId
    ? `pi --mode rpc --session ${sessionId}`
    : 'pi --mode rpc';
  await pty.sendInput(`${command}\n`);
  await client.waitUntilReady();

  logger.info({ ptySessionId, sessionId }, '[pi-rpc] Pi process started');
  return client;
}
