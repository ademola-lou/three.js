import { useCallback, useEffect, useRef } from 'react';
import { useLoader, type ThreeElements } from '@react-three/fiber';
import type { Group, Mesh, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import xbotUrl from '../assets/char1.glb?url';
import { useKeyboardInput } from '../mechanics/Input';
import { setPlayerFighterState } from '../states/GameState';
import { useCharacterAnimations } from './character/useCharacterAnimations';
import { usePlayerController } from './character/usePlayerController';

type CharacterProps = Pick<ThreeElements['group'], 'position'>;

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh;
}

export function Character({ position }: CharacterProps) {
  const groupRef = useRef<Group | null>(null);
  const inputRef = useKeyboardInput();
  const gltf = useLoader(GLTFLoader, xbotUrl);
  const model = gltf.scene;
  const handleAttackFinished = useCallback(() => {
    setPlayerFighterState('idle');
  }, []);
  const animations = useCharacterAnimations({
    clips: gltf.animations,
    model,
    onAttackFinished: handleAttackFinished,
  });

  usePlayerController({
    animations,
    groupRef,
    inputRef,
  });

  useEffect(() => {
    model.traverse((child) => {
      if (isMesh(child)) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [model]);

  return (
    <group ref={groupRef} position={position} rotation={[0, Math.PI / 2, 0]} scale={0.85}>
      <primitive object={model} />
    </group>
  );
}
