import type { Thread } from 'chat';
import logger from '@/lib/logger';

// Slack renders a posted markdown message as a section block whose text caps at
// ~3000 chars, so a single reply must stay under that.
const MAX_CHUNK = 2900;
// Don't emit tiny fragments mid-stream — wait until there's enough to be worth a
// post, unless we're forced to flush or the buffer is getting large.
const MIN_BOUNDARY = 280;
const SOFT_FLUSH = 900;
const IDLE_FLUSH_MS = 1500;

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
    if (buffer.length > MAX_CHUNK) {
      return takeReplyChunk(hardCutIndex(buffer));
    }

    const boundary = streamBoundary(buffer);
    if (
      boundary !== undefined &&
      (force ||
        buffer.length >= SOFT_FLUSH ||
        Date.now() - lastPostAt >= IDLE_FLUSH_MS)
    ) {
      return takeReplyChunk(boundary);
    }

    return force ? takeReplyChunk(buffer.length) : undefined;
  }

  // Cut the buffer at `index`. If the cut lands inside an open code fence, close
  // it on this chunk and re-open it (same info string) on the remainder so each
  // posted message renders as valid markdown on its own.
  function takeReplyChunk(index: number): string {
    let chunk = buffer.slice(0, index);
    let rest = buffer.slice(index);

    const remainder = rest.replace(/^\n+/, '');
    const fence = openCodeFence(chunk);
    if (fence === null) {
      // A table too large for one message is cut between rows; repeat its header
      // so the continuation still renders as a table instead of loose rows.
      const header = continuedTableHeader({ chunk, remainder });
      rest = header ? `${header}\n${remainder}` : rest;
    } else {
      chunk = `${chunk.replace(/\s+$/, '')}\n\`\`\``;
      // Only re-open the fence when code actually remains, otherwise a stream
      // that ended mid-fence would loop forever re-opening an empty block.
      rest = remainder ? `\`\`\`${fence}\n${remainder}` : '';
    }

    buffer = rest;
    return chunk.trim();
  }
}

// A boundary safe to flush mid-stream: a paragraph or sentence break that is not
// inside an open code fence and does not split a table row. Returns undefined
// while inside an unterminated code fence so partial code never posts.
function streamBoundary(text: string): number | undefined {
  if (openCodeFence(text) !== null) {
    return;
  }

  const paragraph = text.lastIndexOf('\n\n');
  if (paragraph >= MIN_BOUNDARY) {
    return paragraph + 2;
  }

  const sentence = [...text.matchAll(/[.!?](?:["')\]]+)?\s+/g)].at(-1);
  if (
    sentence?.index !== undefined &&
    sentence.index >= MIN_BOUNDARY &&
    !cutSplitsTable(text, sentence.index + sentence[0].length)
  ) {
    return sentence.index + sentence[0].length;
  }

  const line = text.lastIndexOf('\n');
  if (line >= SOFT_FLUSH && !cutSplitsTable(text, line + 1)) {
    return line + 1;
  }

  return;
}

// The buffer exceeds one message, so it must be cut at <= MAX_CHUNK. Prefer the
// largest structural boundary that doesn't split a table row; fall back to a
// sentence, then a word, then a hard character cut. Code fences are re-opened by
// takeReplyChunk regardless of where the cut lands.
function hardCutIndex(text: string): number {
  const slice = text.slice(0, MAX_CHUNK);
  const floor = Math.floor(MAX_CHUNK / 3);

  const paragraph = slice.lastIndexOf('\n\n');
  if (paragraph >= floor) {
    return paragraph + 2;
  }

  const lineBreaks = [...slice.matchAll(/\n/g)]
    .map((match) => match.index + 1)
    .reverse();

  // Prefer a line break between non-table lines.
  const clean = lineBreaks.find(
    (index) => index >= floor && !cutSplitsTable(text, index)
  );
  if (clean !== undefined) {
    return clean;
  }

  // Otherwise cut between table rows (header is repeated by takeReplyChunk)
  // rather than slicing through the middle of a row.
  const rowBoundary = lineBreaks.find((index) => index >= floor);
  if (rowBoundary !== undefined) {
    return rowBoundary;
  }

  const sentence = [...slice.matchAll(/[.!?](?:["')\]]+)?\s+/g)].at(-1);
  if (sentence?.index !== undefined && sentence.index >= floor) {
    return sentence.index + sentence[0].length;
  }

  const space = slice.lastIndexOf(' ');
  return space >= floor ? space + 1 : MAX_CHUNK;
}

// The info string (language) of a code fence left open at the end of `text`, or
// null when every fence is balanced. Fences toggle: the first opens, the next
// closes.
function openCodeFence(text: string): string | null {
  let open: string | null = null;
  for (const line of text.split('\n')) {
    const fence = /^\s*(?:```|~~~)(.*)$/.exec(line);
    if (!fence) {
      continue;
    }
    open = open === null ? (fence[1] ?? '').trim() : null;
  }
  return open;
}

// Whether cutting at `index` would land between two table rows, which would
// strip the continuation rows of their header and break the table in Slack.
function cutSplitsTable(text: string, index: number): boolean {
  const before =
    text.slice(0, index).replace(/\n+$/, '').split('\n').at(-1) ?? '';
  const after = text.slice(index).replace(/^\n+/, '').split('\n')[0] ?? '';
  return looksLikeTableRow(before) && looksLikeTableRow(after);
}

// When a chunk ends inside a table and the remainder continues it, return that
// table's "header row + separator" so it can be re-prepended to the remainder.
// Returns null when the cut isn't inside a table or the header is already there.
function continuedTableHeader({
  chunk,
  remainder,
}: {
  chunk: string;
  remainder: string;
}): string | null {
  const lastLine = chunk.replace(/\n+$/, '').split('\n').at(-1) ?? '';
  const nextLine = remainder.split('\n')[0] ?? '';
  if (!(looksLikeTableRow(lastLine) && looksLikeTableRow(nextLine))) {
    return null;
  }

  const lines = chunk.replace(/\n+$/, '').split('\n');
  let start = lines.length;
  while (start > 0 && looksLikeTableRow(lines[start - 1] ?? '')) {
    start -= 1;
  }
  const header = lines[start];
  const separator = lines[start + 1];
  if (!(header && separator)) {
    return null;
  }
  if (!/^\|?[\s:|-]*-{2,}[\s:|-]*$/.test(separator.trim())) {
    return null;
  }

  const reopened = `${header}\n${separator}`;
  return remainder.startsWith(reopened) ? null : reopened;
}

function looksLikeTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (/^\|?[\s:|-]*-{2,}[\s:|-]*$/.test(trimmed)) {
    return true;
  }
  return (
    trimmed.startsWith('|') || (trimmed.includes('|') && trimmed.endsWith('|'))
  );
}
