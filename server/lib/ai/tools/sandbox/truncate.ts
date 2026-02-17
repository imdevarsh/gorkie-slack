export const DEFAULT_MAX_LINES = 2000;
export const DEFAULT_MAX_BYTES = 50 * 1024;
export const GREP_MAX_LINE_LENGTH = 500;

export interface TruncationResult {
  content: string;
  truncated: boolean;
  truncatedBy: 'lines' | 'bytes' | null;
  totalLines: number;
  totalBytes: number;
  outputLines: number;
  outputBytes: number;
  lastLinePartial: boolean;
  firstLineExceedsLimit: boolean;
  maxLines: number;
  maxBytes: number;
}

interface TruncationOptions {
  maxLines?: number;
  maxBytes?: number;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function truncateLine(
  line: string,
  maxChars = GREP_MAX_LINE_LENGTH
): {
  text: string;
  wasTruncated: boolean;
} {
  if (line.length <= maxChars) {
    return { text: line, wasTruncated: false };
  }

  return {
    text: `${line.slice(0, maxChars)}... [truncated]`,
    wasTruncated: true,
  };
}

export function truncateHead(
  content: string,
  options: TruncationOptions = {}
): TruncationResult {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  const totalBytes = Buffer.byteLength(content, 'utf-8');
  const lines = content.split('\n');
  const totalLines = lines.length;

  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return {
      content,
      truncated: false,
      truncatedBy: null,
      totalLines,
      totalBytes,
      outputLines: totalLines,
      outputBytes: totalBytes,
      lastLinePartial: false,
      firstLineExceedsLimit: false,
      maxLines,
      maxBytes,
    };
  }

  const firstLine = lines[0] ?? '';
  const firstLineBytes = Buffer.byteLength(firstLine, 'utf-8');
  if (firstLineBytes > maxBytes) {
    return {
      content: '',
      truncated: true,
      truncatedBy: 'bytes',
      totalLines,
      totalBytes,
      outputLines: 0,
      outputBytes: 0,
      lastLinePartial: false,
      firstLineExceedsLimit: true,
      maxLines,
      maxBytes,
    };
  }

  const outputLines: string[] = [];
  let outputBytes = 0;
  let truncatedBy: 'lines' | 'bytes' = 'lines';

  for (let index = 0; index < lines.length && index < maxLines; index += 1) {
    const line = lines[index] ?? '';
    const lineBytes = Buffer.byteLength(line, 'utf-8') + (index > 0 ? 1 : 0);
    if (outputBytes + lineBytes > maxBytes) {
      truncatedBy = 'bytes';
      break;
    }

    outputLines.push(line);
    outputBytes += lineBytes;
  }

  if (outputLines.length >= maxLines && outputBytes <= maxBytes) {
    truncatedBy = 'lines';
  }

  const output = outputLines.join('\n');
  const outputBytesFinal = Buffer.byteLength(output, 'utf-8');
  return {
    content: output,
    truncated: true,
    truncatedBy,
    totalLines,
    totalBytes,
    outputLines: outputLines.length,
    outputBytes: outputBytesFinal,
    lastLinePartial: false,
    firstLineExceedsLimit: false,
    maxLines,
    maxBytes,
  };
}

function truncateStringToBytesFromEnd(str: string, maxBytes: number): string {
  const buffer = Buffer.from(str, 'utf-8');
  if (buffer.length <= maxBytes) {
    return str;
  }

  let start = buffer.length - maxBytes;
  // biome-ignore lint/suspicious/noBitwiseOperators: Required to detect UTF-8 continuation bytes.
  while (start < buffer.length && ((buffer[start] ?? 0) & 0xc0) === 0x80) {
    start += 1;
  }

  return buffer.slice(start).toString('utf-8');
}

export function truncateTail(
  content: string,
  options: TruncationOptions = {}
): TruncationResult {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  const totalBytes = Buffer.byteLength(content, 'utf-8');
  const lines = content.split('\n');
  const totalLines = lines.length;

  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return {
      content,
      truncated: false,
      truncatedBy: null,
      totalLines,
      totalBytes,
      outputLines: totalLines,
      outputBytes: totalBytes,
      lastLinePartial: false,
      firstLineExceedsLimit: false,
      maxLines,
      maxBytes,
    };
  }

  const outputLines: string[] = [];
  let outputBytes = 0;
  let truncatedBy: 'lines' | 'bytes' = 'lines';
  let lastLinePartial = false;

  for (
    let index = lines.length - 1;
    index >= 0 && outputLines.length < maxLines;
    index -= 1
  ) {
    const line = lines[index] ?? '';
    const lineBytes =
      Buffer.byteLength(line, 'utf-8') + (outputLines.length > 0 ? 1 : 0);

    if (outputBytes + lineBytes > maxBytes) {
      truncatedBy = 'bytes';
      if (outputLines.length === 0) {
        const partialLine = truncateStringToBytesFromEnd(line, maxBytes);
        outputLines.unshift(partialLine);
        outputBytes = Buffer.byteLength(partialLine, 'utf-8');
        lastLinePartial = true;
      }
      break;
    }

    outputLines.unshift(line);
    outputBytes += lineBytes;
  }

  if (outputLines.length >= maxLines && outputBytes <= maxBytes) {
    truncatedBy = 'lines';
  }

  const output = outputLines.join('\n');
  const outputBytesFinal = Buffer.byteLength(output, 'utf-8');
  return {
    content: output,
    truncated: true,
    truncatedBy,
    totalLines,
    totalBytes,
    outputLines: outputLines.length,
    outputBytes: outputBytesFinal,
    lastLinePartial,
    firstLineExceedsLimit: false,
    maxLines,
    maxBytes,
  };
}
