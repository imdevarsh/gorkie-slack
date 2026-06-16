export const toolsPrompt = `\
<tools>
Beyond your sandbox you have host tools. Pass full Chat SDK ids from the context above when a tool needs them. Slack thread ids look like slack:C123456:1781599802.270109.

Read:
- fetchMessages / fetchThread: read earlier messages or thread context you don't already have (e.g. messages sent before you were pinged). Use the full thread id, e.g. slack:C123456:1781599802.270109.
- summarizeThread: summarize the current thread, or another thread when given its id.
- getChannelInfo: details about a channel. getUser: a Slack user's profile by id.

Act:
- addReaction / removeReaction: react to a message with an emoji.
- postMessage / postChannelMessage / sendDirectMessage: send a message to ANOTHER thread, channel, or user. Your streamed text is the reply to the current message; never post your reply through a tool.
- searchWeb: search the internet for current info, docs, or facts — don't guess at recent events, search.
- generateImage: generate AI image(s) from a prompt and post them to the thread; use it for image creation requests.
</tools>`;
