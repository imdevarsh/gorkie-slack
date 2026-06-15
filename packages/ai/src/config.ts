export const modelConfig = {
  modelId: 'google/gemini-3-flash-preview',
  thinkingLevel: 'medium',
  // HackClub's OpenAI/OpenRouter-compatible proxy. pi routes to it via the
  // OPENROUTER_API_KEY / OPENROUTER_BASE_URL env it reads from `auth.customEnv`.
  baseUrl: 'https://ai.hackclub.com/proxy/v1',
} as const;
