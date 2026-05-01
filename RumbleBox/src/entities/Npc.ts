import { Fighter } from './Fighter';

export class Npc extends Fighter {
  constructor(id: string) {
    super(id, 'npc');
  }
}
