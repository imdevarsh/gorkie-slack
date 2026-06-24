import { errorMessage } from '@/lib/utils/error';
import { tool } from 'ai';
import type { Thread } from 'chat';
import { z } from 'zod';
import { env } from '@/env';
import { slack } from '@/lib/chat';
import logger from '@/lib/logger';

const canvasResponseSchema = z.looseObject({
  canvas_id: z.string().optional(),
  error: z.string().optional(),
  ok: z.boolean(),
});

const filesInfoSchema = z.looseObject({
  error: z.string().optional(),
  file: z
    .looseObject({
      id: z.string().optional(),
      title: z.string().optional(),
      url_private_download: z.string().optional(),
    })
    .optional(),
  ok: z.boolean(),
});

const filesListSchema = z.looseObject({
  error: z.string().optional(),
  files: z
    .array(
      z.looseObject({ id: z.string().optional(), title: z.string().optional() })
    )
    .optional(),
  ok: z.boolean(),
});

function channelIdFromThread(thread: Thread): string | undefined {
  const [platform, channelId] = thread.id.split(':');
  return platform === 'slack' ? channelId : undefined;
}

export function canvasListTool({ thread }: { thread: Thread }) {
  return tool({
    description:
      'List existing Slack canvases in the current channel so you can discover one to read or edit. Returns canvas ids and titles.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const channelId = channelIdFromThread(thread);
        if (!channelId) {
          return {
            error: 'Could not resolve a Slack channel for this thread.',
            success: false,
          };
        }
        const result = filesListSchema.parse(
          await slack.webClient.apiCall('files.list', {
            channel: channelId,
            types: 'canvases',
          })
        );
        if (!result.ok) {
          return {
            error: `Could not list canvases: ${result.error}`,
            success: false,
          };
        }
        const canvases = (result.files ?? []).map((file) => ({
          canvasId: file.id,
          title: file.title,
        }));
        return {
          canvases,
          success: true,
          summary: `Found ${canvases.length} canvas${canvases.length === 1 ? '' : 'es'} in this channel.`,
        };
      } catch (error) {
        logger.warn({ error: errorMessage(error) }, '[canvasList] failed');
        return { error: errorMessage(error), success: false };
      }
    },
  });
}

export function canvasWriteTool({ thread }: { thread: Thread }) {
  return tool({
    description:
      'Create or edit a Slack canvas (a rich, persistent document). Use to capture meeting notes, decisions, specs, runbooks, or any long-lived structured content. Prefer this over long messages for content the team will return to.',
    inputSchema: z.object({
      mode: z
        .enum(['create-channel', 'create-standalone', 'edit'])
        .describe(
          'create-channel: attach a canvas to the current channel. create-standalone: a free-floating canvas. edit: change an existing canvas (requires canvasId).'
        ),
      title: z
        .string()
        .min(1)
        .max(255)
        .optional()
        .describe('Title for a standalone canvas.'),
      markdown: z
        .string()
        .min(1)
        .max(100_000)
        .describe('Canvas body as Slack-flavored markdown.'),
      canvasId: z
        .string()
        .min(1)
        .optional()
        .describe('Canvas id to edit (required when mode is "edit").'),
      editOperation: z
        .enum(['replace', 'insert_at_end'])
        .default('insert_at_end')
        .describe('How to apply markdown when editing an existing canvas.'),
    }),
    execute: async ({ mode, title, markdown, canvasId, editOperation }) => {
      try {
        const documentContent = { markdown, type: 'markdown' as const };

        if (mode === 'edit') {
          if (!canvasId) {
            return {
              error: 'canvasId is required to edit a canvas.',
              success: false,
            };
          }
          const result = canvasResponseSchema.parse(
            await slack.webClient.apiCall('canvases.edit', {
              canvas_id: canvasId,
              changes: [
                editOperation === 'replace'
                  ? { document_content: documentContent, operation: 'replace' }
                  : {
                      document_content: documentContent,
                      operation: 'insert_at_end',
                    },
              ],
            })
          );
          if (!result.ok) {
            return {
              error: `Canvas edit failed: ${result.error}`,
              success: false,
            };
          }
          return {
            canvasId,
            success: true,
            summary: `Edited canvas ${canvasId}.`,
          };
        }

        if (mode === 'create-channel') {
          const channelId = channelIdFromThread(thread);
          if (!channelId) {
            return {
              error: 'Could not resolve a Slack channel for this thread.',
              success: false,
            };
          }
          const result = canvasResponseSchema.parse(
            await slack.webClient.apiCall('conversations.canvases.create', {
              channel_id: channelId,
              document_content: documentContent,
            })
          );
          if (!result.ok) {
            return {
              error: `Channel canvas creation failed: ${result.error}`,
              success: false,
            };
          }
          return {
            canvasId: result.canvas_id,
            success: true,
            summary: 'Created a canvas in this channel.',
          };
        }

        const result = canvasResponseSchema.parse(
          await slack.webClient.apiCall('canvases.create', {
            document_content: documentContent,
            ...(title && { title }),
          })
        );
        if (!result.ok) {
          return {
            error: `Canvas creation failed: ${result.error}`,
            success: false,
          };
        }
        return {
          canvasId: result.canvas_id,
          success: true,
          summary: `Created canvas${title ? ` "${title}"` : ''}.`,
        };
      } catch (error) {
        logger.warn({ error: errorMessage(error) }, '[canvasWrite] failed');
        return { error: errorMessage(error), success: false };
      }
    },
  });
}

export function canvasDeleteTool() {
  return tool({
    description:
      'Delete a Slack canvas by its canvas/file id. This is permanent — only use when explicitly asked to remove a canvas.',
    inputSchema: z.object({
      canvasId: z
        .string()
        .min(1)
        .describe('Canvas (file) id to delete, e.g. F0123ABC.'),
    }),
    execute: async ({ canvasId }) => {
      try {
        const result = canvasResponseSchema.parse(
          await slack.webClient.apiCall('canvases.delete', {
            canvas_id: canvasId,
          })
        );
        if (!result.ok) {
          return {
            error: `Canvas delete failed: ${result.error}`,
            success: false,
          };
        }
        return {
          canvasId,
          success: true,
          summary: `Deleted canvas ${canvasId}.`,
        };
      } catch (error) {
        logger.warn({ error: errorMessage(error) }, '[canvasDelete] failed');
        return { error: errorMessage(error), success: false };
      }
    },
  });
}

export function canvasReadTool() {
  return tool({
    description:
      'Read the contents of an existing Slack canvas by its canvas/file id. Use to review notes or specs before editing or answering questions about them.',
    inputSchema: z.object({
      canvasId: z.string().min(1).describe('Canvas (file) id, e.g. F0123ABC.'),
    }),
    execute: async ({ canvasId }) => {
      try {
        const info = filesInfoSchema.parse(
          await slack.webClient.apiCall('files.info', { file: canvasId })
        );
        if (!(info.ok && info.file?.url_private_download)) {
          return {
            error: `Could not load canvas: ${info.error ?? 'no downloadable content'}`,
            success: false,
          };
        }
        const response = await fetch(info.file.url_private_download, {
          headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
        });
        if (!response.ok) {
          return {
            error: `Failed to download canvas content: ${response.status}`,
            success: false,
          };
        }
        const content = await response.text();
        return {
          canvasId,
          content,
          success: true,
          title: info.file.title,
        };
      } catch (error) {
        logger.warn({ error: errorMessage(error) }, '[canvasRead] failed');
        return { error: errorMessage(error), success: false };
      }
    },
  });
}
