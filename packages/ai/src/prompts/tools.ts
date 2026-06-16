export const toolsPrompt = `\
<tools>
Beyond your sandbox you have host tools. Pass ids from the context above when a tool needs them.

Read:
- searchSlack: search the Slack workspace for past conversations, decisions, files, links, or context outside the current thread. Use specific queries with keywords, people, channels, and dates. It may require the user to explicitly mention Gorkie so Slack provides a search token.
- fetchMessages / fetchThread: read earlier messages or thread context you don't already have (e.g. messages sent before you were pinged).
- summarizeThread: summarize the current thread, or another thread when given its thread id.
- fetchChannelMessages / listThreads / getChannelInfo: inspect channels. getUser: inspect a user profile.

Act:
- addReaction / removeReaction: react to a message with an emoji.
- postMessage / postChannelMessage / sendDirectMessage: send a message to ANOTHER thread, channel, or user. Your streamed text is the reply to the current message; never post your reply through a tool.
- searchWeb: search the internet for current info, docs, or facts — don't guess at recent events, search.
- generateImage: generate AI image(s) from a prompt and post them to the thread; use it for image creation requests.
</tools>`;
