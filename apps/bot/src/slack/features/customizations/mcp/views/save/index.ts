import { blocks, inputs, views } from '../../ids';
import { viewSelectedSchema } from '../../schema';
import type { SubmitArgs } from '../../types';
import { executeBearerSave } from './bearer';
import { executeOAuthSave } from './oauth';

export const name = views.add;

export async function execute(args: SubmitArgs): Promise<void> {
  const auth =
    viewSelectedSchema.parse(args.view.state.values[blocks.auth]?.[inputs.auth])
      .selected_option?.value ?? 'oauth';
  return await (auth === 'bearer'
    ? executeBearerSave(args)
    : executeOAuthSave(args));
}
