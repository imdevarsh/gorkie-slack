import { actions } from './ids';

/**
 * The whole approval decision as one value, like opencode's permission `Reply`.
 * Everything else — the AI SDK approved flag, the denial reason, the card copy,
 * the DB status — is derived from this; nothing is passed alongside it.
 */
export type ApprovalReply = 'once' | 'always' | 'reject';

export const DENIAL_REASON = 'Access denied by Slack approval.';

export function replyFromActionId(actionId: string): ApprovalReply {
  if (actionId === actions.approval.always) {
    return 'always';
  }
  if (actionId === actions.approval.deny) {
    return 'reject';
  }
  return 'once';
}

export function isApproved(reply: ApprovalReply): boolean {
  return reply !== 'reject';
}

export function replyStatus(reply: ApprovalReply): 'approved' | 'denied' {
  return reply === 'reject' ? 'denied' : 'approved';
}

export function replyCard(reply: ApprovalReply): {
  text: string;
  title: string;
} {
  if (reply === 'always') {
    return { text: 'Approved for this thread.', title: 'Approved for thread' };
  }
  if (reply === 'reject') {
    return { text: 'Access denied.', title: 'Access denied' };
  }
  return { text: 'Approved once.', title: 'Approved once' };
}
