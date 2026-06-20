import {
  arrayLength,
  booleanField,
  errorOutput,
  field,
  numberField,
  plural,
  textField,
} from './helpers';
import type { DefaultToolTaskRenderer, ToolTaskRendererEntry } from './types';

export const defaultTool: DefaultToolTaskRenderer = {
  request: ({ input, toolName }) => {
    const detail =
      textField(input, 'command') ??
      textField(input, 'file_path') ??
      textField(input, 'pattern') ??
      textField(input, 'path') ??
      textField(input, 'query');
    return {
      details: detail ? `${toolName}: ${detail}` : undefined,
    };
  },
  response: ({ output }) => ({
    output:
      typeof output === 'string'
        ? output
        : (textField(output, 'text') ?? textField(output, 'error')),
  }),
  error: ({ output }) => ({
    output: errorOutput(output),
  }),
};

const command: ToolTaskRendererEntry = {
  title: 'Running command',
  request: ({ input }) => ({
    details: textField(input, 'command'),
  }),
};

const file: ToolTaskRendererEntry = {
  title: 'Reading file',
  request: ({ input }) => {
    const detail = textField(input, 'path') ?? textField(input, 'file_path');
    return { details: detail };
  },
};

const search: ToolTaskRendererEntry = {
  title: 'Searching files',
  request: ({ input }) => {
    const detail = textField(input, 'pattern') ?? textField(input, 'path');
    return { details: detail };
  },
};

const message: ToolTaskRendererEntry = {
  request: ({ input }) => ({
    details:
      textField(input, 'threadId') ??
      textField(input, 'channelId') ??
      textField(input, 'userId'),
  }),
  response: ({ output, toolName }) => ({
    output: `${toolName === 'sendDirectMessage' ? 'Sent DM' : 'Sent message'}${textField(output, 'threadId') ? ` in ${textField(output, 'threadId')}` : ''}.`,
    title: toolName === 'sendDirectMessage' ? 'Sent DM' : 'Sent message',
  }),
  title: 'Sending message',
};

const fetchMessages: ToolTaskRendererEntry = {
  request: ({ input }) => ({
    details: textField(input, 'threadId') ?? textField(input, 'channelId'),
  }),
  response: ({ input, output }) => {
    const count = arrayLength(output, 'messages') ?? 0;
    const target =
      textField(input, 'threadId') ?? textField(input, 'channelId');
    return {
      output:
        count === 0 && target
          ? `Read 0 messages from ${target}.`
          : `Read ${plural(count, 'message')}.`,
      title: 'Read messages',
    };
  },
  title: 'Reading messages',
};

const listThreads: ToolTaskRendererEntry = {
  response: ({ output }) => {
    const count = arrayLength(output, 'threads') ?? 0;
    return {
      output: `Found ${plural(count, 'thread')}.`,
      title: 'Listed threads',
    };
  },
  title: 'Listing threads',
};

const getUser: ToolTaskRendererEntry = {
  response: ({ input, output }) => {
    const name =
      textField(output, 'fullName') ??
      textField(output, 'userName') ??
      textField(input, 'userId');
    return {
      output: name ? `Found ${name}.` : 'User not found.',
      title: 'Looked up user',
    };
  },
  title: 'Looking up user',
};

const getChannelInfo: ToolTaskRendererEntry = {
  response: ({ output }) => {
    const name =
      textField(output, 'name') ?? textField(output, 'id') ?? 'channel';
    const members = numberField(output, 'memberCount');
    return {
      output: `${name}${members === undefined ? '' : ` · ${plural(members, 'member')}`}.`,
      title: 'Read channel',
    };
  },
  title: 'Reading channel',
};

const reaction: ToolTaskRendererEntry = {
  request: ({ input }) => ({
    details: textField(input, 'emoji') ?? textField(input, 'messageId'),
  }),
  response: ({ input, output }) => {
    const emoji =
      textField(output, 'emoji') ?? textField(input, 'emoji') ?? 'reaction';
    const added = booleanField(output, 'added');
    const action = added === false ? 'Could not update' : 'Added';
    return {
      output: `${action} :${emoji}:.`,
      title: 'Added reaction',
    };
  },
  title: 'Adding reaction',
};

const generateImage: ToolTaskRendererEntry = {
  title: 'Generating image',
  request: ({ input }) => ({
    details: textField(input, 'prompt'),
  }),
  response: ({ output }) => {
    const uploaded = numberField(output, 'uploaded') ?? 0;
    return {
      output: `Uploaded ${plural(uploaded, 'image')}.`,
      title: uploaded > 0 ? 'Generated image' : 'Image generation finished',
    };
  },
};

const mermaid: ToolTaskRendererEntry = {
  title: 'Creating diagram',
  request: ({ input }) => {
    const detail = textField(input, 'title') ?? textField(input, 'code');
    return { details: detail };
  },
  response: ({ output }) => {
    const error = textField(output, 'error');
    if (error) {
      return {
        output: `Error: ${error}`,
        title: 'Diagram failed',
      };
    }
    return {
      output: `Uploaded ${textField(output, 'title') ?? 'diagram'}.`,
      title: 'Created diagram',
    };
  },
};

const scheduleReminder: ToolTaskRendererEntry = {
  title: 'Scheduling reminder',
  request: ({ input }) => {
    const seconds = numberField(input, 'seconds');
    const text = textField(input, 'text');
    return {
      details: `${seconds ?? '?'}s${text ? ` · ${text}` : ''}`,
    };
  },
  response: ({ output }) => {
    const error = textField(output, 'error');
    if (error) {
      return {
        output: `Error: ${error}`,
        title: 'Reminder failed',
      };
    }
    return {
      output: `Scheduled for ${textField(output, 'scheduledFor') ?? textField(output, 'userId') ?? 'later'}.`,
      title: 'Scheduled reminder',
    };
  },
};

const searchSlack: ToolTaskRendererEntry = {
  title: 'Searching Slack',
  request: ({ input }) => ({
    details: textField(input, 'query'),
  }),
  response: ({ input, output }) => {
    const error = textField(output, 'error');
    if (error) {
      return {
        output: `Error: ${error}`,
        title: 'Slack search failed',
      };
    }
    const count = numberField(output, 'resultCount') ?? 0;
    const query = textField(input, 'query');
    return {
      output: `Found ${plural(count, 'Slack result')}${query ? ` for "${query}"` : ''}.`,
      title: 'Searched Slack',
    };
  },
};

const searchWeb: ToolTaskRendererEntry = {
  title: 'Searching the web',
  request: ({ input }) => ({
    details: textField(input, 'query'),
  }),
  response: ({ input, output }) => {
    const count = numberField(output, 'resultCount') ?? 0;
    const links = field(output, 'links');
    const topLinks = Array.isArray(links)
      ? links
          .filter((link): link is string => typeof link === 'string')
          .slice(0, 3)
      : [];
    const query = textField(input, 'query');
    return {
      output: `Found ${plural(count, 'web result')}${query ? ` for "${query}"` : ''}.${topLinks.length > 0 ? ` ${topLinks.join(', ')}` : ''}`,
      title: 'Searched the web',
    };
  },
};

const summarizeThread: ToolTaskRendererEntry = {
  title: 'Summarizing thread',
  request: ({ input }) => {
    const detail =
      textField(input, 'threadId') ?? textField(input, 'instructions');
    return { details: detail };
  },
  response: ({ output }) => {
    const error = textField(output, 'error');
    if (error) {
      return {
        output: `Error: ${error}`,
        title: 'Summary failed',
      };
    }
    const count = numberField(output, 'messageCount');
    return {
      output:
        count === undefined ? undefined : `Read ${plural(count, 'message')}.`,
      title: 'Summarized thread',
    };
  },
};

const uploadFile: ToolTaskRendererEntry = {
  title: 'Uploading file',
  request: ({ input }) => ({
    details: textField(input, 'path'),
  }),
  response: ({ input, output }) => {
    const filename =
      textField(output, 'filename') ??
      textField(input, 'filename') ??
      textField(input, 'path') ??
      'file';
    const uploaded = booleanField(output, 'uploaded');
    return {
      output:
        uploaded === false
          ? `Could not upload ${filename}.`
          : `Uploaded ${filename}.`,
      title: uploaded === false ? 'File upload failed' : 'Uploaded file',
    };
  },
};

export const toolRenderers: Record<string, ToolTaskRendererEntry> = {
  addReaction: reaction,
  bash: command,
  compaction: { title: 'Compacting context' },
  edit: { ...file, title: 'Editing file' },
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
  readConversationHistory: { ...fetchMessages, title: 'Reading history' },
  read: file,
  scheduleReminder,
  searchSlack,
  searchWeb,
  sendDirectMessage: { ...message, title: 'Sending DM' },
  skip: {
    title: 'Skipping',
    request: ({ input }) => ({ details: textField(input, 'reason') }),
  },
  summarizeThread,
  uploadFile,
  write: { ...file, title: 'Writing file' },
};
