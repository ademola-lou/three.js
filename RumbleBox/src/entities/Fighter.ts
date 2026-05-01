import { gameConfig } from '../config';
import type { Vector2Like } from '../utils/math';

export type FighterTeam = 'player' | 'enemy' | 'npc';

export class Fighter {
  health = gameConfig.player.maxHealth;

  constructor(
    public readonly id: string,
    public readonly team: FighterTeam,
    public position: Vector2Like = { x: 0, y: 0 },
  ) {}

  get isAlive() {
    return this.health > 0;
  }

  takeDamage(amount: number) {
    this.health = Math.max(0, this.health - amount);
  }
}
