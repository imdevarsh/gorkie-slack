import { sandbox as config } from '~/config';
import { clampNormalizedText, nonEmptyTrimString } from '~/utils/text';

interface ToolStartInput {
  args: unknown;
  status?: string;
  toolName: string;
}

interface ToolEndInput {
  args?: unknown;
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
  return nonEmptyTrimString(value);
}

function getArg(args: unknown, key: string, fallback: string): string {
  return asString(asRecord(args)?.[key]) ?? fallback;
}

function formatToolDetails(base: string, status?: string): string {
  const prefixed = status ? `${status} - ${base}` : base;
  return clampNormalizedText(prefixed, config.toolOutput.detailsMaxChars);
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

export function getToolTaskStart(input: ToolStartInput) {
  const { toolName, args, status } = input;

  const details = (() => {
    switch (toolName) {
      case 'bash':
        return formatToolDetails(
          getArg(args, 'command', 'running command'),
          status
        );
      case 'read':
        return formatToolDetails(
          `Reading ${getArg(args, 'path', 'file')}`,
          status
        );
      case 'write':
        return formatToolDetails(
          `Writing ${getArg(args, 'path', 'file')}`,
          status
        );
      case 'edit':
        return formatToolDetails(
          `Editing ${getArg(args, 'path', 'file')}`,
          status
        );
      case 'grep': {
        const argObj = asRecord(args);
        const pattern = asString(argObj?.pattern) ?? '<pattern>';
        const path = asString(argObj?.path) ?? '.';
        return formatToolDetails(`Searching "${pattern}" in ${path}`, status);
      }
      case 'find': {
        const argObj = asRecord(args);
        const pattern = asString(argObj?.pattern) ?? '<pattern>';
        const path = asString(argObj?.path) ?? '.';
        return formatToolDetails(`Finding "${pattern}" in ${path}`, status);
      }
      case 'ls':
        return formatToolDetails(
          `Listing ${getArg(args, 'path', '.')}`,
          status
        );
      case 'showFile':
        return formatToolDetails(
          `Uploading ${getArg(args, 'path', 'file')}`,
          status
        );
      default:
        return formatToolDetails(`Running ${toolName}`, status);
    }
  })();

  return {
    title: resolveTitle(toolName),
    details,
  };
}

export function getToolTaskEnd(input: ToolEndInput) {
  const { toolName, result, isError } = input;

  if (toolName === 'bash') {
    const rawOutput = extractTextResult(result) ?? '(no output)';
    return {
      output: clampNormalizedText(rawOutput, config.toolOutput.outputMaxChars),
    };
  }

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

  const text = extractTextResult(result);
  if (text) {
    return {
      output: clampNormalizedText(text, config.toolOutput.outputMaxChars),
    };
  }

  return { output: isError ? 'Tool failed' : 'Tool completed' };
}
