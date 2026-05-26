import * as topicSummariesCmd from './commands/topic-summaries';

export const topicSummaries = {
  commands: [
    {
      name: topicSummariesCmd.name,
      execute: topicSummariesCmd.execute,
      help: topicSummariesCmd.help,
    },
  ],
};
