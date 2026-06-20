import { StreamingMarkdownRenderer, type Thread } from 'chat';
import logger from '@/lib/logger';

// Slack rejects oversized messages (`msg_blocks_too_long`), so streamed prose is
// posted in pieces. We cut on blank-line boundaries — tables, lists and
// paragraphs never contain a blank line, so they stay intact; only fenced code
// can, which `openFence` guards. Each piece is healed through the SDK's
// `StreamingMarkdownRenderer` so a forced mid-paragraph cut still closes any
// dangling inline markers. See vercel/chat#408: once the Slack adapter owns
// length splitting, this whole module collapses into `thread.post(stream)`.
const MAX_POST = 11_000;
const MIN_CHUNK = 280;
const SOFT_FLUSH = 900;
const IDLE_MS = 1500;
const FENCE_REOPEN_PADDING = 3;

export function createLineReply({ threadId }: { threadId: string }) {
  let buffer = '';
  let lastPostAt = Date.now();

  async function drain({
    force,
    thread,
  }: {
    force: boolean;
    thread: Thread;
  }): Promise<void> {
    while (buffer.trim()) {
      const index = nextCut(force);
      if (index === undefined) {
        return;
      }
      const chunk = take(index);
      if (!chunk) {
        continue;
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

  function nextCut(force: boolean): number | undefined {
    if (buffer.length > MAX_POST) {
      return hardCut(buffer.slice(0, MAX_POST));
    }
    if (
      !force &&
      buffer.length < SOFT_FLUSH &&
      Date.now() - lastPostAt < IDLE_MS
    ) {
      return;
    }
    return (
      boundaryCut(force ? 0 : MIN_CHUNK) ?? (force ? buffer.length : undefined)
    );
  }

  function boundaryCut(threshold: number): number | undefined {
    const paragraph = buffer.lastIndexOf('\n\n') + 2;
    if (
      paragraph - 2 >= 0 &&
      paragraph >= threshold &&
      outsideFence(paragraph)
    ) {
      return paragraph;
    }
    const line = buffer.lastIndexOf('\n') + 1;
    if (line >= Math.max(threshold, SOFT_FLUSH) && outsideFence(line)) {
      return line;
    }
    return;
  }

  function outsideFence(index: number): boolean {
    return openFence(buffer.slice(0, index)) === null;
  }

  function take(index: number): string {
    const raw = buffer.slice(0, index);
    let rest = buffer.slice(index).replace(/^\n+/, '');
    const fence = openFence(raw);
    let chunk = raw;
    if (fence !== null) {
      chunk = `${raw.replace(/\s+$/, '')}\n\`\`\``;
      rest = rest ? `\`\`\`${fence}\n${rest}` : '';
    }
    buffer = rest;
    return heal(chunk);
  }

  return {
    append({ text, thread }: { text: string; thread: Thread }): Promise<void> {
      buffer += text;
      return drain({ force: false, thread });
    },
    flush({ thread }: { thread: Thread }): Promise<void> {
      return drain({ force: true, thread });
    },
  };
}

function hardCut(text: string): number {
  const floor = Math.floor(text.length / FENCE_REOPEN_PADDING);
  const paragraph = text.lastIndexOf('\n\n');
  if (paragraph >= floor) {
    return paragraph + 2;
  }
  const line = text.lastIndexOf('\n');
  return line >= floor ? line + 1 : text.length;
}

// Faithful for complete markdown (tables stay tables); closes incomplete inline
// markers (`**`, `` ` ``, `[`) left by a forced cut.
function heal(markdown: string): string {
  const renderer = new StreamingMarkdownRenderer();
  renderer.push(markdown);
  return renderer.finish().trim();
}

// Returns the language of the trailing unclosed code fence, or null if balanced.
function openFence(text: string): string | null {
  let open: string | null = null;
  for (const line of text.split('\n')) {
    const match = /^\s*(?:```|~~~)(.*)$/.exec(line);
    if (match) {
      open = open === null ? (match[1] ?? '').trim() : null;
    }
  }
  return open;
}
