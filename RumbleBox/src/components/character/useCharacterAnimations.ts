import { useCallback, useEffect, useRef } from 'react';
import {
  AnimationMixer,
  LoopOnce,
  type AnimationAction,
  type AnimationClip,
  type Object3D,
} from 'three';

const characterAnimationConfig = {
  states: {
    idle: 'Idle_Loop',
    run: 'run',
    attacks: ['Punch_Jab', 'Punch_Cross'],
  },
  fallbacks: {
    run: ['walk'],
  },
  fades: {
    defaultSeconds: 0.2,
    attackRecoverySeconds: 0.28,
    attackBlendInSeconds: 0.07,
    attackComboSeconds: 0.085,
  },
  timing: {
    /** > 1 runs attack clips faster for a sharper feel */
    attackTimeScale: 1.55,
  },
};

type CharacterAnimationsOptions = {
  clips: AnimationClip[];
  model: Object3D;
  onAttackFinished: () => void;
};

export type CharacterAnimationsController = {
  isAttacking: () => boolean;
  playAttack: () => boolean;
  playLocomotion: (isMoving: boolean) => void;
  update: (deltaSeconds: number) => void;
};

function findAction(
  actions: Map<string, AnimationAction>,
  animationNames: string[],
): { name: string; action: AnimationAction } | null {
  for (const animationName of animationNames) {
    const action = actions.get(animationName);

    if (action) {
      return { name: animationName, action };
    }
  }

  const lowerCaseNames = new Set(animationNames.map((name) => name.toLowerCase()));

  for (const [name, action] of actions) {
    if (lowerCaseNames.has(name.toLowerCase())) {
      return { name, action };
    }
  }

  return null;
}

function isAttackClipName(animationName: string) {
  const lower = animationName.toLowerCase();

  return characterAnimationConfig.states.attacks.some(
    (attackName) => attackName.toLowerCase() === lower,
  );
}

function getFadeSeconds(from: string | null, to: string) {
  if (from && isAttackClipName(from) && isAttackClipName(to)) {
    return characterAnimationConfig.fades.attackComboSeconds;
  }

  if (from && isAttackClipName(from) && !isAttackClipName(to)) {
    return characterAnimationConfig.fades.attackRecoverySeconds;
  }

  if (isAttackClipName(to)) {
    return characterAnimationConfig.fades.attackBlendInSeconds;
  }

  return characterAnimationConfig.fades.defaultSeconds;
}

export function useCharacterAnimations({
  clips,
  model,
  onAttackFinished,
}: CharacterAnimationsOptions): CharacterAnimationsController {
  const mixerRef = useRef<AnimationMixer | null>(null);
  const actionsRef = useRef(new Map<string, AnimationAction>());
  const activeAnimationRef = useRef<string | null>(null);
  const isAttackingRef = useRef(false);
  const nextAttackIndexRef = useRef(0);

  const playAnimation = useCallback((animationName: string) => {
    const actions = actionsRef.current;
    const animationNames =
      animationName === characterAnimationConfig.states.run
        ? [characterAnimationConfig.states.run, ...characterAnimationConfig.fallbacks.run]
        : [animationName];
    const nextAnimation = findAction(actions, animationNames);

    if (!nextAnimation || activeAnimationRef.current === nextAnimation.name) {
      return false;
    }

    const previousAction = activeAnimationRef.current
      ? actions.get(activeAnimationRef.current)
      : undefined;

    const fadeSeconds = getFadeSeconds(activeAnimationRef.current, nextAnimation.name);

    const nextAction = nextAnimation.action;
    nextAction.timeScale = isAttackClipName(nextAnimation.name)
      ? characterAnimationConfig.timing.attackTimeScale
      : 1;

    nextAction.reset();

    if (previousAction) {
      previousAction.crossFadeTo(nextAction, fadeSeconds, false);
    } else {
      nextAction.fadeIn(fadeSeconds);
    }

    nextAction.play();
    activeAnimationRef.current = nextAnimation.name;
    return true;
  }, []);

  useEffect(() => {
    const mixer = new AnimationMixer(model);

    mixerRef.current = mixer;
    actionsRef.current.clear();

    for (const clip of clips) {
      const action = mixer.clipAction(clip);

      if (isAttackClipName(clip.name)) {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
      }

      actionsRef.current.set(clip.name, action);
    }

    const handleFinished = (event: { action: AnimationAction }) => {
      const activeAnimationName = activeAnimationRef.current;

      if (
        !activeAnimationName ||
        !isAttackClipName(activeAnimationName) ||
        event.action !== actionsRef.current.get(activeAnimationName)
      ) {
        return;
      }

      isAttackingRef.current = false;
      onAttackFinished();
    };

    mixer.addEventListener('finished', handleFinished);
    playAnimation(characterAnimationConfig.states.idle);

    return () => {
      mixer.removeEventListener('finished', handleFinished);
      mixer.stopAllAction();
      mixerRef.current = null;
      actionsRef.current.clear();
      activeAnimationRef.current = null;
      isAttackingRef.current = false;
    };
  }, [clips, model, onAttackFinished, playAnimation]);

  const playAttack = useCallback(() => {
    const attackNames = characterAnimationConfig.states.attacks;
    const attackName = attackNames[nextAttackIndexRef.current];
    const didPlay = playAnimation(attackName);

    if (didPlay) {
      nextAttackIndexRef.current = (nextAttackIndexRef.current + 1) % attackNames.length;
    }

    isAttackingRef.current = didPlay;
    return didPlay;
  }, [playAnimation]);

  const playLocomotion = useCallback(
    (isMoving: boolean) => {
      playAnimation(
        isMoving
          ? characterAnimationConfig.states.run
          : characterAnimationConfig.states.idle,
      );
    },
    [playAnimation],
  );

  const isAttacking = useCallback(() => isAttackingRef.current, []);

  const update = useCallback((deltaSeconds: number) => {
    mixerRef.current?.update(deltaSeconds);
  }, []);

  return {
    isAttacking,
    playAttack,
    playLocomotion,
    update,
  };
}
