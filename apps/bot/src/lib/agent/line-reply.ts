import type { Thread } from 'chat';
import logger from '@/lib/logger';

export function createLineReply({ threadId }: { threadId: string }) {
  let buffer = '';
  let lastPostAt = Date.now();

  return {
    async append({
      text,
      thread,
    }: {
      text: string;
      thread: Thread;
    }): Promise<void> {
      buffer += text;
      await flushReplyChunks({ force: false, thread });
    },
    async flush({ thread }: { thread: Thread }): Promise<void> {
      await flushReplyChunks({ force: true, thread });
    },
  };

  async function flushReplyChunks({
    force,
    thread,
  }: {
    force: boolean;
    thread: Thread;
  }): Promise<void> {
    while (buffer.trim()) {
      const chunk = nextReplyChunk({ force });
      if (!chunk) {
        return;
      }
      await thread
        .post({ markdown: chunk })
        .then(() => {
          lastPostAt = Date.now();
        })
        .catch((error: unknown) => {
          logger.warn({ err: error, threadId }, '[agent] line reply failed');
        });
    }
  }

  function nextReplyChunk({ force }: { force: boolean }): string | undefined {
    if (buffer.length > 2500) {
      return takeReplyChunk(
        boundaryBefore(buffer.slice(0, 2500)) ??
          (buffer.slice(0, 2500).lastIndexOf(' ') + 1 || 2500)
      );
    }

    const boundary = boundaryBefore(buffer);
    if (
      boundary &&
      (force || buffer.length >= 900 || Date.now() - lastPostAt >= 1500)
    ) {
      return takeReplyChunk(boundary);
    }

    return force ? takeReplyChunk(buffer.length) : undefined;
  }

  function takeReplyChunk(index: number): string {
    const chunk = buffer.slice(0, index).trim();
    buffer = buffer.slice(index);
    return chunk;
  }
}

function boundaryBefore(text: string): number | undefined {
  if ((text.match(/```/g)?.length ?? 0) % 2 === 1) {
    return;
  }

  const paragraph = text.lastIndexOf('\n\n');
  if (paragraph >= 250) {
    return paragraph + 2;
  }

  const sentence = [...text.matchAll(/[.!?](?:["')\]]+)?\s+/g)].at(-1);
  if (sentence?.index !== undefined && sentence.index >= 250) {
    return sentence.index + sentence[0].length;
  }

  const line = text.lastIndexOf('\n');
  return line >= 900 ? line + 1 : undefined;
}
