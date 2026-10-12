import { describe, expect, test } from "bun:test";
import {
  createGame,
  startGame,
  addPlayerToGame,
  rollDice,
  moveToken,
  removePlayer,
  calculateLegalMoves,
  computeTargetPosition,
  getTokenStepCount,
  isSafeTrackIndex,
  SAFE_TRACK_INDICES,
  PLAYER_SLOT_CONFIG,
  GameEngineError,
} from "../index";
import type { GameState, GamePlayer } from "../types";

describe("Milestone 7: Pure TypeScript Ludo Game Engine", () => {
  // 1. Board Configuration & Geometry
  describe("1. Board Configuration & Geometry", () => {
    test("has 8 standard safe squares including 4 start squares and 4 star squares", () => {
      expect(SAFE_TRACK_INDICES).toEqual([0, 8, 13, 21, 26, 34, 39, 47]);
      for (const idx of [0, 8, 13, 21, 26, 34, 39, 47]) {
        expect(isSafeTrackIndex(idx)).toBe(true);
      }
      expect(isSafeTrackIndex(1)).toBe(false);
      expect(isSafeTrackIndex(50)).toBe(false);
    });

    test("slot configurations define clockwise colors: RED, GREEN, YELLOW, BLUE", () => {
      expect(PLAYER_SLOT_CONFIG[0].color).toBe("RED");
      expect(PLAYER_SLOT_CONFIG[1].color).toBe("GREEN");
      expect(PLAYER_SLOT_CONFIG[2].color).toBe("YELLOW");
      expect(PLAYER_SLOT_CONFIG[3].color).toBe("BLUE");

      expect(PLAYER_SLOT_CONFIG[0].startTrackIndex).toBe(0);
      expect(PLAYER_SLOT_CONFIG[1].startTrackIndex).toBe(13);
      expect(PLAYER_SLOT_CONFIG[2].startTrackIndex).toBe(26);
      expect(PLAYER_SLOT_CONFIG[3].startTrackIndex).toBe(39);
    });

    test("each player exits track exactly after 50 steps from start", () => {
      expect(PLAYER_SLOT_CONFIG[0].exitTrackIndex).toBe(50);
      expect(PLAYER_SLOT_CONFIG[1].exitTrackIndex).toBe(11); // (13 + 50) % 52 = 11
      expect(PLAYER_SLOT_CONFIG[2].exitTrackIndex).toBe(24); // (26 + 50) % 52 = 24
      expect(PLAYER_SLOT_CONFIG[3].exitTrackIndex).toBe(37); // (39 + 50) % 52 = 37
    });
  });

  // 2. Game Creation & Player Management
  describe("2. Game Creation & Slots", () => {
    test("creates 4-player game directly IN_PROGRESS with version 1", () => {
      const game = createGame("game-1", [
        { userId: "u1", username: "Player1" },
        { userId: "u2", username: "Player2" },
        { userId: "u3", username: "Player3" },
        { userId: "u4", username: "Player4" },
      ]);

      expect(game.gameId).toBe("game-1");
      expect(game.status).toBe("IN_PROGRESS");
      expect(game.version).toBe(1);
      expect(game.currentTurn).toBe(0);
      expect(game.turnPhase).toBe("WAITING_FOR_ROLL");
      expect(game.diceValue).toBeNull();
      expect(game.consecutiveSixes).toBe(0);

      expect(game.players[0]?.color).toBe("RED");
      expect(game.players[1]?.color).toBe("GREEN");
      expect(game.players[2]?.color).toBe("YELLOW");
      expect(game.players[3]?.color).toBe("BLUE");

      // All 4 tokens start in HOME
      for (let i = 0; i < 4; i++) {
        expect(game.players[i]?.tokens.token1).toEqual({ type: "HOME" });
        expect(game.players[i]?.tokens.token2).toEqual({ type: "HOME" });
        expect(game.players[i]?.tokens.token3).toEqual({ type: "HOME" });
        expect(game.players[i]?.tokens.token4).toEqual({ type: "HOME" });
      }
    });

    test("creates 2-player private waiting game and explicitly starts", () => {
      let game = createGame(
        "game-2",
        [{ userId: "u1", username: "Player1" }],
        { status: "WAITING" }
      );

      expect(game.status).toBe("WAITING");
      expect(game.currentTurn).toBeNull();

      // Cannot start with only 1 player
      expect(() => startGame(game)).toThrow(GameEngineError);

      // Add second player to slot 2 (Yellow)
      game = addPlayerToGame(game, { userId: "u2", username: "Player2" }, 2);
      expect(game.players[2]?.color).toBe("YELLOW");
      expect(game.version).toBe(2);

      // Start game
      game = startGame(game);
      expect(game.status).toBe("IN_PROGRESS");
      expect(game.currentTurn).toBe(0);
      expect(game.turnPhase).toBe("WAITING_FOR_ROLL");
      expect(game.version).toBe(3);
    });
  });

  // 3. Leaving Home Logic
  describe("3. Leaving Home", () => {
    test("tokens cannot leave HOME on rolling 1..5", () => {
      const game = createGame("game-home", [
        { userId: "u1", username: "Player1" },
        { userId: "u2", username: "Player2" },
      ]);

      const rollRes = rollDice(game, 5);
      // Since no tokens can leave home on 5, legalMoves is empty and turn ends immediately
      expect(rollRes.legalMoves).toEqual([]);
      expect(rollRes.turnEnded).toBe(true);
      expect(rollRes.nextTurn).toBe(1); // passed to next player
      expect(rollRes.nextPhase).toBe("WAITING_FOR_ROLL");
    });

    test("token leaves HOME to start square on rolling 6", () => {
      const game = createGame("game-home-6", [
        { userId: "u1", username: "Player1" },
        { userId: "u2", username: "Player2" },
      ]);

      const rollRes = rollDice(game, 6);
      expect(rollRes.legalMoves).toContain("token1");
      expect(rollRes.legalMoves).toContain("token2");
      expect(rollRes.legalMoves).toContain("token3");
      expect(rollRes.legalMoves).toContain("token4");
      expect(rollRes.turnEnded).toBe(false);
      expect(rollRes.nextPhase).toBe("WAITING_FOR_MOVE");

      // Move token1
      const moveRes = moveToken(rollRes.nextState, "token1");
      expect(moveRes.toPosition).toEqual({ type: "TRACK", index: 0 }); // Red start is 0
      expect(moveRes.hasBonusRoll).toBe(true); // Rolled a six bonus!
      expect(moveRes.bonusReason).toBe("SIX_ROLLED");
      expect(moveRes.turnEnded).toBe(false);
      expect(moveRes.nextTurn).toBe(0); // Red still plays!
      expect(moveRes.nextPhase).toBe("WAITING_FOR_ROLL");
    });
  });

  // 4. Consecutive Sixes Rule
  describe("4. Consecutive Sixes Handling", () => {
    test("rolling three consecutive sixes invalidates the third six and ends turn immediately", () => {
      let game = createGame("game-sixes", [
        { userId: "u1", username: "Player1" },
        { userId: "u2", username: "Player2" },
      ]);

      // 1st Six
      let roll1 = rollDice(game, 6);
      expect(roll1.consecutiveSixes).toBe(1);
      expect(roll1.isThirdConsecutiveSix).toBe(false);
      let move1 = moveToken(roll1.nextState, "token1");
      expect(move1.nextState.currentTurn).toBe(0);

      // 2nd Six
      let roll2 = rollDice(move1.nextState, 6);
      expect(roll2.consecutiveSixes).toBe(2);
      expect(roll2.isThirdConsecutiveSix).toBe(false);
      let move2 = moveToken(roll2.nextState, "token2");
      expect(move2.nextState.currentTurn).toBe(0);

      // 3rd Six -> Invalidation!
      let roll3 = rollDice(move2.nextState, 6);
      expect(roll3.consecutiveSixes).toBe(3);
      expect(roll3.isThirdConsecutiveSix).toBe(true);
      expect(roll3.legalMoves).toEqual([]);
      expect(roll3.turnEnded).toBe(true);
      expect(roll3.nextTurn).toBe(1); // turn ended and advanced to player 2!
      expect(roll3.nextState.consecutiveSixes).toBe(0); // reset counter
    });
  });

  // 5. Track Movement, Step Counting & Wrapping
  describe("5. Main Track Movement & Wrapping", () => {
    test("Green player starts at 13 and advances along track", () => {
      let game = createGame("game-track", [
        { userId: "u1", username: "Player1" },
        { userId: "u2", username: "Player2" }, // slot 1: Green
      ]);

      // Advance turn to Green (slot 1)
      game = { ...game, currentTurn: 1 };

      const roll1 = rollDice(game, 6);
      const move1 = moveToken(roll1.nextState, "token1");
      expect(move1.toPosition).toEqual({ type: "TRACK", index: 13 });

      // Green rolls 5 -> advances from 13 to 18
      const roll2 = rollDice(move1.nextState, 5);
      const move2 = moveToken(roll2.nextState, "token1");
      expect(move2.toPosition).toEqual({ type: "TRACK", index: 18 });
      expect(move2.turnEnded).toBe(true);
      expect(move2.nextTurn).toBe(0); // passed to Red
    });

    test("track wraps around index 51 to 0 properly", () => {
      const pos = computeTargetPosition({ type: "TRACK", index: 49 }, 3, 5); // Blue (slot 3, start 39)
      // Blue start is 39. Steps at 49: (49 - 39 + 52) % 52 = 10 steps.
      // Moving 5 steps -> 15 steps. Track index: (39 + 15) % 52 = 2.
      expect(pos).toEqual({ type: "TRACK", index: 2 });
    });
  });

  // 6. Transition into Final Path & Movement
  describe("6. Final Path Movement & Protection", () => {
    test("Red token at exit square 50 enters final path index 0 on next step", () => {
      // Red start is 0. Exit square is 50 (50 steps).
      const pos = computeTargetPosition({ type: "TRACK", index: 50 }, 0, 1);
      expect(pos).toEqual({ type: "FINAL_PATH", index: 0 }); // 51st step
    });

    test("Red token moves through final path", () => {
      // From final path index 1 (step 52), rolling 3 goes to final path index 4 (step 55)
      const pos = computeTargetPosition({ type: "FINAL_PATH", index: 1 }, 0, 3);
      expect(pos).toEqual({ type: "FINAL_PATH", index: 4 });
    });
  });

  // 7. Exact Finishing Rule
  describe("7. Exact Finishing & Overshoot Prevention", () => {
    test("token at final path index 4 requires exact 1 to finish", () => {
      // Final path index 4 is step 55. Total steps to finish is 56.
      const finishPos = computeTargetPosition({ type: "FINAL_PATH", index: 4 }, 0, 1);
      expect(finishPos).toEqual({ type: "FINISHED" });

      // Rolling 2 overshoots 56 -> illegal move
      const overshootPos = computeTargetPosition({ type: "FINAL_PATH", index: 4 }, 0, 2);
      expect(overshootPos).toBeNull();

      // Rolling 6 overshoots -> illegal move
      const overshoot6 = computeTargetPosition({ type: "FINAL_PATH", index: 4 }, 0, 6);
      expect(overshoot6).toBeNull();
    });

    test("finished token cannot move again", () => {
      expect(computeTargetPosition({ type: "FINISHED" }, 0, 1)).toBeNull();
    });
  });

  // 8. Capture Logic & Bonus Roll
  describe("8. Captures and Safe Squares", () => {
    test("capturing opponent on regular square sends opponent home and gives bonus roll", () => {
      let game = createGame("game-capture", [
        { userId: "u1", username: "Player1" },
        { userId: "u2", username: "Player2" },
      ]);

      // Set up Red token at 1 (non-safe) and Green token at 1
      game.players[0]!.tokens.token1 = { type: "TRACK", index: 0 };
      game.players[1]!.tokens.token1 = { type: "TRACK", index: 2 }; // Green token at track 2

      // Red rolls 2 and lands on 2
      const roll = rollDice(game, 2);
      const move = moveToken(roll.nextState, "token1");

      expect(move.toPosition).toEqual({ type: "TRACK", index: 2 });
      expect(move.capturedTokens.length).toBe(1);
      expect(move.capturedTokens[0]).toEqual({
        slot: 1,
        tokenKey: "token1",
        userId: "u2",
      });

      // Opponent token is sent back to HOME!
      expect(move.nextState.players[1]?.tokens.token1).toEqual({ type: "HOME" });

      // Red gets a bonus roll for the capture!
      expect(move.hasBonusRoll).toBe(true);
      expect(move.bonusReason).toBe("CAPTURE");
      expect(move.turnEnded).toBe(false);
      expect(move.nextTurn).toBe(0);
      expect(move.nextPhase).toBe("WAITING_FOR_ROLL");
    });

    test("tokens on safe squares cannot be captured", () => {
      let game = createGame("game-safe", [
        { userId: "u1", username: "Player1" },
        { userId: "u2", username: "Player2" },
      ]);

      // Star safe square at index 8
      game.players[0]!.tokens.token1 = { type: "TRACK", index: 6 };
      game.players[1]!.tokens.token1 = { type: "TRACK", index: 8 };

      // Red rolls 2 and lands on safe square 8
      const roll = rollDice(game, 2);
      const move = moveToken(roll.nextState, "token1");

      expect(move.toPosition).toEqual({ type: "TRACK", index: 8 });
      expect(move.capturedTokens.length).toBe(0); // NO CAPTURE on safe square!
      expect(move.nextState.players[1]?.tokens.token1).toEqual({ type: "TRACK", index: 8 }); // Green still there
      expect(move.turnEnded).toBe(true);
    });

    test("capture bonus does not reset consecutive sixes counter", () => {
      let game = createGame("game-bonus-six", [
        { userId: "u1", username: "Player1" },
        { userId: "u2", username: "Player2" },
      ]);

      // Red token at 0, Green at 6 (non-safe)
      game.players[0]!.tokens.token1 = { type: "TRACK", index: 0 };
      game.players[1]!.tokens.token1 = { type: "TRACK", index: 6 };

      // Red rolls 6 (consecutiveSixes = 1) and captures Green at 6
      const roll = rollDice(game, 6);
      const move = moveToken(roll.nextState, "token1");

      expect(move.capturedTokens.length).toBe(1);
      expect(move.nextState.consecutiveSixes).toBe(1); // PRESERVED! Not reset by capture!
    });
  });

  // 9. Turn Progression & Slot Skipping
  describe("9. Turn Progression & Empty Slot Skipping", () => {
    test("skips null slots (e.g. 2-player game in slots 0 and 2)", () => {
      let game = createGame(
        "game-skip",
        [
          { userId: "u1", username: "Player1", slot: 0 },
          { userId: "u2", username: "Player2", slot: 2 },
        ],
        { status: "IN_PROGRESS" }
      );

      expect(game.players[1]).toBeNull();
      expect(game.players[3]).toBeNull();
      expect(game.currentTurn).toBe(0);

      // Player 0 rolls 3 with no legal moves -> turn passes to slot 2 (skips slot 1!)
      const roll = rollDice(game, 3);
      expect(roll.nextTurn).toBe(2);
      expect(roll.nextState.currentTurn).toBe(2);

      // Player 2 rolls 3 with no legal moves -> turn passes to slot 0 (skips slot 3!)
      const roll2 = rollDice(roll.nextState, 3);
      expect(roll2.nextTurn).toBe(0);
      expect(roll2.nextState.currentTurn).toBe(0);
    });
  });

  // 10. Win Detection
  describe("10. Win Detection", () => {
    test("player wins when all 4 tokens reach FINISHED", () => {
      let game = createGame("game-win", [
        { userId: "u1", username: "Player1" },
        { userId: "u2", username: "Player2" },
      ]);

      // Set token 1, 2, 3 as FINISHED, token 4 at final path 4
      game.players[0]!.tokens.token1 = { type: "FINISHED" };
      game.players[0]!.tokens.token2 = { type: "FINISHED" };
      game.players[0]!.tokens.token3 = { type: "FINISHED" };
      game.players[0]!.tokens.token4 = { type: "FINAL_PATH", index: 4 };

      // Red rolls exact 1 to finish token4
      const roll = rollDice(game, 1);
      const move = moveToken(roll.nextState, "token4");

      expect(move.isWin).toBe(true);
      expect(move.nextState.status).toBe("COMPLETED");
      expect(move.nextState.winnerUserId).toBe("u1");
      expect(move.nextState.winningSlot).toBe(0);
    });
  });

  // 11. Player Removal & Forfeit
  describe("11. Player Removal", () => {
    test("removes player and advances turn if it was their turn", () => {
      let game = createGame("game-remove", [
        { userId: "u1", username: "Player1" },
        { userId: "u2", username: "Player2" },
        { userId: "u3", username: "Player3" },
      ]);

      expect(game.currentTurn).toBe(0);
      // Remove Player 0
      const nextGame = removePlayer(game, 0);

      expect(nextGame.players[0]).toBeNull();
      expect(nextGame.currentTurn).toBe(1); // advanced to player 1
      expect(nextGame.status).toBe("IN_PROGRESS");
    });

    test("if all opponents leave, last remaining player wins by forfeit", () => {
      let game = createGame("game-forfeit", [
        { userId: "u1", username: "Player1" },
        { userId: "u2", username: "Player2" },
      ]);

      const nextGame = removePlayer(game, 1);
      expect(nextGame.status).toBe("COMPLETED");
      expect(nextGame.winnerUserId).toBe("u1");
      expect(nextGame.winningSlot).toBe(0);
    });

    test("if all players leave, game is ABANDONED", () => {
      let game = createGame("game-abandon", [
        { userId: "u1", username: "Player1" },
      ], { status: "WAITING" });

      const nextGame = removePlayer(game, 0);
      expect(nextGame.status).toBe("ABANDONED");
      expect(nextGame.currentTurn).toBeNull();
    });
  });

  // 12. State Version & Immutability
  describe("12. Version Increments & Determinism", () => {
    test("every mutation strictly increments version", () => {
      let game = createGame("game-v", [
        { userId: "u1", username: "Player1" },
        { userId: "u2", username: "Player2" },
      ]);
      expect(game.version).toBe(1);

      const roll1 = rollDice(game, 6);
      expect(roll1.nextState.version).toBe(2);

      const move1 = moveToken(roll1.nextState, "token1");
      expect(move1.nextState.version).toBe(3);

      const roll2 = rollDice(move1.nextState, 3);
      expect(roll2.nextState.version).toBe(4);

      const move2 = moveToken(roll2.nextState, "token1");
      expect(move2.nextState.version).toBe(5);
    });

    test("rejects invalid state operations with typed GameEngineError", () => {
      const game = createGame("game-err", [
        { userId: "u1", username: "Player1" },
        { userId: "u2", username: "Player2" },
      ]);

      // Cannot move token when WAITING_FOR_ROLL
      expect(() => moveToken(game, "token1")).toThrow(GameEngineError);

      // Cannot roll with invalid dice value
      expect(() => rollDice(game, 7)).toThrow(GameEngineError);
      expect(() => rollDice(game, 0)).toThrow(GameEngineError);
    });
  });
});
