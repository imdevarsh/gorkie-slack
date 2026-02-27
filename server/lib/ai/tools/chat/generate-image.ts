import { generateImage, tool } from 'ai';
import { extension as getExtension } from 'mime-types';
import { z } from 'zod';
import { provider } from '~/lib/ai/providers';
import { createTask, finishTask, updateTask } from '~/lib/ai/utils/task';
import logger from '~/lib/logger';
import type { SlackFile, SlackMessageContext, Stream } from '~/types';
import { getContextId } from '~/utils/context';
import { errorMessage, toLogError } from '~/utils/error';
import { processSlackFiles } from '~/utils/images';

export const generateImageTool = ({
  context,
  files,
  stream,
}: {
  context: SlackMessageContext;
  files?: SlackFile[];
  stream: Stream;
}) =>
  tool({
    description:
      'Generate one or more AI images from a prompt and upload them to the current Slack thread. If image attachments are present, use them as source images for editing/transformation.',
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
          // biome-ignore lint/performance/useTopLevelRegex: Inlined for local schema readability.
          .regex(/^\d+x\d+$/)
          .optional()
          .describe('Optional image size in {width}x{height} format'),
        aspectRatio: z
          .string()
          // biome-ignore lint/performance/useTopLevelRegex: Inlined for local schema readability.
          .regex(/^\d+:\d+$/)
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
        const inputImages = await processSlackFiles(files);
        const sourceImages = inputImages
          .map((item) => item.image)
          .filter(
            (image): image is string | Uint8Array | ArrayBuffer | Buffer =>
              typeof image === 'string' ||
              image instanceof Uint8Array ||
              image instanceof ArrayBuffer ||
              image instanceof Buffer
          );
        const imagePrompt =
          sourceImages.length > 0
            ? { text: prompt, images: sourceImages }
            : prompt;

        const result = await generateImage({
          model: provider.imageModel('image-model'),
          prompt: imagePrompt,
          n,
          ...(size ? { size: size as `${number}x${number}` } : {}),
          ...(aspectRatio
            ? { aspectRatio: aspectRatio as `${number}:${number}` }
            : {}),
          ...(seed !== undefined ? { seed } : {}),
        });

        for (const [index, image] of result.images.entries()) {
          const extension = getExtension(image.mediaType) || 'png';
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
              warnings: result.warnings,
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
          content: `Generated ${result.images.length} image(s)${sourceImages.length > 0 ? ' from attachment(s)' : ''}`,
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
