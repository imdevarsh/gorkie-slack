import { tool } from 'ai';
import { z } from 'zod';
import logger from '~/lib/logger';

export const getWeather = tool({
  description: 'Get the current weather at a location',
  inputSchema: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  execute: async ({ latitude, longitude }) => {
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`
      );

      if (!response.ok) {
        throw new Error(
          `Weather API request failed with status ${response.status}`
        );
      }

      const weatherData = await response.json();
      return weatherData;
    } catch (error) {
      logger.error({ error }, 'Error in getWeather');
      return {
        success: false,
        error: 'Failed to fetch weather',
      };
    }
  },
});
