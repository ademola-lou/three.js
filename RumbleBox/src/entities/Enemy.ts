import { Fighter } from './Fighter';

export class Enemy extends Fighter {
  constructor(id: string) {
    super(id, 'enemy');
  }
}
