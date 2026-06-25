interface TaskRenderInput {
  input: unknown;
  output?: unknown;
  toolName: string;
}

interface RenderedTask {
  details?: string;
  output?: string;
  title?: string;
}

type TaskRenderer = (input: TaskRenderInput) => RenderedTask;

export interface DefaultTaskRenderer {
  error: TaskRenderer;
  request: TaskRenderer;
  response: TaskRenderer;
}

export interface TaskRendererEntry {
  request?: TaskRenderer;
  response?: TaskRenderer;
  title: string;
}
