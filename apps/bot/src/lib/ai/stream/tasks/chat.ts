import {
  arrayLength,
  booleanField,
  numberField,
  plural,
  textField,
} from './helpers';
import type { ToolTaskRendererEntry } from './types';

export const message: ToolTaskRendererEntry = {
  request: ({ input }) => ({
    details:
      textField(input, 'id') ??
      textField(input, 'threadId') ??
      textField(input, 'channelId') ??
      textField(input, 'userId'),
  }),
  response: ({ output }) => ({
    output: `Sent message${textField(output, 'threadId') ? ` in ${textField(output, 'threadId')}` : ''}.`,
    title: 'Sent message',
  }),
  title: 'Sending message',
};

export const fetchMessages: ToolTaskRendererEntry = {
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

export const listThreads: ToolTaskRendererEntry = {
  response: ({ output }) => {
    const count = arrayLength(output, 'threads') ?? 0;
    return {
      output: `Found ${plural(count, 'thread')}.`,
      title: 'Listed threads',
    };
  },
  title: 'Listing threads',
};

export const getUser: ToolTaskRendererEntry = {
  response: ({ input, output }) => {
    const name =
      textField(output, 'userName') ??
      textField(output, 'fullName') ??
      textField(input, 'userId');
    const pronouns = textField(output, 'pronouns');
    return {
      output: name
        ? `Found ${name}${pronouns ? ` (${pronouns})` : ''}.`
        : 'User not found.',
      title: 'Looked up user',
    };
  },
  title: 'Looking up user',
};

export const getChannelInfo: ToolTaskRendererEntry = {
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

export const reaction: ToolTaskRendererEntry = {
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
