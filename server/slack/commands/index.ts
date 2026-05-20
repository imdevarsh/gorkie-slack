import { handleCommand } from './handler';

export const commands = [
  { pattern: /^\/gorkie(?:-\w+)?$/, execute: handleCommand },
];
