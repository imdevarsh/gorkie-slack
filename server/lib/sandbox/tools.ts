import { sandbox as config } from '~/config';
import { clampText } from '~/utils/text';
import {
  asRecord,
  asString,
  extractErrorResult,
  extractTextResult,
  getArg,
} from './tools-parse';

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

const toolTitles = {
  bash: 'Run command',
  read: 'Read file',
  write: 'Write file',
  edit: 'Edit file',
  grep: 'Search text',
  find: 'Find files',
  ls: 'List files',
  showFile: 'Upload file',
} as const;

function resolveTitle(toolName: string): string {
  const label = toolTitles[toolName as keyof typeof toolTitles] ?? toolName;

  return clampText(label, config.toolOutput.titleMaxChars);
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
      ? clampText(status, config.toolOutput.titleMaxChars)
      : resolveTitle(toolName),
    details: clampText(
      resolveDetails(toolName, args),
      config.toolOutput.detailsMaxChars
    ),
  };
}

export function getToolTaskEnd(input: ToolEndInput) {
  const { toolName, result, isError } = input;

  if (toolName === 'showFile') {
    const details = asRecord(result)?.details;
    const path = asString(asRecord(details)?.path);
    if (path) {
      return {
        output: clampText(`Uploaded ${path}`, config.toolOutput.outputMaxChars),
      };
    }
  }

  if (toolName === 'bash') {
    const text = extractTextResult(result);
    if (text) {
      return {
        output: `output:\n${clampText(text, config.toolOutput.outputMaxChars)}`,
      };
    }
    return {
      output: isError ? 'output:\ncommand failed' : 'output:\n',
    };
  }

  const text = extractTextResult(result);
  if (text) {
    return {
      output: clampText(text, config.toolOutput.outputMaxChars),
    };
  }

  if (isError) {
    return {
      output: clampText(
        extractErrorResult(result) ?? 'Tool execution failed',
        config.toolOutput.outputMaxChars
      ),
    };
  }

  return {};
}
