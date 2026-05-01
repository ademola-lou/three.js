import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { gameConfig } from '../../config';
import type { InputState } from '../../mechanics/Input';
import { gameState, setPlayerFighterState, setPlayerPosition } from '../../states/GameState';
import { clamp, normalizeVector2 } from '../../utils/math';
import type { CharacterAnimationsController } from './useCharacterAnimations';

type MutableRef<T> = {
  current: T;
};

type PlayerControllerOptions = {
  animations: CharacterAnimationsController;
  groupRef: MutableRef<Group | null>;
  inputRef: MutableRef<InputState>;
};

export function usePlayerController({
  animations,
  groupRef,
  inputRef,
}: PlayerControllerOptions) {
  const wasAttackPressedRef = useRef(false);

  useFrame((_, deltaSeconds) => {
    const input = inputRef.current;
    const movement = normalizeVector2({
      x: Number(input.right) - Number(input.left),
      y: Number(input.down) - Number(input.up),
    });
    const isMoving = movement.x !== 0 || movement.y !== 0;
    const attackJustPressed = input.attack && !wasAttackPressedRef.current;

    wasAttackPressedRef.current = input.attack;

    if (attackJustPressed && animations.playAttack()) {
      setPlayerFighterState('attacking');
    }

    if (!animations.isAttacking()) {
      setPlayerFighterState(isMoving ? 'moving' : 'idle');
      animations.playLocomotion(isMoving);
    }

    animations.update(deltaSeconds);

    if (!isMoving) {
      return;
    }

    const halfArenaWidth = gameConfig.arena.width / 2;
    const halfArenaDepth = gameConfig.arena.depth / 2;
    const nextX = clamp(
      gameState.player.position.x + movement.x * gameConfig.player.speed * deltaSeconds,
      -halfArenaWidth,
      halfArenaWidth,
    );
    const nextZ = clamp(
      gameState.player.position.z + movement.y * gameConfig.player.speed * deltaSeconds,
      -halfArenaDepth,
      halfArenaDepth,
    );

    setPlayerPosition(nextX, nextZ);

    if (groupRef.current) {
      groupRef.current.position.x = nextX;
      groupRef.current.position.z = nextZ;
      groupRef.current.rotation.y = Math.atan2(movement.x, movement.y) + Math.PI * 2;
    }
  });
}
