import {
  type ActionEvent,
  Actions,
  type Author,
  Button,
  Card,
  CardText,
  type Thread,
} from 'chat';
import { z } from 'zod';
import { env } from '@/env';
import { addAllowedUser } from '@/lib/allowed-users';
import { slack } from '@/lib/chat';
import logger from '@/lib/logger';
import { toLogError } from '@/lib/utils/error';

// First-time onboarding for the opt-in allowlist. When OPT_IN_CHANNEL gates
// access, an un-opted-in user who pings Gorkie sees an ephemeral card instead of
// silence. Clicking "I accept" is the recorded consent: it grants access and
// invites them into the terms channel.

const slackErrorSchema = z.looseObject({
  data: z
    .looseObject({
      error: z.string().optional(),
    })
    .optional(),
});

export async function offerOptIn(thread: Thread, user: Author): Promise<void> {
  if (!env.OPT_IN_CHANNEL) {
    return;
  }
  try {
    await thread.postEphemeral(
      user,
      Card({
        title: '👋 First time meeting Gorkie',
        children: [
          CardText(
            `Hi! I'm Gorkie. Before I can help, you need to accept the terms posted in <#${env.OPT_IN_CHANNEL}>.`
          ),
          CardText(
            "Tap below to opt in — I'll add you to the terms channel and we can get started."
          ),
          Actions([
            Button({
              id: 'opt_in_accept',
              label: 'I accept — opt me in',
              style: 'primary',
              value: thread.id,
            }),
          ]),
        ],
      }),
      { fallbackToDM: true }
    );
  } catch (error) {
    logger.warn(
      { ...toLogError(error), userId: user.userId },
      '[onboarding] failed to offer opt-in'
    );
  }
}

export async function acceptOptIn(event: ActionEvent): Promise<void> {
  const userId = event.user.userId;
  await addAllowedUser(userId);
  await inviteToOptInChannel(userId);
  await event.thread
    ?.postEphemeral(
      event.user,
      "✅ You're all set — welcome to Gorkie! Ask me anything.",
      { fallbackToDM: true }
    )
    .catch((error: unknown) => {
      logger.warn(
        { ...toLogError(error), userId },
        '[onboarding] failed to confirm opt-in'
      );
    });
}

async function inviteToOptInChannel(userId: string): Promise<void> {
  const channel = env.OPT_IN_CHANNEL;
  if (!channel) {
    return;
  }
  try {
    await slack.webClient.conversations.invite({ channel, users: userId });
  } catch (error) {
    // Already a member is success; external users can't be invited (we log it).
    if (slackErrorCode(error) === 'already_in_channel') {
      return;
    }
    logger.warn(
      { ...toLogError(error), channel, userId },
      '[onboarding] failed to invite to opt-in channel'
    );
  }
}

function slackErrorCode(error: unknown): string | undefined {
  return slackErrorSchema.safeParse(error).data?.data?.error;
}
