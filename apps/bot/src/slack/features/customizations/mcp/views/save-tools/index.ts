import { publishHome } from '../../../publish';
import { views } from '../../ids';
import type { SubmitArgs } from '../../types';

export const name = views.configure;

export async function execute({
  ack,
  body,
  client,
}: SubmitArgs): Promise<void> {
  await ack();
  await publishHome({ client, userId: body.user.id });
}
