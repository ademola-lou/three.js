import { useSnapshot } from 'valtio';
import { gameConfig } from '../config';
import { gameState } from '../states/GameState';

export function Hud() {
  const snapshot = useSnapshot(gameState);

  return (
    <div className="hud" aria-label="Game HUD">
      <strong>{gameConfig.title}</strong>
      <span>Health: {snapshot.player.health}</span>
      <span>State: {snapshot.player.fighterState}</span>
    </div>
  );
}
