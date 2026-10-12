import type { GamePlayer } from "../types/game.types";

/**
 * Returns true if all 4 tokens of the player have reached FINISHED.
 */
export function isPlayerWinner(player: GamePlayer): boolean {
  return (
    player.tokens.token1.type === "FINISHED" &&
    player.tokens.token2.type === "FINISHED" &&
    player.tokens.token3.type === "FINISHED" &&
    player.tokens.token4.type === "FINISHED"
  );
}
