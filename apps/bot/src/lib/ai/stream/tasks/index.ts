import { clamp } from '@/lib/utils/text';
import {
  directMessage,
  fetchMessages,
  getChannelInfo,
  getUser,
  listThreads,
  message,
  reaction,
} from './chat';
import { defaultTool } from './default';
import { generateImage } from './generate-image';
import { getFile } from './get-file';
import { resultErrorOutput } from './helpers';
import { leaveThread } from './leave-thread';
import { mermaid } from './mermaid';
import { command, file, search } from './pi';
import { scheduleReminder } from './schedule-reminder';
import { searchSlack } from './search-slack';
import { searchWeb } from './search-web';
import { summarizeThread } from './summarize-thread';
import type { ToolTaskRendererEntry } from './types';
import { uploadFile } from './upload-file';

type RenderPhase = 'request' | 'response' | 'error';

const toolRenderers: Record<string, ToolTaskRendererEntry> = {
  addReaction: reaction,
  bash: command,
  compaction: { title: 'Compacting context' },
  edit: { ...file, title: 'Editing file' },
  fileChange: { ...file, title: 'File updated' },
  generateImage,
  getChannelInfo,
  getFile,
  getUser,
  glob: { ...search, title: 'Finding files' },
  grep: search,
  leaveThread,
  listThreads,
  ls: { title: 'Listing files' },
  mermaid,
  postChannelMessage: { ...message, title: 'Posting to channel' },
  postMessage: message,
  readConversationHistory: { ...fetchMessages, title: 'Reading history' },
  read: file,
  scheduleReminder,
  searchSlack,
  searchWeb,
  sendDirectMessage: directMessage,
  summarizeThread,
  uploadFile,
  write: { ...file, title: 'Writing file' },
};

export function renderToolTask({
  input,
  output,
  phase,
  toolName,
}: {
  input: unknown;
  output?: unknown;
  phase: RenderPhase;
  toolName: string;
}) {
  const entry = toolRenderers[toolName];
  const renderer =
    phase === 'error'
      ? defaultTool.error
      : (entry?.[phase] ?? defaultTool[phase]);
  const rendered = renderer({ input, output, toolName });
  const title = rendered.title ?? entry?.title ?? toolName;
  if (phase === 'request') {
    return {
      details: clamp(rendered.details, 96),
      title,
    };
  }
  return {
    output: clamp(
      phase === 'response'
        ? (resultErrorOutput(output) ?? rendered.output)
        : rendered.output,
      96
    ),
    title,
  };
}
