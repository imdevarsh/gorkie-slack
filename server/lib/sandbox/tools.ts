import { sandbox as config } from '~/config';
import {
  clampNormalizedText,
  nonEmptyTrimString,
  sanitizeDisplayText,
} from '~/utils/text';

interface ToolStartInput {
  args: unknown;
  status?: string;
  toolName: string;
}

interface ToolEndInput {
  isError: boolean;
  result: unknown;
  toolName: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return nonEmptyTrimString(sanitizeDisplayText(value));
}

function getArg(args: unknown, key: string, fallback: string): string {
  return nonEmptyTrimString(asRecord(args)?.[key]) ?? fallback;
}

function resolveTitle(toolName: string): string {
  const label = (() => {
    switch (toolName) {
      case 'bash':
        return 'Run command';
      case 'read':
        return 'Read file';
      case 'write':
        return 'Write file';
      case 'edit':
        return 'Edit file';
      case 'grep':
        return 'Search text';
      case 'find':
        return 'Find files';
      case 'ls':
        return 'List files';
      case 'showFile':
        return 'Upload file';
      default:
        return toolName;
    }
  })();

  return clampNormalizedText(label, config.toolOutput.titleMaxChars);
}

function extractTextResult(result: unknown): string | undefined {
  const content = asRecord(result)?.content;
  if (!Array.isArray(content)) {
    return undefined;
  }

  const chunks: string[] = [];
  for (const item of content) {
    const part = asRecord(item);
    if (part?.type !== 'text') {
      continue;
    }
    const text = asString(part.text);
    if (text) {
      chunks.push(text);
    }
  }

  const joined = chunks.join('\n').trim();
  return joined.length > 0 ? joined : undefined;
}

function resolveDetails(toolName: string, args: unknown): string {
  switch (toolName) {
    case 'bash':
      return `input:\n\n${getArg(args, 'command', 'running command')}`;
    case 'read':
      return `Reading ${getArg(args, 'path', 'file')}`;
    case 'write':
      return `Writing ${getArg(args, 'path', 'file')}`;
    case 'edit':
      return `Editing ${getArg(args, 'path', 'file')}`;
    case 'grep': {
      const argObj = asRecord(args);
      const pattern = asString(argObj?.pattern) ?? '<pattern>';
      const path = asString(argObj?.path) ?? '.';
      return `Searching "${pattern}" in ${path}`;
    }
    case 'find': {
      const argObj = asRecord(args);
      const pattern = asString(argObj?.pattern) ?? '<pattern>';
      const path = asString(argObj?.path) ?? '.';
      return `Finding "${pattern}" in ${path}`;
    }
    case 'ls':
      return `Listing ${getArg(args, 'path', '.')}`;
    case 'showFile':
      return `Uploading ${getArg(args, 'path', 'file')}`;
    default:
      return `Running ${toolName}`;
  }
}

export function getToolTaskStart(input: ToolStartInput) {
  const { toolName, args, status } = input;

  return {
    title: status
      ? clampNormalizedText(status, config.toolOutput.titleMaxChars)
      : resolveTitle(toolName),
    details: clampNormalizedText(
      resolveDetails(toolName, args),
      config.toolOutput.detailsMaxChars
    ),
  };
}

export function getToolTaskEnd(input: ToolEndInput) {
  const { toolName, result } = input;

  if (toolName === 'showFile') {
    const details = asRecord(result)?.details;
    const path = asString(asRecord(details)?.path);
    if (path) {
      return {
        output: clampNormalizedText(
          `Uploaded ${path}`,
          config.toolOutput.outputMaxChars
        ),
      };
    }
  }

  if (toolName === 'bash') {
    const text = extractTextResult(result);
    return {
      output: text
        ? `output:\n${clampNormalizedText(text, config.toolOutput.outputMaxChars)}`
        : 'output:\ncommand failed',
    };
  }

  const text = extractTextResult(result);
  if (text) {
    return {
      output: clampNormalizedText(text, config.toolOutput.outputMaxChars),
    };
  }

  return {};
}
