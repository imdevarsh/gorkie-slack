import { errorMessage } from '@repo/utils/error';
import { tool } from 'ai';
import type { Thread } from 'chat';
import { z } from 'zod';
import { env } from '@/env';
import logger from '@/lib/logger';

const postMessageSchema = z.looseObject({
  error: z.string().optional(),
  ok: z.boolean(),
  ts: z.string().optional(),
});

/**
 * Shared owner gate. The tools are only registered for the owner (see
 * toolset.ts), but we re-check here as defense-in-depth so a misconfiguration
 * can never let one user act as another.
 */
function checkOwner(
  authorUserId: string
): { ok: true; userToken: string } | { ok: false; error: string } {
  const userToken = env.SLACK_USER_TOKEN;
  if (!(userToken && env.OWNER_USER_ID)) {
    return { error: 'Acting as the owner is not configured.', ok: false };
  }
  if (authorUserId !== env.OWNER_USER_ID) {
    return { error: 'Only the owner can act as themselves.', ok: false };
  }
  return { ok: true, userToken };
}

/**
 * Posts a message to the current thread AS the owner, using their personal user
 * OAuth token. The factory is only ever called for the owner (see toolset.ts),
 * but we re-check the author here as defense-in-depth so a misconfiguration can
 * never let one user speak as another.
 */
export function sendAsUserTool({
  authorUserId,
  thread,
}: {
  authorUserId: string;
  thread: Thread;
}) {
  return tool({
    description:
      'Send a message AS the owner (under their own name), not as the bot. Defaults to the current thread. Pass channelId to post a top-level message in a different channel. Only available when the owner triggered this turn.',
    inputSchema: z.object({
      text: z
        .string()
        .min(1)
        .max(4000)
        .describe('The message to post as the owner.'),
      channelId: z
        .string()
        .min(1)
        .optional()
        .describe(
          'Target Slack channel id (e.g. C0123ABC) to post into as a top-level message. Defaults to the current thread.'
        ),
    }),
    execute: async ({ text, channelId }) => {
      try {
        const gate = checkOwner(authorUserId);
        if (!gate.ok) {
          return { error: gate.error, success: false };
        }
        const { userToken } = gate;

        const [platform, currentChannelId, threadTs] = thread.id.split(':');
        if (platform !== 'slack' || !currentChannelId) {
          return {
            error: 'Could not resolve a Slack channel for this thread.',
            success: false,
          };
        }

        // A cross-channel post lands as a top-level message; only posts in the
        // current channel inherit the active thread.
        const crossChannel = Boolean(
          channelId && channelId !== currentChannelId
        );
        const targetChannel = channelId ?? currentChannelId;

        const response = await fetch('https://slack.com/api/chat.postMessage', {
          body: JSON.stringify({
            channel: targetChannel,
            text,
            ...(!crossChannel && threadTs && { thread_ts: threadTs }),
          }),
          headers: {
            Authorization: `Bearer ${userToken}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          method: 'POST',
        });
        const result = postMessageSchema.parse(await response.json());
        if (!result.ok) {
          return {
            error: `Failed to send as owner: ${result.error}`,
            success: false,
          };
        }
        if (crossChannel) {
          logger.info(
            { authorUserId, targetChannel },
            '[sendAsUser] posted as owner to another channel'
          );
        }
        return {
          success: true,
          summary: crossChannel
            ? `Sent the message as the owner to <#${targetChannel}>.`
            : 'Sent the message as the owner.',
        };
      } catch (error) {
        logger.warn({ error: errorMessage(error) }, '[sendAsUser] failed');
        return { error: errorMessage(error), success: false };
      }
    },
  });
}

/**
 * Edits a message previously sent AS the owner, using their personal user OAuth
 * token. Slack only permits editing the user's own messages, so this can never
 * alter another person's message. Owner-gated like sendAsUser.
 */
export function editAsUserTool({
  authorUserId,
  thread,
}: {
  authorUserId: string;
  thread: Thread;
}) {
  return tool({
    description:
      "Edit one of the owner's own messages (under their own name). Defaults to the current channel; pass channelId to edit a message in another channel. Only available when the owner triggered this turn.",
    inputSchema: z.object({
      messageTs: z
        .string()
        .min(1)
        .describe(
          'Timestamp (ts) of the owner message to edit, e.g. 1781599802.270109.'
        ),
      text: z
        .string()
        .min(1)
        .max(4000)
        .describe('The new message text to replace the existing content with.'),
      channelId: z
        .string()
        .min(1)
        .optional()
        .describe(
          'Slack channel id (e.g. C0123ABC) the message lives in. Defaults to the current channel.'
        ),
    }),
    execute: async ({ messageTs, text, channelId }) => {
      try {
        const gate = checkOwner(authorUserId);
        if (!gate.ok) {
          return { error: gate.error, success: false };
        }
        const { userToken } = gate;

        const [platform, currentChannelId] = thread.id.split(':');
        if (platform !== 'slack' || !currentChannelId) {
          return {
            error: 'Could not resolve a Slack channel for this thread.',
            success: false,
          };
        }
        const targetChannel = channelId ?? currentChannelId;

        const response = await fetch('https://slack.com/api/chat.update', {
          body: JSON.stringify({
            channel: targetChannel,
            text,
            ts: messageTs,
          }),
          headers: {
            Authorization: `Bearer ${userToken}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          method: 'POST',
        });
        const result = postMessageSchema.parse(await response.json());
        if (!result.ok) {
          return {
            error: `Failed to edit the owner's message: ${result.error}`,
            success: false,
          };
        }
        return {
          success: true,
          summary: "Edited the owner's message.",
        };
      } catch (error) {
        logger.warn({ error: errorMessage(error) }, '[editAsUser] failed');
        return { error: errorMessage(error), success: false };
      }
    },
  });
}
