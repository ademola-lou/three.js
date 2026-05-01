import type { Vector2Like } from '../utils/math';

export function integratePosition(
  position: Vector2Like,
  velocity: Vector2Like,
  deltaSeconds: number,
): Vector2Like {
  return {
    x: position.x + velocity.x * deltaSeconds,
    y: position.y + velocity.y * deltaSeconds,
  };
}
