import { gork } from './gork';
import { simba } from './simba';

export interface Persona {
  description: string;
  id: string;
  name: string;
  prompt: string;
}

export const PERSONAS: Record<string, Persona> = {
  gork,
  simba,
};

export const PERSONA_LIST: Persona[] = Object.values(PERSONAS);
