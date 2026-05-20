import { gork } from './gork';
import { simba } from './simba';

export interface Persona {
  description: string;
  id: string;
  name: string;
  prompt: string;
}

export const personas: Persona[] = [gork, simba];
