import logger from '~/lib/logger';

export function logReply({
  ctxId,
  author,
  result,
  reason,
}: {
  ctxId: string;
  author: string;
  result: {
    success?: boolean;
    error?: string;
    toolCalls?: Array<{ toolName?: string }>;
  };
  reason?: string;
}) {
  if (result.success) {
    const tools = result.toolCalls?.map((c) => c.toolName).filter(Boolean);
    const summary = tools?.length
      ? tools.join(', ')
      : 'Completed tool execution';
    logger.info(
      { ctxId },
      `-> ${author}${reason ? ` (${reason})` : ''}: ${summary}`
    );
  } else if (result.error) {
    logger.error(
      { failure: result.error, ctxId },
      `Failed to reply to ${author}`
    );
  }
}
