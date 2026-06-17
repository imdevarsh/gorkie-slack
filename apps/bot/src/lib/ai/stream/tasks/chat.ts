import {
  arrayLength,
  booleanField,
  clipped,
  numberField,
  plural,
  textField,
} from './helpers';
import type { ToolTaskRenderer } from './types';

export const messageCall: ToolTaskRenderer = ({ input, toolName }) => {
  let title = 'Sending message';
  if (toolName === 'sendDirectMessage') {
    title = 'Sending DM';
  }
  if (toolName === 'postChannelMessage') {
    title = 'Posting to channel';
  }
  return {
    details: clipped(
      textField(input, 'threadId') ??
        textField(input, 'channelId') ??
        textField(input, 'userId'),
      180
    ),
    title,
  };
};

export const messageResult: ToolTaskRenderer = ({ output, toolName }) => ({
  output: clipped(
    `${toolName === 'sendDirectMessage' ? 'Sent DM' : 'Sent message'}${textField(output, 'threadId') ? ` in ${textField(output, 'threadId')}` : ''}.`
  ),
  title: toolName === 'sendDirectMessage' ? 'Sent DM' : 'Sent message',
});

export const fetchMessagesCall: ToolTaskRenderer = ({ input, toolName }) => ({
  details: clipped(
    textField(input, 'threadId') ?? textField(input, 'channelId'),
    180
  ),
  title:
    toolName === 'fetchChannelMessages'
      ? 'Reading channel'
      : 'Reading messages',
});

export const fetchMessagesResult: ToolTaskRenderer = ({ output }) => {
  const count = arrayLength(output, 'messages') ?? 0;
  return {
    output: clipped(`Read ${plural(count, 'message')}.`),
    title: 'Read messages',
  };
};

export const listThreadsResult: ToolTaskRenderer = ({ output }) => {
  const count = arrayLength(output, 'threads') ?? 0;
  return {
    output: clipped(`Found ${plural(count, 'thread')}.`),
    title: 'Listed threads',
  };
};

export const getUserResult: ToolTaskRenderer = ({ input, output }) => {
  const name =
    textField(output, 'fullName') ??
    textField(output, 'userName') ??
    textField(input, 'userId');
  return {
    output: clipped(name ? `Found ${name}.` : 'User not found.'),
    title: 'Looked up user',
  };
};

export const getChannelInfoResult: ToolTaskRenderer = ({ output }) => {
  const name =
    textField(output, 'name') ?? textField(output, 'id') ?? 'channel';
  const members = numberField(output, 'memberCount');
  return {
    output: clipped(
      `${name}${members === undefined ? '' : ` · ${plural(members, 'member')}`}.`
    ),
    title: 'Read channel',
  };
};

export const reactionCall: ToolTaskRenderer = ({ input, toolName }) => ({
  details: clipped(
    textField(input, 'emoji') ?? textField(input, 'messageId'),
    180
  ),
  title:
    toolName === 'removeReaction' ? 'Removing reaction' : 'Adding reaction',
});

export const reactionResult: ToolTaskRenderer = ({
  input,
  output,
  toolName,
}) => {
  const emoji =
    textField(output, 'emoji') ?? textField(input, 'emoji') ?? 'reaction';
  const ok = booleanField(
    output,
    toolName === 'removeReaction' ? 'removed' : 'added'
  );
  let action = 'Added';
  if (toolName === 'removeReaction') {
    action = 'Removed';
  }
  if (ok === false) {
    action = 'Could not update';
  }
  return {
    output: clipped(`${action} :${emoji}:.`),
    title:
      toolName === 'removeReaction' ? 'Removed reaction' : 'Added reaction',
  };
};

export const fetchThreadResult: ToolTaskRenderer = ({ output }) => ({
  output: clipped(
    `Thread in ${textField(output, 'channelName') ?? textField(output, 'channelId') ?? 'channel'}.`
  ),
  title: 'Read thread',
});
