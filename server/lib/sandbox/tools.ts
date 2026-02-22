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

interface ToolTaskStart {
  details: string;
  title: string;
}

interface ToolTaskEnd {
  output: string;
}

const MAX_DETAILS_LENGTH = 180;
const MAX_OUTPUT_LENGTH = 260;

function clampText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}...`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function extractTextResult(result: unknown): string | undefined {
  const record = asRecord(result);
  const content = record?.content;
  if (!Array.isArray(content)) {
    return undefined;
  }

  const chunks: string[] = [];
  for (const item of content) {
    const contentPart = asRecord(item);
    if (contentPart?.type !== 'text') {
      continue;
    }
    const text = asString(contentPart.text);
    if (text) {
      chunks.push(text);
    }
  }

  const joined = chunks.join('\n').trim();
  return joined.length > 0 ? joined : undefined;
}

function withStatusDetails(base: string, status?: string): string {
  if (!status) {
    return base;
  }
  return clampText(`${status}: ${base}`, MAX_DETAILS_LENGTH);
}

function resolveTitle(toolName: string, status?: string): string {
  return status ? clampText(status, 60) : toolName;
}

function handleBashTool(input: ToolStartInput): ToolTaskStart {
  const command = asString(asRecord(input.args)?.command) ?? 'running command';
  return {
    title: resolveTitle('bash', input.status),
    details: withStatusDetails(`$ ${command}`, input.status),
  };
}

function handleReadTool(input: ToolStartInput): ToolTaskStart {
  const path = asString(asRecord(input.args)?.path) ?? 'file';
  return {
    title: resolveTitle('read', input.status),
    details: withStatusDetails(`Reading ${path}`, input.status),
  };
}

function handleWriteTool(input: ToolStartInput): ToolTaskStart {
  const path = asString(asRecord(input.args)?.path) ?? 'file';
  return {
    title: resolveTitle('write', input.status),
    details: withStatusDetails(`Writing ${path}`, input.status),
  };
}

function handleEditTool(input: ToolStartInput): ToolTaskStart {
  const path = asString(asRecord(input.args)?.path) ?? 'file';
  return {
    title: resolveTitle('edit', input.status),
    details: withStatusDetails(`Editing ${path}`, input.status),
  };
}

function handleGrepTool(input: ToolStartInput): ToolTaskStart {
  const args = asRecord(input.args);
  const pattern = asString(args?.pattern) ?? '<pattern>';
  const path = asString(args?.path) ?? '.';
  return {
    title: resolveTitle('grep', input.status),
    details: withStatusDetails(`Searching "${pattern}" in ${path}`, input.status),
  };
}

function handleFindTool(input: ToolStartInput): ToolTaskStart {
  const args = asRecord(input.args);
  const pattern = asString(args?.pattern) ?? '<pattern>';
  const path = asString(args?.path) ?? '.';
  return {
    title: resolveTitle('find', input.status),
    details: withStatusDetails(`Finding "${pattern}" in ${path}`, input.status),
  };
}

function handleLsTool(input: ToolStartInput): ToolTaskStart {
  const path = asString(asRecord(input.args)?.path) ?? '.';
  return {
    title: resolveTitle('ls', input.status),
    details: withStatusDetails(`Listing ${path}`, input.status),
  };
}

function handleShowFileTool(input: ToolStartInput): ToolTaskStart {
  const path = asString(asRecord(input.args)?.path) ?? 'file';
  return {
    title: resolveTitle('showFile', input.status),
    details: withStatusDetails(`Uploading ${path}`, input.status),
  };
}

function defaultToolStart(input: ToolStartInput): ToolTaskStart {
  return {
    title: resolveTitle(input.toolName, input.status),
    details: withStatusDetails(`Running ${input.toolName}`, input.status),
  };
}

function defaultToolEnd(input: ToolEndInput): ToolTaskEnd {
  const text = extractTextResult(input.result);
  if (text) {
    return { output: clampText(text, MAX_OUTPUT_LENGTH) };
  }
  return {
    output: input.isError ? 'Tool failed' : 'Tool completed',
  };
}

function handleShowFileEnd(input: ToolEndInput): ToolTaskEnd {
  const details = asRecord(input.result)?.details;
  const path = asString(asRecord(details)?.path);
  if (path) {
    return {
      output: clampText(`Uploaded ${path}`, MAX_OUTPUT_LENGTH),
    };
  }
  return defaultToolEnd(input);
}

export function getToolTaskStart(input: ToolStartInput): ToolTaskStart {
  switch (input.toolName) {
    case 'bash':
      return handleBashTool(input);
    case 'read':
      return handleReadTool(input);
    case 'write':
      return handleWriteTool(input);
    case 'edit':
      return handleEditTool(input);
    case 'grep':
      return handleGrepTool(input);
    case 'find':
      return handleFindTool(input);
    case 'ls':
      return handleLsTool(input);
    case 'showFile':
      return handleShowFileTool(input);
    default:
      return defaultToolStart(input);
  }
}

export function getToolTaskEnd(input: ToolEndInput): ToolTaskEnd {
  if (input.toolName === 'showFile') {
    return handleShowFileEnd(input);
  }
  return defaultToolEnd(input);
}
