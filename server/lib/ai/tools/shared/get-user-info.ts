import { tool } from 'ai';
import { z } from 'zod';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { normalizeSlackUserId } from '~/utils/users';

export const getUserInfo = ({ context }: { context: SlackMessageContext }) =>
  tool({
    description: 'Get details about a Slack user by ID.',
    inputSchema: z.object({
      userId: z
        .string()
        .min(1)
        .describe('The Slack user ID (e.g. U123) of the user.'),
    }),
    execute: async ({ userId }) => {
      await setStatus(context, {
        status: 'is fetching user info',
        loading: true,
      });
      try {
        const targetId = normalizeSlackUserId(userId);

        const user = targetId
          ? ((await context.client.users.info({ user: targetId })).user ?? null)
          : null;

        if (!user) {
          return {
            success: false,
            error: 'User not found. Use their Slack ID.',
          };
        }

        return {
          success: true,
          data: {
            id: user.id,
            username: user.name,
            displayName: user.profile?.display_name,
            realName: user.profile?.real_name,
            statusText: user.profile?.status_text,
            statusEmoji: user.profile?.status_emoji,
            isBot: user.is_bot,
            tz: user.tz,
            updated: user.updated,
            title: user.profile?.title,
            teamId: user.team_id,
            idResolved: targetId ?? null,
          },
        };
      } catch (error) {
        logger.error({ error }, 'Error in getUserInfo');
        return {
          success: false,
          error: 'Failed to fetch Slack user info',
        };
      }
    },
  });
