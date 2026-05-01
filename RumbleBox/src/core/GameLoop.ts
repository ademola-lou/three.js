export type GameLoopCallback = (deltaSeconds: number) => void;

export class GameLoop {
  private callbacks = new Set<GameLoopCallback>();

  add(callback: GameLoopCallback) {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  tick(deltaSeconds: number) {
    for (const callback of this.callbacks) {
      callback(deltaSeconds);
    }
  }
}
