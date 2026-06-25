---
title: Tools
description: The model-facing tool surface and safety boundaries.
---

Gorkie gives the model two kinds of tools: Pi's sandbox tools and host tools owned by the bot.

## Sandbox Tools

Pi provides the coding tools through Harness:

| Tool | Purpose |
| --- | --- |
| `bash` | Run shell commands in the E2B workspace. |
| `read` | Read files from the workspace. |
| `write` | Write files into the workspace. |
| `edit` | Patch existing files. |
| `grep` | Search file contents. |
| `glob` | Find files by pattern. |
| `ls` | List directories. |

These tools operate in the sandbox. They do not call Slack directly.

## Slack And Chat Tools

`apps/bot/src/lib/ai/toolset.ts` exposes bot-owned tools for Slack actions:

| Tool | Purpose |
| --- | --- |
| `postMessage` | Post to another thread, channel, or user. |
| `react` | React to a message. |
| `getChannelInfo` | Read channel metadata. |
| `getUser` | Read user metadata. |

The streamed assistant text is already the reply to the current user. The model should not call a posting tool just to answer the current message.

## Conversation Tools

Gorkie uses a small custom Slack history surface:

| Tool | Purpose |
| --- | --- |
| `listThreads` | List recent public channel threads before choosing one to read. |
| `readConversationHistory` | Read public channel history or thread replies. |
| `searchSlack` | Search Slack through Slack's assistant search context. |
| `summarizeThread` | Summarize the current or specified thread. |

`readConversationHistory` and `listThreads` join public channels best-effort before reading. They block DMs, private channels, and external conversations.

`searchSlack` depends on Slack's assistant action token. If the token is missing, the tool returns a model-facing error explaining that the user must explicitly mention Gorkie.

## Creation And Utility Tools

| Tool | Purpose |
| --- | --- |
| `searchWeb` | Search the current web through Exa. |
| `generateImage` | Generate images and upload them to the active Slack thread. |
| `uploadFile` | Upload a file from the sandbox workspace to the active Slack thread. |
| `mermaid` | Render Mermaid and upload a diagram image. |
| `scheduleReminder` | Schedule a one-time Slack reminder DM. |

`uploadFile` is restricted to the active sandbox workspace. It cannot upload arbitrary host files.

## Rendering

Every visible tool should have a task renderer under `apps/bot/src/lib/ai/stream/tasks`. The user-facing task row should say what happened, not dump raw JSON.

Normal tool results that contain an `error` field are rendered as completed task rows with bold error text. They do not mark the whole turn as failed.
