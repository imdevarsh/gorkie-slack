import { generateImage, tool } from 'ai';
import { z } from 'zod';
import { provider } from '~/lib/ai/providers';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import type { SlackMessageContext, Stream } from '~/types';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';

const SIZE_REGEX = /^\d+x\d+$/;
const ASPECT_RATIO_REGEX = /^\d+:\d+$/;

function getExtensionFromMediaType(mediaType: string): string {
  if (mediaType === 'image/png') {
    return 'png';
  }
  if (mediaType === 'image/webp') {
    return 'webp';
  }
  if (mediaType === 'image/jpeg') {
    return 'jpg';
  }
  return 'png';
}

export const generateImageTool = ({
  context,
  stream,
}: {
  context: SlackMessageContext;
  stream: Stream;
}) =>
  tool({
    description:
      'Generate one or more AI images from a prompt and upload them to the current Slack thread.',
    inputSchema: z
      .object({
        prompt: z
          .string()
          .min(1)
          .max(1500)
          .describe('Image prompt with the visual details to generate'),
        n: z
          .number()
          .int()
          .min(1)
          .max(4)
          .default(1)
          .describe('Number of images to generate'),
        size: z
          .string()
          .regex(SIZE_REGEX)
          .optional()
          .describe('Optional image size in {width}x{height} format'),
        aspectRatio: z
          .string()
          .regex(ASPECT_RATIO_REGEX)
          .optional()
          .describe('Optional aspect ratio in {width}:{height} format'),
        seed: z
          .number()
          .int()
          .optional()
          .describe('Optional seed for reproducible generations'),
      })
      .refine((input) => !(input.size && input.aspectRatio), {
        message: 'Provide either size or aspectRatio, not both',
        path: ['size'],
      }),
    onInputStart: async ({ toolCallId }) => {
      await createTask(stream, {
        taskId: toolCallId,
        title: 'Generating image',
        status: 'pending',
      });
    },
    execute: async ({ prompt, n, size, aspectRatio, seed }, { toolCallId }) => {
      const ctxId = getContextId(context);
      const channelId = context.event.channel;
      const messageTs = context.event.ts;
      const threadTs = context.event.thread_ts ?? messageTs;

      if (!(channelId && threadTs)) {
        logger.warn(
          { ctxId, channel: channelId, threadTs },
          'Failed to generate image: missing channel or thread'
        );
        return {
          success: false,
          error: 'Missing Slack channel or thread timestamp',
        };
      }

      const task = await updateTask(stream, {
        taskId: toolCallId,
        title: 'Generating image',
        details: prompt,
        status: 'in_progress',
      });

      try {
        const result = await generateImage({
          model: provider.imageModel('image-model'),
          prompt,
          n,
          ...(size ? { size: size as `${number}x${number}` } : {}),
          ...(aspectRatio
            ? { aspectRatio: aspectRatio as `${number}:${number}` }
            : {}),
          ...(seed !== undefined ? { seed } : {}),
        });

        for (const [index, image] of result.images.entries()) {
          const extension = getExtensionFromMediaType(image.mediaType);
          await context.client.files.uploadV2({
            channel_id: channelId,
            thread_ts: threadTs,
            file: Buffer.from(image.uint8Array),
            filename: `gorkie-image-${index + 1}.${extension}`,
            title: `Generated Image ${index + 1}`,
          });
        }

        if (result.warnings.length > 0) {
          logger.warn(
            {
              ctxId,
              channel: channelId,
              warnings: result.warnings
            },
            'Image generation returned warnings'
          );
        }

        logger.info(
          {
            ctxId,
            channel: channelId,
            count: result.images.length,
          },
          'Generated and uploaded image(s)'
        );

        await finishTask(stream, {
          status: 'complete',
          taskId: task,
          output: `Uploaded ${result.images.length} generated image(s)`,
        });

        return {
          success: true,
          content: `Generated ${result.images.length} image(s)`,
        };
      } catch (error) {
        logger.error(
          { ...toLogError(error), ctxId, channel: channelId },
          'Failed to generate image'
        );
        await finishTask(stream, {
          status: 'error',
          taskId: task,
          output: errorMessage(error),
        });
        return {
          success: false,
          error: errorMessage(error),
        };
      }
    },
  });
