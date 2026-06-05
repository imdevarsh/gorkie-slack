import type { ModelMessage } from 'ai';
import { setStatus } from '@/lib/ai/utils/status';
import {
  DENIAL_REASON,
  isApproved,
} from '@/slack/features/customizations/mcp/reply';
import type { ChatRequestHints, SlackMessageContext } from '@/types';
import type { ApprovalOutcome } from './approval-helpers';
import { runAgent } from './respond';

/**
 * Resume a paused run after the user replies to an MCP approval. Appends the
 * tool-approval-response(s) derived from the decision and re-runs the agent.
 * This is the only bridge from an approval decision back into a response.
 */
export async function resumeResponse({
  approvals,
  context,
  messages,
  requestHints,
}: {
  approvals: ApprovalOutcome[];
  context: SlackMessageContext;
  messages: ModelMessage[];
  requestHints: ChatRequestHints;
}) {
  const anyApproved = approvals.some((a) => isApproved(a.reply));
  await setStatus(context, {
    status: anyApproved ? 'is continuing' : 'is handling the denial',
  });
  return await runAgent({
    context,
    messages: [
      ...messages,
      {
        role: 'tool',
        content: approvals.map((approval) => {
          const approved = isApproved(approval.reply);
          return {
            type: 'tool-approval-response',
            approvalId: approval.approvalId,
            approved,
            ...(approved ? {} : { reason: DENIAL_REASON }),
          };
        }),
      },
    ],
    requestHints,
  });
}
