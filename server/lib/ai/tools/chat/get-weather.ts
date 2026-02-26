import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import type { ChatRuntimeContext, Stream } from '~/types';
import { toLogError } from '~/utils/error';

export const getWeather = ({
  stream,
}: {
  context: ChatRuntimeContext;
  stream: Stream;
}) =>
  tool({
    description: 'Get the current weather at a location',
    inputSchema: z.object({
      latitude: z.number(),
      longitude: z.number(),
    }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Getting weather',
        status: 'pending',
      });
    },
    execute: async ({ latitude, longitude }, { toolCallId }) => {
      const task = await updateTask(stream, {
        taskId: toolCallId,
        title: 'Getting weather',
        details: `${latitude}, ${longitude}`,
        status: 'in_progress',
      });
      try {
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`
        );

        if (!response.ok) {
          throw new Error(
            `Weather API request failed with status ${response.status}`
          );
        }

        const weatherData: unknown = await response.json();
        await finishTask(stream, { status: 'complete', taskId: task });
        return weatherData;
      } catch (error) {
        logger.error({ ...toLogError(error) }, 'Error in getWeather');
        await finishTask(stream, {
          status: 'error',
          taskId: task,
          output: 'Failed to fetch weather',
        });
        return {
          success: false,
          error: 'Failed to fetch weather',
        };
      }
    },
  });
