import type { Process, Sandbox } from '@daytonaio/sdk';
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

export class PiRpcClient {
  private buffer = '';
  private readonly listeners = new Set<RpcEventListener>();
  private readonly pending = new Map<string, PendingRequest>();
  private requestId = 0;
  private readonly proc: Process;
  private readonly sessionId: string;
  private readonly cmdId: string;

  constructor(proc: Process, sessionId: string, cmdId: string) {
    this.proc = proc;
    this.sessionId = sessionId;
    this.cmdId = cmdId;
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

  async prompt(message: string): Promise<void> {
    await this.send({ type: 'prompt', message });
  }

  async steer(message: string): Promise<void> {
    await this.send({ type: 'steer', message });
  }

  async followUp(message: string): Promise<void> {
    await this.send({ type: 'follow_up', message });
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

  async setThinkingLevel(level: ThinkingLevel): Promise<void> {
    await this.send({ type: 'set_thinking_level', level });
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

  async bash(command: string): Promise<unknown> {
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

  waitForIdle(timeout = 60_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(
          new Error(`[pi-rpc] Timeout waiting for agent_end (${timeout}ms)`)
        );
      }, timeout);
      const off = this.onEvent((event) => {
        if (event.type === 'agent_end') {
          clearTimeout(timer);
          off();
          resolve();
        }
      });
    });
  }

  collectEvents(timeout = 60_000): Promise<AgentEvent[]> {
    return new Promise((resolve, reject) => {
      const events: AgentEvent[] = [];
      const timer = setTimeout(() => {
        off();
        reject(new Error(`[pi-rpc] Timeout collecting events (${timeout}ms)`));
      }, timeout);
      const off = this.onEvent((event) => {
        events.push(event);
        if (event.type === 'agent_end') {
          clearTimeout(timer);
          off();
          resolve(events);
        }
      });
    });
  }

  async promptAndWait(
    message: string,
    timeout = 60_000
  ): Promise<AgentEvent[]> {
    const eventsPromise = this.collectEvents(timeout);
    await this.prompt(message);
    return eventsPromise;
  }

  async disconnect(): Promise<void> {
    await this.proc.deleteSession(this.sessionId).catch(() => null);
  }

  private send(payload: RpcCommandBody): Promise<RpcResponse> {
    const id = `req_${++this.requestId}`;
    const command = { ...payload, id } as RpcCommand;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `[pi-rpc] Timeout waiting for response to "${payload.type}" (30s)`
          )
        );
      }, 30_000);

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

      this.proc
        .sendSessionCommandInput(
          this.sessionId,
          this.cmdId,
          `${JSON.stringify(command)}\n`
        )
        .catch((err: unknown) => {
          this.pending.delete(id);
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
  }

  private getData<T = unknown>(response: RpcResponse): T {
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data as T;
  }
}

export async function boot(
  sandbox: Sandbox,
  piSessionId?: string
): Promise<PiRpcClient> {
  const sessionId = `pi-${Date.now()}`;
  await sandbox.process.createSession(sessionId);

  const command = piSessionId
    ? `pi --mode rpc --session ${piSessionId}`
    : 'pi --mode rpc';

  const result = await sandbox.process.executeSessionCommand(
    sessionId,
    { command, runAsync: true },
    0
  );

  const client = new PiRpcClient(sandbox.process, sessionId, result.cmdId);

  sandbox.process
    .getSessionCommandLogs(
      sessionId,
      result.cmdId,
      (chunk) => client.handleStdout(chunk),
      () => {}
    )
    .catch((err: unknown) =>
      logger.warn({ err, sessionId }, '[pi-rpc] Stdout stream ended')
    );

  logger.info(
    { sessionId, cmdId: result.cmdId },
    '[pi-rpc] Pi process started'
  );
  return client;
}
