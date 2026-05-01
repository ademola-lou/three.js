import type { Vector2Like } from '../utils/math';

export type Hitbox = {
  center: Vector2Like;
  radius: number;
};

export function hitboxesOverlap(a: Hitbox, b: Hitbox) {
  const dx = a.center.x - b.center.x;
  const dy = a.center.y - b.center.y;
  const radius = a.radius + b.radius;

  return dx * dx + dy * dy <= radius * radius;
}
