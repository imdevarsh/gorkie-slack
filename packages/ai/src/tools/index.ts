import type { ToolSet } from 'ai';
import { searchWeb } from './search-web';

// Gorkie's own host tools (run on the host alongside pi). Slack-affordance tools
// come from chat/ai and are wired in apps/bot where the Chat instance lives.
export function createTools({ exaApiKey }: { exaApiKey: string }): ToolSet {
  return {
    searchWeb: searchWeb({ apiKey: exaApiKey }),
  };
}
