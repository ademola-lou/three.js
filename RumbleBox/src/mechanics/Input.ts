import { useEffect, useRef } from 'react';

export type InputState = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  attack: boolean;
};

export const defaultInputState: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  attack: false,
};

function setInputKey(input: InputState, code: string, pressed: boolean) {
  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      input.up = pressed;
      break;
    case 'ArrowDown':
    case 'KeyS':
      input.down = pressed;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      input.left = pressed;
      break;
    case 'ArrowRight':
    case 'KeyD':
      input.right = pressed;
      break;
    case 'Space':
      input.attack = pressed;
      break;
  }
}

export function useKeyboardInput() {
  const inputRef = useRef<InputState>({ ...defaultInputState });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      setInputKey(inputRef.current, event.code, true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      setInputKey(inputRef.current, event.code, false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return inputRef;
}
