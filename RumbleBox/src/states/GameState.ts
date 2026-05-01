import { proxy } from 'valtio';
import { gameConfig } from '../config';

export type GameStatus = 'ready' | 'playing' | 'paused' | 'ended';
export type FighterState = 'idle' | 'moving' | 'attacking' | 'stunned';

type GameState = {
  status: GameStatus;
  player: {
    health: number;
    fighterState: FighterState;
    position: {
      x: number;
      z: number;
    };
  };
};

export const gameState = proxy<GameState>({
  status: 'ready' as GameStatus,
  player: {
    health: gameConfig.player.maxHealth,
    fighterState: 'idle' as FighterState,
    position: {
      x: gameConfig.player.spawnPosition.x,
      z: gameConfig.player.spawnPosition.z,
    },
  },
});

function canTransitionFighterState(from: FighterState, to: FighterState) {
  if (from === 'stunned') {
    return to === 'idle';
  }

  return true;
}

export function setGameStatus(status: GameStatus) {
  gameState.status = status;
}

export function setPlayerHealth(health: number) {
  gameState.player.health = Math.max(0, Math.min(gameConfig.player.maxHealth, health));
}

export function setPlayerPosition(x: number, z: number) {
  gameState.player.position.x = x;
  gameState.player.position.z = z;
}

export function setPlayerFighterState(state: FighterState) {
  if (gameState.player.fighterState === state) {
    return true;
  }

  if (!canTransitionFighterState(gameState.player.fighterState, state)) {
    return false;
  }

  gameState.player.fighterState = state;
  return true;
}
