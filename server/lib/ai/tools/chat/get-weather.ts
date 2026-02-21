import { tool } from 'ai';
import { z } from 'zod';
import { createTask, finishTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import type { SlackMessageContext, Stream } from '~/types';
import { toLogError } from '~/utils/error';

export const getWeather = ({
  stream,
}: {
  context: SlackMessageContext;
  stream: Stream;
}) =>
  tool({
    description: 'Get the current weather at a location',
    inputSchema: z.object({
      latitude: z.number(),
      longitude: z.number(),
    }),
    execute: async ({ latitude, longitude }) => {
      const task = await createTask(stream, {
        title: 'Getting weather',
        details: `${latitude}, ${longitude}`,
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
        await finishTask(stream, task, 'complete');
        return weatherData;
      } catch (error) {
        logger.error({ ...toLogError(error) }, 'Error in getWeather');
        await finishTask(stream, task, 'error', 'Failed to fetch weather');
        return {
          success: false,
          error: 'Failed to fetch weather',
        };
      }
    },
  });
