import { provider } from '@repo/ai';
import { generateImage, tool } from 'ai';
import { z } from 'zod';

const aspectRatioSchema = z.custom<`${number}:${number}`>(
  (value) => typeof value === 'string' && /^\d+:\d+$/.test(value)
);

export interface GeneratedImage {
  bytes: Uint8Array;
  index: number;
  mediaType: string;
  total: number;
}

export function generateImageTool({
  upload,
}: {
  upload: (image: GeneratedImage) => Promise<void>;
}) {
  return tool({
    description:
      'Generate one or more AI images from a prompt and upload them to the current Slack thread. Use it for explicit image creation requests.',
    inputSchema: z.object({
      prompt: z
        .string()
        .min(1)
        .max(1500)
        .describe('What to generate, with the visual details.'),
      n: z
        .number()
        .int()
        .min(1)
        .max(4)
        .default(1)
        .describe('How many images to generate.'),
      aspectRatio: aspectRatioSchema
        .optional()
        .describe('Optional aspect ratio like 16:9 or 1:1.'),
    }),
    execute: async ({ prompt, n, aspectRatio }) => {
      const result = await generateImage({
        model: provider.imageModel('image-model'),
        prompt,
        n,
        ...(aspectRatio ? { aspectRatio } : {}),
      });
      const total = result.images.length;
      for (const [index, image] of result.images.entries()) {
        await upload({
          bytes: image.uint8Array,
          mediaType: image.mediaType,
          index,
          total,
        });
      }
      return { uploaded: total };
    },
  });
}
