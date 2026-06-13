export const appHome = {
  maxPromptDisplay: 200,
  maxTaskPrompt: 80,
  maxMCPNameDisplay: 40,
  maxMCPServersDisplay: 12,
  maxMCPUrlDisplay: 80,
};

export const assistantThread = {
  suggestedPrompts: {
    dm: [
      {
        title: 'Search the web',
        message: 'What are the top AI news stories today?',
      },
      {
        title: 'Write and run code',
        message:
          'Write and run a Python script that plots a sine wave and sends me the image.',
      },
      {
        title: 'Generate an image',
        message: 'Generate an image of a futuristic city at night.',
      },
      {
        title: 'Browse a website',
        message:
          'Take a screenshot of https://example.com and describe what you see.',
      },
    ],
    channel: [
      {
        title: 'Summarize this channel',
        message: 'Summarize the recent activity in this channel.',
      },
      {
        title: 'Search Slack',
        message: 'Search Slack for recent messages about this project.',
      },
      {
        title: 'Write and run code',
        message:
          'Write and run a Python script that plots a sine wave and sends me the image.',
      },
      {
        title: 'Generate an image',
        message: 'Generate an image of a futuristic city at night.',
      },
    ],
  },
};

export const sandbox = {
  template: 'gorkie-sandbox:3.0',
  model: {
    modelId: 'google/gemini-3-flash-preview',
  },
  timeoutMs: 10 * 60 * 1000,
  autoDeleteAfterMs: 7 * 24 * 60 * 60 * 1000,
  janitorIntervalMs: 60 * 1000,
  toolOutput: {
    detailsMaxChars: 180,
    titleMaxChars: 60,
    outputMaxChars: 260,
  },
  runtime: {
    workdir: '/home/user',
    executionTimeoutMs: 20 * 60 * 1000,
  },
  attachments: {
    maxBytes: 1_000_000_000,
  },
};

export const mcp = {
  defaultToolMode: 'ask',
  requestTimeoutMs: 15_000,
  taskOutputMaxChars: 260,
  toolModalDefaultCount: 25,
  toolModalMetadataMaxChars: 2800,
};
