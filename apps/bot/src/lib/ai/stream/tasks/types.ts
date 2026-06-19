interface ToolTaskRenderInput {
  input: unknown;
  output?: unknown;
  toolName: string;
}

interface ToolTaskRenderResult {
  details?: string;
  output?: string;
  title?: string;
}

type ToolTaskRenderer = (input: ToolTaskRenderInput) => ToolTaskRenderResult;

export interface DefaultToolTaskRenderer {
  error: ToolTaskRenderer;
  request: ToolTaskRenderer;
  response: ToolTaskRenderer;
}

export interface ToolTaskRendererEntry {
  request?: ToolTaskRenderer;
  response?: ToolTaskRenderer;
  title: string;
}
