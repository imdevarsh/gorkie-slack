import type { ImageContent } from '@earendil-works/pi-ai';
import { errorMessage } from '@repo/utils/error';
import { cleanTerminalText } from '@repo/utils/text';
import { sandbox as config } from '@/config';
import logger from '@/lib/logger';
import type {
  AgentMessage,
  AgentSessionEvent,
  CompactionResult,
  PendingRequest,
  PtyLike,
  RpcCommand,
  RpcCommandBody,
  RpcEventListener,
  RpcResponse,
  RpcSessionState,
  RpcSlashCommand,
  ThinkingLevel,
} from '@/types/sandbox/rpc';

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
interface CycleModelResult {
  isScoped: boolean;
  model: { provider: string; id: string };
  thinkingLevel: ThinkingLevel;
}

export class PiRpcClient {
  private buffer = '';
  private exited = false;
  private readonly exitPromise: Promise<never>;
  private rejectExit!: (error: Error) => void;
  private readonly listeners = new Set<RpcEventListener>();
  private readonly pending = new Map<string, PendingRequest>();
  private requestId = 0;
  private readonly pty: PtyLike;

  constructor(pty: PtyLike) {
    this.pty = pty;
    this.exitPromise = new Promise<never>((_, reject) => {
      this.rejectExit = reject;
    });
    this.exitPromise.catch(() => null);
  }

  // --- I/O handlers (called by the sandbox layer) ---

  handleProcessExit(result: { exitCode?: number; error?: string }): void {
    if (this.exited) {
      return;
    }
    const detail = result.error ?? `exit code ${result.exitCode ?? 'unknown'}`;
    logger.warn(
      { exitCode: result.exitCode, error: result.error },
      '[pi-rpc] Pi process exited unexpectedly'
    );
    this.finishWithError(
      new Error(`[pi-rpc] Pi process exited unexpectedly (${detail})`)
    );
  }

  handleStdout(chunk: string): void {
    this.buffer += cleanTerminalText(chunk);
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
        logger.debug({ line: trimmed }, '[pi-rpc] stdout');
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
      this.emit(parsed as AgentSessionEvent);
    }
  }

  // --- event subscription ---

  onEvent(listener: RpcEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // --- prompting ---

  async prompt(message: string, images?: ImageContent[]): Promise<void> {
    await this.send({ type: 'prompt', message, images });
  }

  async steer(message: string, images?: ImageContent[]): Promise<void> {
    await this.send({ type: 'steer', message, images });
  }

  async followUp(message: string, images?: ImageContent[]): Promise<void> {
    await this.send({ type: 'follow_up', message, images });
  }

  async promptAndWait(
    message: string,
    images?: ImageContent[]
  ): Promise<AgentSessionEvent[]> {
    const eventsPromise = this.collectEvents();
    await this.prompt(message, images);
    return eventsPromise;
  }

  // --- agent control ---

  async abort(): Promise<void> {
    await this.cmd({ type: 'abort' });
  }

  async abortRetry(): Promise<void> {
    await this.cmd({ type: 'abort_retry' });
  }

  async abortBash(): Promise<void> {
    await this.cmd({ type: 'abort_bash' });
  }

  // --- session ---

  getState(): Promise<RpcSessionState> {
    return this.cmd({ type: 'get_state' });
  }

  newSession(parentSession?: string): Promise<{ cancelled: boolean }> {
    return this.cmd({ type: 'new_session', parentSession });
  }

  switchSession(sessionPath: string): Promise<{ cancelled: boolean }> {
    return this.cmd({ type: 'switch_session', sessionPath });
  }

  clone(): Promise<{ cancelled: boolean }> {
    return this.cmd({ type: 'clone' });
  }

  fork(entryId: string): Promise<{ text: string; cancelled: boolean }> {
    return this.cmd({ type: 'fork', entryId });
  }

  async getForkMessages(): Promise<Array<{ entryId: string; text: string }>> {
    return (
      await this.cmd<{ messages: Array<{ entryId: string; text: string }> }>({
        type: 'get_fork_messages',
      })
    ).messages;
  }

  async setSessionName(name: string): Promise<void> {
    await this.cmd({ type: 'set_session_name', name });
  }

  getSessionStats(): Promise<SessionStats> {
    return this.cmd({ type: 'get_session_stats' });
  }

  exportHtml(outputPath?: string): Promise<{ path: string }> {
    return this.cmd({ type: 'export_html', outputPath });
  }

  async getLastAssistantText(): Promise<string | null> {
    return (
      await this.cmd<{ text: string | null }>({
        type: 'get_last_assistant_text',
      })
    ).text;
  }

  async getMessages(): Promise<AgentMessage[]> {
    return (
      await this.cmd<{ messages: AgentMessage[] }>({ type: 'get_messages' })
    ).messages;
  }

  async getCommands(): Promise<RpcSlashCommand[]> {
    return (
      await this.cmd<{ commands: RpcSlashCommand[] }>({ type: 'get_commands' })
    ).commands;
  }

  // --- model ---

  setModel(
    provider: string,
    modelId: string
  ): Promise<{ provider: string; id: string }> {
    return this.cmd({ type: 'set_model', provider, modelId });
  }

  cycleModel(): Promise<CycleModelResult | null> {
    return this.cmd({ type: 'cycle_model' });
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    return (
      await this.cmd<{ models: ModelInfo[] }>({ type: 'get_available_models' })
    ).models;
  }

  // --- thinking ---

  async setThinkingLevel(level: ThinkingLevel): Promise<void> {
    await this.cmd({ type: 'set_thinking_level', level });
  }

  cycleThinkingLevel(): Promise<{ level: ThinkingLevel } | null> {
    return this.cmd({ type: 'cycle_thinking_level' });
  }

  // --- steering / follow-up modes ---

  async setSteeringMode(mode: 'all' | 'one-at-a-time'): Promise<void> {
    await this.cmd({ type: 'set_steering_mode', mode });
  }

  async setFollowUpMode(mode: 'all' | 'one-at-a-time'): Promise<void> {
    await this.cmd({ type: 'set_follow_up_mode', mode });
  }

  // --- compaction / retry ---

  compact(customInstructions?: string): Promise<CompactionResult> {
    return this.cmd({ type: 'compact', customInstructions });
  }

  async setAutoCompaction(enabled: boolean): Promise<void> {
    await this.cmd({ type: 'set_auto_compaction', enabled });
  }

  async setAutoRetry(enabled: boolean): Promise<void> {
    await this.cmd({ type: 'set_auto_retry', enabled });
  }

  // --- bash ---

  bash(command: string): Promise<BashResult> {
    return this.cmd({ type: 'bash', command });
  }

  // --- lifecycle ---

  async waitUntilReady(): Promise<void> {
    const deadline = Date.now() + config.rpc.startupTimeout;
    const attemptMs = 5000;
    const retryDelayMs = 500;
    let attempt = 0;

    while (Date.now() < deadline) {
      attempt++;
      try {
        await Promise.race([
          this.send(
            { type: 'get_state' },
            Math.min(attemptMs, deadline - Date.now())
          ),
          this.exitPromise,
        ]);
        if (attempt > 1) {
          logger.info({ attempt }, '[pi-rpc] Pi ready after retries');
        }
        return;
      } catch (err) {
        if (this.exited) {
          throw err instanceof Error ? err : new Error(String(err));
        }
        await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    throw new Error(
      `[pi-rpc] Startup timed out after ${config.rpc.startupTimeout}ms`
    );
  }

  async waitForIdle(timeoutMs?: number): Promise<void> {
    let off: () => void = () => undefined;
    try {
      await Promise.race([
        new Promise<void>((resolve) => {
          off = this.onEvent((event) => {
            if (event.type === 'agent_end' && !event.willRetry) {
              resolve();
            }
          });
        }),
        this.exitPromise,
        ...(timeoutMs === undefined
          ? []
          : [this.timeoutReject<void>(timeoutMs, 'waitForIdle')]),
      ]);
    } finally {
      off();
    }
  }

  async collectEvents(timeoutMs?: number): Promise<AgentSessionEvent[]> {
    let off: () => void = () => undefined;
    try {
      return await Promise.race([
        new Promise<AgentSessionEvent[]>((resolve) => {
          const events: AgentSessionEvent[] = [];
          off = this.onEvent((event) => {
            events.push(event);
            if (event.type === 'agent_end' && !event.willRetry) {
              resolve(events);
            }
          });
        }),
        this.exitPromise,
        ...(timeoutMs === undefined
          ? []
          : [
              this.timeoutReject<AgentSessionEvent[]>(
                timeoutMs,
                'collectEvents'
              ),
            ]),
      ]);
    } finally {
      off();
    }
  }

  async disconnect(): Promise<void> {
    this.finishWithError(
      new Error('[pi-rpc] Client disconnected before response was received')
    );
    await this.pty.kill().catch(() => null);
    await this.pty.disconnect().catch(() => null);
  }

  // --- private ---

  private emit(event: AgentSessionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        logger.warn({ err }, '[pi-rpc] Event listener threw');
      }
    }
  }

  private async cmd<T = undefined>(payload: RpcCommandBody): Promise<T> {
    return this.getData<T>(await this.send(payload));
  }

  private timeoutReject<T>(ms: number, label: string): Promise<T> {
    return new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`[pi-rpc] ${label} timed out after ${ms}ms`)),
        ms
      )
    );
  }

  private send(
    payload: RpcCommandBody,
    timeoutMs = config.rpc.commandTimeout
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

  private finishWithError(error: Error): void {
    if (this.exited) {
      return;
    }
    this.exited = true;
    this.rejectExit(error);
    for (const req of this.pending.values()) {
      req.reject(error);
    }
    this.pending.clear();
  }

  private getData<T = undefined>(response: RpcResponse): T {
    if (!response.success) {
      throw new Error(
        `[pi-rpc] Command "${response.command}" failed: ${errorMessage(response.error)}`
      );
    }
    return ('data' in response ? response.data : undefined) as T;
  }
}
