import { callSlackApi } from '@chat-adapter/slack/api';
import { getUserCustomization } from '@repo/db/queries';
import { env } from '@/env';
import { buildHomeView } from './views';

export async function publishHome({
  userId,
}: {
  userId: string;
}): Promise<void> {
  const customization = await getUserCustomization(userId);

  await callSlackApi(
    'views.publish',
    {
      user_id: userId,
      view: buildHomeView({ prompt: customization?.prompt ?? null }),
    },
    { token: env.SLACK_BOT_TOKEN }
  );
}
