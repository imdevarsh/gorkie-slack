import logger from '~/lib/logger';

export function logReply(
  ctxId: string,
  author: string,
  result: {
    success?: boolean;
    response?: string;
    error?: string;
    toolCalls?: Array<{ toolName?: string }>;
  },
  reason?: string
) {
  if (result.success) {
    const tools = result.toolCalls
      ?.map((call) => call.toolName)
      .filter(Boolean);
    const summary = tools?.length
      ? tools.join(', ')
      : 'Completed tool execution';

    logger.info(
      `[${ctxId}] -> ${author}${reason ? ` (${reason})` : ''}: ${summary}`
    );
  } else if (result.error) {
    logger.error(
      { error: result.error },
      `[${ctxId}] Failed reply to ${author}`
    );
  }
}
