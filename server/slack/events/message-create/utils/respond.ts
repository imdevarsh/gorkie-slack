import type { ModelMessage, UserContent } from 'ai';
import { generateText, stepCountIs } from 'ai';
import { systemPrompt } from '~/lib/ai/prompts';
import { provider } from '~/lib/ai/providers';
import { getUserInfo } from '~/lib/ai/tools/get-user-info';
import { getWeather } from '~/lib/ai/tools/get-weather';
import { leaveChannel } from '~/lib/ai/tools/leave-channel';
import { react } from '~/lib/ai/tools/react';
import { reply } from '~/lib/ai/tools/reply';
import { scheduleReminder } from '~/lib/ai/tools/schedule-reminder';
import { searchSlack } from '~/lib/ai/tools/search-slack';
import { searchWeb } from '~/lib/ai/tools/search-web';
import { skip } from '~/lib/ai/tools/skip';
import { startDM } from '~/lib/ai/tools/start-dm';
import { successToolCall } from '~/lib/ai/utils';
import type { RequestHints, SlackMessageContext } from '~/types';
import { processSlackFiles, type SlackFile } from '~/utils/images';
import { getSlackUserName } from '~/utils/users';

export async function generateResponse(
  context: SlackMessageContext,
  messages: ModelMessage[],
  hints: RequestHints,
) {
  try {
    const userId = (context.event as { user?: string }).user;
    const messageText = (context.event as { text?: string }).text ?? '';
    const files = (context.event as { files?: SlackFile[] }).files;
    const authorName = userId
      ? await getSlackUserName(context.client, userId)
      : 'user';

    const system = systemPrompt({
      requestHints: hints,
    });

    // Process images from the current message
    const imageContents = await processSlackFiles(files);

    // Build the current message content
    let currentMessageContent: UserContent;
    const replyPrompt = `You are replying to the following message from ${authorName} (${userId}): ${messageText}`;

    if (imageContents.length > 0) {
      // Include images with the reply prompt
      currentMessageContent = [
        { type: 'text' as const, text: replyPrompt },
        ...imageContents,
      ];
    } else {
      currentMessageContent = replyPrompt;
    }

    const { toolCalls } = await generateText({
      model: provider.languageModel('chat-model'),
      messages: [
        ...messages,
        {
          role: 'user',
          content: currentMessageContent,
        },
      ],
      providerOptions: {
        openrouter: {
          reasoning: {
            max_tokens: 250,
          },
        },
      },
      temperature: 1.1,
      toolChoice: 'required',
      tools: {
        getWeather,
        searchWeb,
        searchSlack: searchSlack({ context }),
        startDM: startDM({ context }),
        getUserInfo: getUserInfo({ context }),
        leaveChannel: leaveChannel({ context }),
        scheduleReminder: scheduleReminder({ context }),
        react: react({ context }),
        reply: reply({ context }),
        skip: skip({ context }),
      },
      system,
      stopWhen: [
        stepCountIs(10),
        successToolCall('leave-channel'),
        successToolCall('reply'),
        // successToolCall('react'),
        successToolCall('skip'),
      ],
      experimental_telemetry: {
        isEnabled: true,
        functionId: `chat`,
        metadata: {
          userId: userId || 'unknown-user',
        },
      },
    });

    return { success: true, toolCalls };
  } catch (e) {
    return {
      success: false,
      error: (e as Error)?.message,
    };
  }
}
