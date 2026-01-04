export const replyPrompt = `\
<task>
Reply briefly, naturally, and only once.
</task>
`;

export const summariseThreadPrompt = (instructions?: string) => `\
<task>
Summarise this Slack thread concisely.
Focus on key points, decisions made, action items, and any unresolved questions.
Keep the summary brief but comprehensive.
${instructions ? `\nAdditional instructions: ${instructions}` : ''}
</task>
`;

// TODO: the response format manually needs to be passed due to https://github.com/OpenRouterTeam/ai-sdk-provider/issues/120, this issue.
