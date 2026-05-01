type Vector3Tuple = [number, number, number];

type GameConfig = {
  title: string;
  camera: {
    fov: number;
    position: Vector3Tuple;
  };
  arena: {
    width: number;
    depth: number;
  };
  player: {
    speed: number;
    maxHealth: number;
    spawnPosition: {
      x: number;
      y: number;
      z: number;
    };
  };
};

export const gameConfig: GameConfig = {
  title: 'RumbleBox',
  camera: {
    fov: 50,
    position: [0, 6, 9],
  },
  arena: {
    width: 12,
    depth: 12,
  },
  player: {
    speed: 5,
    maxHealth: 100,
    spawnPosition: {
      x: -4.25,
      y: 0.0,
      z: 2.5,
    },
  },
};
