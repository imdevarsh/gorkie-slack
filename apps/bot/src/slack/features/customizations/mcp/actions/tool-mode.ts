import { inputs } from '../ids';
import type { SelectArgs } from '../types';

export const name = inputs.toolMode;

export async function execute({ ack }: SelectArgs): Promise<void> {
  await ack();
}
