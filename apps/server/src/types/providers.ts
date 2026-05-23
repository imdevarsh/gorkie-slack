export interface Provider {
  apiKey: string;
  url: string;
}

export interface ProviderConfig {
  apiKey: string | undefined;
  name: string;
  url: string;
}
