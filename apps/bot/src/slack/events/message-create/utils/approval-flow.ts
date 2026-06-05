import type { ModelMessage } from 'ai';
import { resolveOrchestratorTask } from '@/lib/ai/agents/orchestrator';
import { setPlanTitle } from '@/lib/ai/utils/stream';
import type {
  ChatRequestHints,
  SlackMessageContext,
  Stream,
  ToolApprovalRequest,
} from '@/types';
import { postApprovalRequest, recordApprovalTask } from './approval-helpers';

export async function pauseForApprovals({
  approvals,
  context,
  messages,
  requestHints,
  stream,
}: {
  approvals: ToolApprovalRequest[];
  context: SlackMessageContext;
  messages: ModelMessage[];
  requestHints: ChatRequestHints;
  stream: Stream;
}): Promise<void> {
  await setPlanTitle(stream, 'Needs Approval');
  await resolveOrchestratorTask({
    context,
    stream,
    title: 'Needs Approval',
    details: 'Paused until you approve or deny the MCP tool call.',
  });
  await Promise.all(
    approvals.map(async (approval) => {
      await recordApprovalTask({ approval, stream });
      await postApprovalRequest({
        approval,
        context,
        messages,
        requestHints,
      });
    })
  );
}
