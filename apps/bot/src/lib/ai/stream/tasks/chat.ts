import type { TaskRendererEntry } from '@/types/task-renderers';
import { arraySize, bool, number, plural, text } from './helpers';

export const message: TaskRendererEntry = {
  request: ({ input }) => ({
    details: text(input, 'id'),
  }),
  response: ({ output }) => ({
    output: `Sent message${text(output, 'threadId') ? ` in ${text(output, 'threadId')}` : ''}.`,
    title: 'Sent message',
  }),
  title: 'Sending message',
};

export const fetchMessages: TaskRendererEntry = {
  request: ({ input }) => ({
    details: text(input, 'threadId') ?? text(input, 'channelId'),
  }),
  response: ({ input, output }) => {
    const count = arraySize(output, 'messages') ?? 0;
    const target = text(input, 'threadId') ?? text(input, 'channelId');
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

export const listThreads: TaskRendererEntry = {
  response: ({ output }) => {
    const count = arraySize(output, 'threads') ?? 0;
    return {
      output: `Found ${plural(count, 'thread')}.`,
      title: 'Listed threads',
    };
  },
  title: 'Listing threads',
};

export const getUser: TaskRendererEntry = {
  response: ({ input, output }) => {
    const name =
      text(output, 'userName') ??
      text(output, 'fullName') ??
      text(input, 'userId');
    const pronouns = text(output, 'pronouns');
    return {
      output: name
        ? `Found ${name}${pronouns ? ` (${pronouns})` : ''}.`
        : 'User not found.',
      title: 'Looked up user',
    };
  },
  title: 'Looking up user',
};

export const getChannelInfo: TaskRendererEntry = {
  response: ({ output }) => {
    const name = text(output, 'name') ?? text(output, 'id') ?? 'channel';
    const members = number(output, 'memberCount');
    return {
      output: `${name}${members === undefined ? '' : ` · ${plural(members, 'member')}`}.`,
      title: 'Read channel',
    };
  },
  title: 'Reading channel',
};

export const reaction: TaskRendererEntry = {
  request: ({ input }) => ({
    details: text(input, 'emoji') ?? text(input, 'messageId'),
  }),
  response: ({ input, output }) => {
    const emoji = text(output, 'emoji') ?? text(input, 'emoji') ?? 'reaction';
    const added = bool(output, 'added');
    const action = added === false ? 'Could not update' : 'Added';
    return {
      output: `${action} :${emoji}:.`,
      title: 'Added reaction',
    };
  },
  title: 'Adding reaction',
};
