import type { Fighter } from '../entities/Fighter';

export type Attack = {
  damage: number;
  knockback: number;
};

export function applyAttack(target: Fighter, attack: Attack) {
  target.takeDamage(attack.damage);
}
