import { clamp } from '@/lib/utils/text';
import {
  fetchMessagesCall,
  fetchMessagesResult,
  fetchThreadResult,
  getChannelInfoResult,
  getUserResult,
  listThreadsResult,
  messageCall,
  messageResult,
  reactionCall,
  reactionResult,
} from './chat';
import {
  defaultToolCall,
  defaultToolError,
  defaultToolResult,
} from './default';
import { generateImageCall, generateImageResult } from './generate-image';
import { commandCall, fileCall, searchCall } from './pi';
import { searchSlackCall, searchSlackResult } from './search-slack';
import { searchWebCall, searchWebResult } from './search-web';
import { summarizeThreadCall, summarizeThreadResult } from './summarize-thread';
import type { ToolTaskRenderer } from './types';
import { uploadFileCall, uploadFileResult } from './upload-file';

const TOOL_TITLES: Record<string, string> = {
  addReaction: 'Adding reaction',
  bash: 'Running command',
  compaction: 'Compacting context',
  edit: 'Editing file',
  fetchChannelMessages: 'Reading channel',
  fetchMessages: 'Reading messages',
  fetchThread: 'Reading thread',
  fileChange: 'Updating file',
  generateImage: 'Generating image',
  getChannelInfo: 'Reading channel',
  getUser: 'Looking up user',
  glob: 'Finding files',
  grep: 'Searching files',
  listThreads: 'Listing threads',
  ls: 'Listing files',
  postChannelMessage: 'Posting to channel',
  postMessage: 'Sending message',
  read: 'Reading file',
  removeReaction: 'Removing reaction',
  searchSlack: 'Searching Slack',
  searchWeb: 'Searching the web',
  sendDirectMessage: 'Sending DM',
  summarizeThread: 'Summarizing thread',
  uploadFile: 'Uploading file',
  write: 'Writing file',
};

const callRenderers: Record<string, ToolTaskRenderer> = {
  addReaction: reactionCall,
  bash: commandCall,
  edit: fileCall,
  fetchChannelMessages: fetchMessagesCall,
  fetchMessages: fetchMessagesCall,
  generateImage: generateImageCall,
  glob: searchCall,
  grep: searchCall,
  postChannelMessage: messageCall,
  postMessage: messageCall,
  read: fileCall,
  removeReaction: reactionCall,
  searchSlack: searchSlackCall,
  searchWeb: searchWebCall,
  sendDirectMessage: messageCall,
  summarizeThread: summarizeThreadCall,
  uploadFile: uploadFileCall,
  write: fileCall,
};

const resultRenderers: Record<string, ToolTaskRenderer> = {
  addReaction: reactionResult,
  fetchChannelMessages: fetchMessagesResult,
  fetchMessages: fetchMessagesResult,
  fetchThread: fetchThreadResult,
  generateImage: generateImageResult,
  getChannelInfo: getChannelInfoResult,
  getUser: getUserResult,
  listThreads: listThreadsResult,
  postChannelMessage: messageResult,
  postMessage: messageResult,
  removeReaction: reactionResult,
  searchSlack: searchSlackResult,
  searchWeb: searchWebResult,
  sendDirectMessage: messageResult,
  summarizeThread: summarizeThreadResult,
  uploadFile: uploadFileResult,
};

function toolTitle(toolName: string): string {
  return TOOL_TITLES[toolName] ?? toolName;
}

export function renderToolCall({
  input,
  toolName,
}: {
  input: unknown;
  toolName: string;
}) {
  const rendered = (callRenderers[toolName] ?? defaultToolCall)({
    input,
    toolName,
  });
  return {
    details: rendered.details ? clamp(rendered.details, 180) : undefined,
    title: rendered.title ?? toolTitle(toolName),
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
  const rendered = (resultRenderers[toolName] ?? defaultToolResult)({
    input,
    output,
    toolName,
  });
  return {
    output: rendered.output ? clamp(rendered.output, 280) : undefined,
    title: rendered.title ?? toolTitle(toolName),
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
  const rendered = defaultToolError({ input, output, toolName });
  return {
    output: rendered.output ? clamp(rendered.output, 280) : undefined,
    title: rendered.title ?? toolTitle(toolName),
  };
}
