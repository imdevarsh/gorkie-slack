import type { Process, Sandbox } from '@daytonaio/sdk';
import logger from '../logger';

// Pi RPC event shapes — stdout, newline-delimited JSON.
// Official protocol docs: packages/coding-agent/RPC.md in pi-mono.
export type PiEvent =
  | { type: 'agent_start' }
  | {
      type: 'agent_end';
      messages?: unknown[];
    }
  | { type: 'turn_start' }
  | {
      type: 'turn_end';
      message?: unknown;
      toolResults?: unknown[];
    }
  | { type: 'message_start'; message?: unknown }
  | { type: 'message_end'; message?: unknown }
  | {
      type: 'message_update';
      message?: unknown;
      assistantMessageEvent: { type: string; delta?: string };
    }
  | {
      type: 'tool_execution_start';
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  | {
      type: 'tool_execution_update';
      toolCallId: string;
      toolName?: string;
      args?: Record<string, unknown>;
      partialResult: unknown;
    }
  | {
      type: 'tool_execution_end';
      toolCallId: string;
      toolName?: string;
      result: unknown;
      isError: boolean;
    }
  | { type: string; [key: string]: unknown };

type EventHandler = (event: PiEvent) => void;

export class PiRpcClient {
  private readonly process: Process;
  private readonly sessionId: string;
  private readonly cmdId: string;
  private buffer = '';
  private readonly handlers = new Set<EventHandler>();
  private completionResolve: (() => void) | null = null;

  constructor(process: Process, sessionId: string, cmdId: string) {
    this.process = process;
    this.sessionId = sessionId;
    this.cmdId = cmdId;
  }

  handleStdout(chunk: string): void {
    this.buffer += chunk.replace(/\r/g, '');

    const lines = this.buffer.split('\n');
    // Keep the last (potentially incomplete) line in the buffer.
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
        // Non-JSON startup text from Pi — ignore.
        continue;
      }

      // Skip command response lines — they have type "response" and are
      // correlated to commands we sent. We rely on agent_end for completion.
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        (parsed as { type?: unknown }).type === 'response'
      ) {
        continue;
      }

      this.dispatch(parsed as PiEvent);
    }
  }

  private dispatch(event: PiEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (err) {
        logger.warn({ err }, '[pi-rpc] Event handler threw');
      }
    }

    // agent_end signals the agent has fully completed the prompt turn,
    // including all tool calls and follow-up reasoning.
    if (event.type === 'agent_end') {
      this.completionResolve?.();
      this.completionResolve = null;
    }
  }

  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async sendPrompt(message: string): Promise<void> {
    // Pi RPC command format: {"type":"prompt","message":"..."}
    // Optionally include "id" for response correlation — omitted here
    // since we use agent_end events for completion rather than responses.
    const command = JSON.stringify({ type: 'prompt', message });
    await this.process.sendSessionCommandInput(
      this.sessionId,
      this.cmdId,
      `${command}\n`
    );

    await new Promise<void>((resolve) => {
      this.completionResolve = resolve;
    });
  }

  async disconnect(): Promise<void> {
    await this.process.deleteSession(this.sessionId).catch(() => null);
  }
}

export async function boot(sandbox: Sandbox): Promise<PiRpcClient> {
  const sessionId = `pi-${Date.now()}`;

  await sandbox.process.createSession(sessionId);

  const result = await sandbox.process.executeSessionCommand(
    sessionId,
    {
      command: 'pi --mode rpc',
      runAsync: true,
    },
    0
  );

  const client = new PiRpcClient(sandbox.process, sessionId, result.cmdId);

  // Stream Pi's stdout in the background for the lifetime of the process.
  const _stream = sandbox.process
    .getSessionCommandLogs(
      sessionId,
      result.cmdId,
      (chunk) => {
        client.handleStdout(chunk);
      },
      (_chunk) => {
        // stderr — ignore
      }
    )
    .catch((err: unknown) => {
      logger.warn({ err, sessionId }, '[pi-rpc] Stdout stream ended');
    });

  logger.info(
    { sessionId, cmdId: result.cmdId },
    '[pi-rpc] Pi process started'
  );

  return client;
}
