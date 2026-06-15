import { tool } from 'ai';
import { z } from 'zod';

export function uploadFileTool({
  upload,
}: {
  upload: (input: {
    filename?: string;
    path: string;
    title?: string;
  }) => Promise<{ filename: string; uploaded: boolean }>;
}) {
  return tool({
    description:
      'Upload a file from the sandbox workspace to the current Slack thread. Use this when the user asks to see, share, or download a file you created or inspected.',
    inputSchema: z.object({
      path: z
        .string()
        .min(1)
        .describe(
          'Path to the file in the sandbox. Relative paths resolve from the current workspace.'
        ),
      filename: z
        .string()
        .min(1)
        .optional()
        .describe('Optional filename to show in Slack.'),
      title: z
        .string()
        .min(1)
        .optional()
        .describe('Optional Slack file title.'),
    }),
    execute: upload,
  });
}
