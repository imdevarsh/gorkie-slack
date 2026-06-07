import type { MCPServer, MCPToolMode } from '@repo/db/schema';
import { errorMessage } from '@repo/utils/error';
import { clampText } from '@repo/utils/text';
import type { ToolExecutionOptions } from 'ai';
import { mcp } from '@/config';
import { createTask, finishTask } from '@/lib/ai/utils/task';
import logger from '@/lib/logger';
import type { Stream } from '@/types';
import { formatToolName } from './format-tool-name';

export interface MCPToolMetadata {
  mcp: {
    server: { id: string; name: string };
    tool: { name: string; exposedName: string };
  };
}

function extractResultText(result: unknown): string {
  if (
    result &&
    typeof result === 'object' &&
    'content' in result &&
    Array.isArray(result.content)
  ) {
    const text = result.content
      .map((item) =>
        item &&
        typeof item === 'object' &&
        'type' in item &&
        item.type === 'text' &&
        'text' in item &&
        typeof item.text === 'string'
          ? item.text
          : ''
      )
      .filter(Boolean)
      .join('\n');
    return text || (JSON.stringify(result) ?? String(result));
  }
  return JSON.stringify(result) ?? String(result);
}

export function wrapMCPToolExecute({
  ctxId,
  execute,
  exposedName,
  mode,
  server,
  stream,
  taskTitle,
  toolName,
}: {
  ctxId: string;
  execute: (input: unknown, options: ToolExecutionOptions) => unknown;
  exposedName: string;
  mode: MCPToolMode;
  server: MCPServer;
  stream: Stream;
  taskTitle: string;
  toolName: string;
}) {
  return async (input: unknown, options: ToolExecutionOptions) => {
    const startedAt = Date.now();
    const details = clampText(
      `Input:\n${JSON.stringify(input, null, 2)}`,
      mcp.taskOutputMaxChars
    );
    const logCtx = {
      ctxId,
      exposedName,
      mode,
      serverId: server.id,
      serverName: server.name,
      toolCallId: options.toolCallId,
      toolName,
    };

    logger.info(
      {
        ...logCtx,
        input: clampText(
          JSON.stringify(input, null, 2),
          mcp.taskOutputMaxChars
        ),
      },
      '[mcp] Tool started'
    );

    if (mode === 'block') {
      const message = `Access denied by MCP settings for ${server.name}: ${toolName}.`;
      logger.warn(
        { ...logCtx, durationMs: Date.now() - startedAt },
        '[mcp] Tool blocked'
      );
      await createTask(stream, {
        taskId: options.toolCallId,
        title: `Denied ${server.name}: ${formatToolName(toolName)}`,
        details,
        status: 'in_progress',
      });
      await finishTask(stream, {
        taskId: options.toolCallId,
        status: 'complete',
        output: message,
      });
      return { content: [{ type: 'text', text: message }] };
    }

    await createTask(stream, {
      taskId: options.toolCallId,
      title: taskTitle,
      details,
      status: 'in_progress',
    });

    try {
      const result = await execute(input, options);
      const resultText = clampText(
        extractResultText(result),
        mcp.taskOutputMaxChars
      );
      const output = `Output:\n${resultText}`;
      logger.info(
        { ...logCtx, durationMs: Date.now() - startedAt, output: resultText },
        '[mcp] Tool completed'
      );
      await finishTask(stream, {
        taskId: options.toolCallId,
        status: 'complete',
        output,
      });
      return result;
    } catch (error) {
      const output = clampText(
        `Output:\n${errorMessage(error)}`,
        mcp.taskOutputMaxChars
      );
      logger.error(
        { err: error, ...logCtx, durationMs: Date.now() - startedAt, output },
        '[mcp] Tool failed'
      );
      await finishTask(stream, {
        taskId: options.toolCallId,
        status: 'error',
        output,
      });
      throw error;
    }
  };
}
