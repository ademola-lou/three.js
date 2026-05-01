import { Fighter } from './Fighter';

export class Player extends Fighter {
  constructor(id = 'player') {
    super(id, 'player');
  }
}
