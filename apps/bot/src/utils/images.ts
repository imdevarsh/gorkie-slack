import { toLogError } from '@repo/utils/error';
import type { FilePart } from 'ai';
import { env } from '@/env';
import logger from '@/lib/logger';
import type { SlackFile } from '@/types';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

type SupportedImageMimeType =
  | 'image/gif'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp';

type SlackImageFile = SlackFile & { mimetype: SupportedImageMimeType };

function isImageFile(file: SlackFile): file is SlackImageFile {
  return isSupportedImageMimeType(file.mimetype);
}

function isSupportedImageMimeType(
  value: string | undefined
): value is SupportedImageMimeType {
  return (
    value === 'image/gif' ||
    value === 'image/jpeg' ||
    value === 'image/png' ||
    value === 'image/webp'
  );
}

async function fetchSlackImageAsBase64(
  file: SlackImageFile
): Promise<{ data: string; mimeType: SupportedImageMimeType } | null> {
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
      logger.warn(
        { status: response.status, fileId: file.id },
        'Could not fetch Slack image'
      );
      return null;
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      logger.warn(
        { fileId: file.id, contentLength },
        'Skipping image: exceeds size limit'
      );
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      logger.warn(
        { fileId: file.id, byteLength: arrayBuffer.byteLength },
        'Skipping image: exceeds size limit'
      );
      return null;
    }

    return {
      data: Buffer.from(arrayBuffer).toString('base64'),
      mimeType: file.mimetype,
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
): Promise<FilePart[]> {
  if (!files || files.length === 0) {
    return [];
  }

  const imageFiles = files.filter(isImageFile);
  if (imageFiles.length === 0) {
    return [];
  }

  const imagePromises = imageFiles.map(
    async (file): Promise<FilePart | null> => {
      const result = await fetchSlackImageAsBase64(file);
      if (!result) {
        return null;
      }
      const image: FilePart = {
        type: 'file',
        data: result.data,
        mediaType: result.mimeType,
      };
      return image;
    }
  );

  const results = await Promise.all(imagePromises);
  return results.filter((result): result is FilePart => result !== null);
}
