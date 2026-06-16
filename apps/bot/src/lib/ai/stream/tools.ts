const TOOL_TITLES: Record<string, string> = {
  addReaction: 'Adding reaction',
  bash: 'Running command',
  compaction: 'Compacting context',
  edit: 'Editing file',
  fetchMessages: 'Reading messages',
  fetchThread: 'Reading thread',
  fileChange: 'Updating file',
  generateImage: 'Generating image',
  getChannelInfo: 'Reading channel',
  getUser: 'Looking up user',
  glob: 'Finding files',
  grep: 'Searching',
  ls: 'Listing files',
  postChannelMessage: 'Posting to channel',
  postMessage: 'Sending message',
  read: 'Reading file',
  removeReaction: 'Removing reaction',
  searchWeb: 'Searching the web',
  sendDirectMessage: 'Sending DM',
  startTyping: 'Typing',
  uploadFile: 'Uploading file',
  write: 'Writing file',
};

export function toolTitle(toolName: string): string {
  return TOOL_TITLES[toolName] ?? toolName;
}
