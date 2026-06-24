import type { SandboxContext } from '@repo/ai';
import { errorMessage } from '@repo/utils/error';
import { tool } from 'ai';
import { z } from 'zod';
import logger from '@/lib/logger';
import { deploySiteFromSandbox, removeSite } from '@/lib/sites/deploy';
import { isValidSiteName, siteUrl } from '@/lib/sites/paths';

const siteNameSchema = z
  .string()
  .min(1)
  .max(63)
  .describe(
    'Site name used in the URL path /gorkiesites/<name>/. Lowercase letters, digits, and hyphens only.'
  );

export function deploySiteTool({
  getSandboxContext,
}: {
  getSandboxContext: () => SandboxContext | undefined;
}) {
  return tool({
    description:
      'Publish a prebuilt static site so it is reachable at https://<host>/gorkiesites/<name>/. Build and test the site in the sandbox first, then point sourceDir at the built static output (e.g. dist or out). The host only serves static files — it never runs site code — so deploy fully static output (HTML/CSS/JS/assets), not a dev server.',
    inputSchema: z.object({
      name: siteNameSchema,
      sourceDir: z
        .string()
        .min(1)
        .describe(
          'Absolute path in the sandbox to the built static output directory, e.g. /home/user/project/dist.'
        ),
    }),
    execute: async ({ name, sourceDir }) => {
      try {
        if (!isValidSiteName(name)) {
          return {
            error:
              'Invalid site name. Use 1–63 lowercase letters, digits, or hyphens (no leading/trailing hyphen).',
            success: false,
          };
        }
        const context = getSandboxContext();
        if (!context) {
          return {
            error: 'No active sandbox session is available to deploy from.',
            success: false,
          };
        }

        const result = await deploySiteFromSandbox({
          name,
          session: context.session,
          sourceDir,
        });
        if (!result.ok) {
          return { error: result.error, success: false };
        }

        return {
          success: true,
          summary: `Published "${name}" (${result.fileCount} files) at ${siteUrl(name)}`,
          url: siteUrl(name),
        };
      } catch (error) {
        logger.warn({ error: errorMessage(error) }, '[deploySite] failed');
        return { error: errorMessage(error), success: false };
      }
    },
  });
}

export function removeSiteTool() {
  return tool({
    description:
      'Take down a previously published static site so it is no longer served at /gorkiesites/<name>/. Permanent — only use when explicitly asked.',
    inputSchema: z.object({ name: siteNameSchema }),
    execute: async ({ name }) => {
      try {
        if (!isValidSiteName(name)) {
          return { error: 'Invalid site name.', success: false };
        }
        await removeSite(name);
        return { success: true, summary: `Removed site "${name}".` };
      } catch (error) {
        logger.warn({ error: errorMessage(error) }, '[removeSite] failed');
        return { error: errorMessage(error), success: false };
      }
    },
  });
}
