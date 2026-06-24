import { tool } from 'ai';
import { z } from 'zod';
import { resolveUserProfile } from '@/lib/slack/names';

export function getUserTool() {
  return tool({
    description:
      "Look up a Slack user's profile by their user id (like U0123ABCD): display name, real name, pronouns, title, status, and custom profile fields (Website, GitHub, etc.). Use their pronouns when referring to them.",
    inputSchema: z.object({
      userId: z.string().min(1).describe('The Slack user id, like U0123ABCD.'),
    }),
    execute: async ({ userId }) => {
      const profile = await resolveUserProfile(userId);
      if (!profile) {
        return {
          found: false,
          summary: `Could not find a user with id ${userId}.`,
          userId,
        };
      }
      const fields = profile.fields ?? [];
      return {
        found: true,
        fields,
        fullName: profile.realName,
        pronouns: profile.pronouns,
        status: profile.status,
        summary: `${profile.displayName ?? userId}${profile.pronouns ? ` (${profile.pronouns})` : ''}${profile.title ? `, ${profile.title}` : ''}.`,
        title: profile.title,
        userId,
        userName: profile.displayName,
      };
    },
  });
}
