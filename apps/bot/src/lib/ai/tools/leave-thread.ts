import { tool } from 'ai';
import type { Thread } from 'chat';
import { z } from 'zod';

export function leaveThreadTool({ thread }: { thread: Thread }) {
  return tool({
    description:
      'Leave the current thread: stop auto-responding to its messages. Use this when asked to stop following a thread, be quiet, or let people talk without you. You can still be pinged back with a direct @mention.',
    inputSchema: z.object({}),
    execute: async () => {
      await thread.setState({ respondOnThreadMessages: false });
      await thread.unsubscribe();
      return {
        left: true,
        summary:
          'Left the thread. I will stay quiet unless someone @mentions me directly.',
      };
    },
  });
}
