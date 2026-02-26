import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import type { ChatRuntimeContext, Stream } from '~/types';
import { getContextId } from '~/utils/context';
import { toLogError } from '~/utils/error';
import { normalizeSlackUserId } from '~/utils/users';

export const getUserInfo = ({
  context,
  stream,
}: {
  context: ChatRuntimeContext;
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

        const user = targetId
          ? ((await context.client.users.info({ user: targetId })).user ?? null)
          : null;

        if (!user) {
          await finishTask(stream, { status: 'error', taskId: task });
          return {
            success: false,
            error: 'User not found. Use their Slack ID.',
          };
        }
        await finishTask(stream, { status: 'complete', taskId: task });
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
        logger.error({ ...toLogError(error), ctxId }, 'Error in getUserInfo');
        await finishTask(stream, { status: 'error', taskId: task });
        return {
          success: false,
          error: 'Failed to fetch Slack user info',
        };
      }
    },
  });
