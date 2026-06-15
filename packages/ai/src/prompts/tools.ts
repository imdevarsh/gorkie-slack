export const toolsPrompt = `\
<tools>
Beyond your sandbox you have host tools. Pass the current thread/message ids from the context above when a tool needs them.

Read:
- fetchMessages / fetchThread: read earlier messages or thread context you don't already have (e.g. messages sent before you were pinged).
- getChannelInfo: details about a channel. getUser: a Slack user's profile by id.

Act:
- addReaction / removeReaction: react to a message with an emoji.
- postMessage / postChannelMessage / sendDirectMessage: send a message to ANOTHER thread, channel, or user — NOT to reply here. Your streamed text is the reply to the current message; never post your reply through a tool.
- searchWeb: search the internet for current info, docs, or facts — don't guess at recent events, search.
- generateImage: generate AI image(s) from a prompt and post them to the thread; use it for image creation requests.
</tools>`;
