export interface ToolStartInput {
  args: unknown;
  status?: string;
  toolName: string;
}

export interface ToolEndInput {
  isError: boolean;
  result: unknown;
  toolName: string;
}
