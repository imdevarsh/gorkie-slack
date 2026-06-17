export interface ToolTaskRenderInput {
  input: unknown;
  output?: unknown;
  toolName: string;
}

export interface ToolTaskRenderResult {
  details?: string;
  output?: string;
  title?: string;
}

export type ToolTaskRenderer = (
  input: ToolTaskRenderInput
) => ToolTaskRenderResult;
