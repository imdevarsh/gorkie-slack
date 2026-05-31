import { toLogError } from '@repo/utils/error';
import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask, updateTask } from '@/lib/ai/utils/task';
import logger from '@/lib/logger';
import type { SlackMessageContext, Stream } from '@/types';
import { getContextId } from '@/utils/context';
import { normalizeSlackUserId, primeSlackUser } from '@/utils/users';

export const getUserInfo = ({
  context,
  stream,
}: {
  context: SlackMessageContext;
  stream: Stream;
}) =>
  tool({
    description: 'Get details about a Slack user by ID.',
    inputSchema: z.object({
      userId: z
        .string()
        .min(1)
        .describe('The Slack user ID (e.g. U123) of the user.'),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Looking up user info',
        status: 'pending',
      });
    },
    execute: async ({ userId }, { toolCallId }) => {
      const ctxId = getContextId(context);
      const task = await updateTask(stream, {
        taskId: toolCallId,
        title: 'Looking up user info',
        details: userId,
        status: 'in_progress',
      });

      try {
        const targetId = normalizeSlackUserId(userId);

        if (!targetId) {
          await finishTask(stream, { status: 'error', taskId: task });
          return {
            success: false,
            error: 'User not found. Use their Slack ID.',
          };
        }

        const { user } = await context.client.users.info({ user: targetId });

        if (!user) {
          await finishTask(stream, { status: 'error', taskId: task });
          return {
            success: false,
            error: 'User not found. Use their Slack ID.',
          };
        }

        const name =
          user.profile?.display_name || user.real_name || user.name || targetId;
        primeSlackUser(targetId, {
          name,
          displayName: user.profile?.display_name ?? null,
          realName: user.profile?.real_name ?? null,
          title: user.profile?.title ?? null,
          isBot: user.is_bot ?? false,
          tz: user.tz ?? null,
        });

        await finishTask(stream, { status: 'complete', taskId: task });
        return {
          success: true,
          data: {
            id: targetId,
            name,
            displayName: user.profile?.display_name ?? null,
            realName: user.profile?.real_name ?? null,
            title: user.profile?.title ?? null,
            isBot: user.is_bot ?? false,
            tz: user.tz ?? null,
            statusText: user.profile?.status_text ?? null,
            statusEmoji: user.profile?.status_emoji ?? null,
            updated: user.updated,
            teamId: user.team_id,
            idResolved: targetId,
          },
        };
      } catch (error) {
        logger.error({ ...toLogError(error), ctxId }, 'Error in getUserInfo');
        await finishTask(stream, { status: 'error', taskId: task });
        return {
          success: false,
          error: 'Failed to fetch Slack user info',
        };
      }
    },
  });
