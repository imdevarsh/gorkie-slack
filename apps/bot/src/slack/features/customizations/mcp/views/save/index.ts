import { views } from '../../ids';
import { selectedFieldValue } from '../../schema';
import type { SubmitArgs } from '../../types';
import { executeBearerSave } from './bearer';
import { executeOAuthSave } from './oauth';

export const name = views.add;

export async function execute(args: SubmitArgs): Promise<void> {
  const auth =
    selectedFieldValue({ field: 'auth', values: args.view.state.values }) ||
    'oauth';
  return await (auth === 'bearer'
    ? executeBearerSave(args)
    : executeOAuthSave(args));
}
