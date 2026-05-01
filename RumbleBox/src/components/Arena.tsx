import { gameConfig } from '../config';

export function Arena() {
  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[gameConfig.arena.width, gameConfig.arena.depth]} />
      <meshStandardMaterial color="#23283a" roughness={0.85} />
    </mesh>
  );
}
