import type { ImagePart } from 'ai';
import { env } from '~/env';
import logger from '~/lib/logger';
import { toLogError } from '~/utils/error';

// Supported image MIME types for vision models
const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

export interface SlackFile {
  id?: string;
  mimetype?: string;
  name?: string;
  original_h?: number;
  original_w?: number;
  size?: number;
  url_private?: string;
  url_private_download?: string;
}

/**
 * Check if a file is a supported image type
 */
export function isImageFile(file: SlackFile): boolean {
  const mimetype = file.mimetype ?? '';
  return SUPPORTED_IMAGE_TYPES.includes(mimetype);
}

/**
 * Get the appropriate MIME type string
 */
function getMimeType(file: SlackFile): string {
  const mimetype = file.mimetype ?? '';
  if (SUPPORTED_IMAGE_TYPES.includes(mimetype)) {
    return mimetype;
  }
  // Default to jpeg if unknown
  return 'image/jpeg';
}

/**
 * Fetch image from Slack's private URL and convert to base64 data URL
 */
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

/**
 * Process files from a Slack message and return image parts in AI SDK format
 */
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
        type: 'image',
        image: result.data,
        mediaType: result.mimeType,
      };
    }
  );

  const results = await Promise.all(imagePromises);
  return results.filter((result): result is ImagePart => result !== null);
}
