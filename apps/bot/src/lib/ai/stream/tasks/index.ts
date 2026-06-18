import { clamp } from '@/lib/utils/text';
import {
  fetchMessages,
  fetchThread,
  getChannelInfo,
  getUser,
  listThreads,
  message,
  reaction,
} from './chat';
import { defaultTool } from './default';
import { generateImage } from './generate-image';
import { mermaid } from './mermaid';
import { command, file, search } from './pi';
import { scheduleReminder } from './schedule-reminder';
import { searchSlack } from './search-slack';
import { searchWeb } from './search-web';
import { summarizeThread } from './summarize-thread';
import type { ToolTaskRendererEntry } from './types';
import { uploadFile } from './upload-file';

const toolRenderers: Record<string, ToolTaskRendererEntry> = {
  addReaction: reaction,
  bash: command,
  compaction: { title: 'Compacting context' },
  edit: { ...file, title: 'Editing file' },
  fetchChannelMessages: { ...fetchMessages, title: 'Reading channel' },
  fetchMessages,
  fetchThread,
  fileChange: { title: 'Updating file' },
  generateImage,
  getChannelInfo,
  getUser,
  glob: { ...search, title: 'Finding files' },
  grep: search,
  listThreads,
  ls: { title: 'Listing files' },
  mermaid,
  postChannelMessage: { ...message, title: 'Posting to channel' },
  postMessage: message,
  read: file,
  removeReaction: { ...reaction, title: 'Removing reaction' },
  scheduleReminder,
  searchSlack,
  searchWeb,
  sendDirectMessage: { ...message, title: 'Sending DM' },
  summarizeThread,
  uploadFile,
  write: { ...file, title: 'Writing file' },
};

export function renderToolCall({
  input,
  toolName,
}: {
  input: unknown;
  toolName: string;
}) {
  const entry = toolRenderers[toolName];
  const rendered = (entry?.request ?? defaultTool.request)({
    input,
    toolName,
  });
  return {
    details: clamp(rendered.details, 180),
    title: rendered.title ?? entry?.title ?? toolName,
  };
}

export function renderToolResult({
  input,
  output,
  toolName,
}: {
  input: unknown;
  output: unknown;
  toolName: string;
}) {
  const entry = toolRenderers[toolName];
  const rendered = (entry?.response ?? defaultTool.response)({
    input,
    output,
    toolName,
  });
  return {
    output: clamp(rendered.output),
    title: rendered.title ?? entry?.title ?? toolName,
  };
}

export function renderToolError({
  input,
  output,
  toolName,
}: {
  input: unknown;
  output: unknown;
  toolName: string;
}) {
  const entry = toolRenderers[toolName];
  const rendered = defaultTool.error({ input, output, toolName });
  return {
    output: clamp(rendered.output),
    title: rendered.title ?? entry?.title ?? toolName,
  };
}
