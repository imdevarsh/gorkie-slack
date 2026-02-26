import type { ImagePart } from 'ai';
import { env } from '~/env';
import logger from '~/lib/logger';
import type { SlackFile } from '~/types';
import { toLogError } from '~/utils/error';

const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

export function isImageFile(file: SlackFile): boolean {
  const mimetype = file.mimetype ?? '';
  return SUPPORTED_IMAGE_TYPES.includes(mimetype);
}

function getMimeType(file: SlackFile): string {
  const mimetype = file.mimetype ?? '';
  if (SUPPORTED_IMAGE_TYPES.includes(mimetype)) {
    return mimetype;
  }
  return 'image/jpeg';
}

export async function fetchSlackImageAsBase64(
  file: SlackFile
): Promise<{ data: string; mimeType: string } | null> {
  const url = file.url_private ?? file.url_private_download;
  if (!url) {
    logger.warn({ fileId: file.id }, 'No private URL available for file');
    return null;
  }

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      },
    });

    if (!response.ok) {
      logger.error(
        { status: response.status, fileId: file.id },
        'Failed to fetch Slack image'
      );
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = getMimeType(file);

    return {
      data: `data:${mimeType};base64,${base64}`,
      mimeType,
    };
  } catch (error) {
    logger.error(
      { ...toLogError(error), fileId: file.id },
      'Error fetching Slack image'
    );
    return null;
  }
}

export async function processSlackFiles(
  files: SlackFile[] | undefined
): Promise<ImagePart[]> {
  if (!files || files.length === 0) {
    return [];
  }

  const imageFiles = files.filter(isImageFile);
  if (imageFiles.length === 0) {
    return [];
  }

  const imagePromises = imageFiles.map(
    async (file): Promise<ImagePart | null> => {
      const result = await fetchSlackImageAsBase64(file);
      if (!result) {
        return null;
      }
      return {
        type: 'image' as const,
        image: result.data,
        mediaType: result.mimeType,
      };
    }
  );

  const results = await Promise.all(imagePromises);
  return results.filter((result): result is ImagePart => result !== null);
}
