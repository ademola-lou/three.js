import { Arena } from '../components/Arena';
import { Character } from '../components/Character';
import { gameConfig } from '../config';

export function SceneManager() {
  return (
    <>
      <color attach="background" args={['#090a0f']} />
      <ambientLight intensity={0.45} />
      <directionalLight
        castShadow
        intensity={1.8}
        position={[5, 8, 5]}
        shadow-mapSize={[1024, 1024]}
      />
      <Arena />
      <Character
        position={[
          gameConfig.player.spawnPosition.x,
          gameConfig.player.spawnPosition.y,
          gameConfig.player.spawnPosition.z,
        ]}
      />
    </>
  );
}
