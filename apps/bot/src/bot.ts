import { runTurn, stopTurn } from '@/lib/agent';
import { bot } from '@/lib/chat';
import '@/slack/features/assistant';
import '@/slack/features/customizations';

export { bot } from '@/lib/chat';

bot.onNewMention(async (thread, message) => {
  if (
    message.author.isBot === true ||
    message.author.isMe ||
    message.text.trimStart().startsWith('##')
  ) {
    return;
  }
  // Chat SDK Slack thread ids end with the root message id.
  if (message.threadId.endsWith(`:${message.id}`)) {
    await thread.setState({ respondOnThreadMessages: true });
    await thread.subscribe();
  }
  await runTurn({ message, thread });
});

bot.onDirectMessage(async (thread, message) => {
  if (
    message.author.isBot === true ||
    message.author.isMe ||
    message.text.trimStart().startsWith('##')
  ) {
    return;
  }
  await thread.subscribe();
  await runTurn({ message, thread });
});

bot.onSubscribedMessage(async (thread, message) => {
  const state = await thread.state;
  const shouldRespondToThread =
    state &&
    typeof state === 'object' &&
    'respondOnThreadMessages' in state &&
    state.respondOnThreadMessages === true;

  if (
    message.author.isBot === true ||
    message.author.isMe ||
    message.text.trimStart().startsWith('##') ||
    !(shouldRespondToThread || message.isMention)
  ) {
    return;
  }
  await runTurn({ message, thread });
});

bot.onAction('gorkie_stop_turn', async (event) => {
  const threadId = event.value ?? event.threadId;
  const stopped = stopTurn({ threadId });

  if (!stopped) {
    await event.thread
      ?.postEphemeral(event.user, 'No active response to stop.', {
        fallbackToDM: false,
      })
      .catch(() => undefined);
  }
});
