import { Canvas } from '@react-three/fiber';
import { SceneManager } from './SceneManager';
import { gameConfig } from '../config';

export function Experience() {
  return (
    <Canvas
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
      }}
      camera={{
        fov: gameConfig.camera.fov,
        position: gameConfig.camera.position,
      }}
      shadows
    >
      <SceneManager />
    </Canvas>
  );
}
