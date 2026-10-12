import { createRedisClient } from "../client";
import { RedisKeys } from "../keys";
import { createGame } from "@ludo/game-engine";
import {
  getAuthoritativeGameState,
  handleRollDice,
  handleMoveToken,
} from "../game/play-game";

async function runMilestone10GameTests() {
  console.log("Starting Milestone 10: Playable Game UI & Engine Actions Automated Tests...\n");

  const testRedis = createRedisClient();
  await testRedis.connect();

  const userRed = { userId: `user-red-${Date.now()}`, username: "RedCommander" };
  const userGreen = { userId: `user-green-${Date.now()}`, username: "GreenHero" };
  const userYellow = { userId: `user-yellow-${Date.now()}`, username: "YellowStar" };
  const userBlue = { userId: `user-blue-${Date.now()}`, username: "BlueMaster" };

  const gameId = `test-game-${Date.now()}`;

  try {
    // 1. Initialize 4-player game and persist in Redis
    console.log("1. Initializing 4-player game in Redis...");
    const initialGame = createGame(gameId, [userRed, userGreen, userYellow, userBlue], {
      status: "IN_PROGRESS",
    });
    await testRedis.set(RedisKeys.game(gameId), JSON.stringify(initialGame));

    const retrievedGame = await getAuthoritativeGameState(testRedis, gameId);
    if (!retrievedGame) throw new Error("Failed to retrieve authoritative game state from Redis!");
    if (retrievedGame.currentTurn !== 0) throw new Error("Initial turn must be slot 0 (RED)!");
    console.log("✓ Successfully saved and loaded game state from Redis.");

    // 2. Reject non-active player roll
    console.log("2. Testing turn authorization for rollDice...");
    const unauthorizedRoll = await handleRollDice(testRedis, gameId, userGreen.userId, 4);
    if (unauthorizedRoll.success) throw new Error("Roll must be rejected for non-active player!");
    if (unauthorizedRoll.error !== "NOT_YOUR_TURN") throw new Error(`Expected NOT_YOUR_TURN, got ${unauthorizedRoll.error}`);
    console.log("✓ Correctly rejected dice roll from non-turn player.");

    // 3. Roll a non-6 (no legal moves from HOME, turn automatically passes)
    console.log("3. Rolling a 3 for Red player with all tokens at HOME...");
    const roll3Result = await handleRollDice(testRedis, gameId, userRed.userId, 3);
    if (!roll3Result.success) throw new Error(`Roll failed: ${roll3Result.error}`);
    if (roll3Result.result?.diceValue !== 3) throw new Error("Expected diceValue 3");
    if (roll3Result.result?.legalMoves.length !== 0) throw new Error("Expected 0 legal moves on roll 3 from home");
    if (roll3Result.game?.currentTurn !== 1) throw new Error("Turn should automatically pass to Green (slot 1)");
    console.log("✓ Roll 3 correctly yielded 0 legal moves and advanced turn to Green (slot 1).");

    // 4. Advance Green turn (roll 2, passes to Yellow slot 2)
    console.log("4. Rolling a 2 for Green player...");
    const roll2Green = await handleRollDice(testRedis, gameId, userGreen.userId, 2);
    if (!roll2Green.success) throw new Error(`Green roll failed: ${roll2Green.error}`);
    if (roll2Green.game?.currentTurn !== 2) throw new Error("Turn should advance to Yellow (slot 2)");
    console.log("✓ Turn advanced to Yellow (slot 2).");

    // 5. Advance Yellow turn (roll 4, passes to Blue slot 3)
    console.log("5. Rolling a 4 for Yellow player...");
    const roll4Yellow = await handleRollDice(testRedis, gameId, userYellow.userId, 4);
    if (!roll4Yellow.success) throw new Error(`Yellow roll failed: ${roll4Yellow.error}`);
    if (roll4Yellow.game?.currentTurn !== 3) throw new Error("Turn should advance to Blue (slot 3)");
    console.log("✓ Turn advanced to Blue (slot 3).");

    // 6. Advance Blue turn (roll 5, wraps back to Red slot 0)
    console.log("6. Rolling a 5 for Blue player...");
    const roll5Blue = await handleRollDice(testRedis, gameId, userBlue.userId, 5);
    if (!roll5Blue.success) throw new Error(`Blue roll failed: ${roll5Blue.error}`);
    if (roll5Blue.game?.currentTurn !== 0) throw new Error("Turn should wrap back to Red (slot 0)");
    console.log("✓ Turn wrapped around cleanly to Red (slot 0).");

    // 7. Red rolls a 6 (can leave HOME!)
    console.log("7. Red rolling a 6 to leave HOME...");
    const roll6Red = await handleRollDice(testRedis, gameId, userRed.userId, 6);
    if (!roll6Red.success) throw new Error(`Red roll 6 failed: ${roll6Red.error}`);
    if (roll6Red.game?.turnPhase !== "WAITING_FOR_MOVE") throw new Error("Expected turnPhase WAITING_FOR_MOVE");
    if (roll6Red.result?.legalMoves.length !== 4) throw new Error("All 4 home tokens should be legal to move!");
    console.log("✓ Red rolled 6: 4 legal moves available, turn phase waiting for move.");

    // 8. Rejection of moving opponent token or invalid move
    console.log("8. Testing invalid token move rejection...");
    // Move token token1 from HOME to track position 0 (Red start)
    const moveRedTokenResult = await handleMoveToken(testRedis, gameId, userRed.userId, "token1");
    if (!moveRedTokenResult.success) throw new Error(`Move token failed: ${moveRedTokenResult.error}`);
    const redToken1 = moveRedTokenResult.game?.players[0]?.tokens.token1;
    if (!redToken1 || redToken1.type !== "TRACK" || redToken1.index !== 0) {
      throw new Error(`Expected token1 to be at TRACK index 0, got ${JSON.stringify(redToken1)}`);
    }
    // Since rolled 6, Red gets bonus roll and currentTurn stays 0!
    if (moveRedTokenResult.game?.currentTurn !== 0) throw new Error("Rolling 6 gives bonus roll, currentTurn must stay 0");
    if (moveRedTokenResult.game?.turnPhase !== "WAITING_FOR_ROLL") throw new Error("Should wait for bonus roll");
    console.log("✓ Red token token1 moved from HOME to start track 0, bonus roll awarded.");

    // 9. Rejection of moving before rolling
    console.log("9. Testing moving token without rolling dice first...");
    const moveWithoutRoll = await handleMoveToken(testRedis, gameId, userRed.userId, "token1");
    if (moveWithoutRoll.success) throw new Error("Should reject token move without rolling dice!");
    if (moveWithoutRoll.error !== "MUST_ROLL_DICE_FIRST") throw new Error(`Expected MUST_ROLL_DICE_FIRST, got ${moveWithoutRoll.error}`);
    console.log("✓ Moving token before roll correctly rejected with MUST_ROLL_DICE_FIRST.");

    // 10. Bonus roll execution
    console.log("10. Executing bonus roll for Red...");
    const bonusRoll = await handleRollDice(testRedis, gameId, userRed.userId, 4);
    if (!bonusRoll.success) throw new Error(`Bonus roll failed: ${bonusRoll.error}`);
    if (bonusRoll.game?.turnPhase !== "WAITING_FOR_MOVE") throw new Error("Token token1 on track can move 4 steps!");
    const moveT0Four = await handleMoveToken(testRedis, gameId, userRed.userId, "token1");
    if (!moveT0Four.success) throw new Error(`Move token1 failed: ${moveT0Four.error}`);
    const movedToken1 = moveT0Four.game?.players[0]?.tokens.token1;
    if (!movedToken1 || movedToken1.type !== "TRACK" || movedToken1.index !== 4) {
      throw new Error(`Expected token1 at TRACK index 4, got ${JSON.stringify(movedToken1)}`);
    }
    if (moveT0Four.game?.currentTurn !== 1) throw new Error("Turn should pass to Green (slot 1) after non-bonus move");
    console.log("✓ Red token token1 advanced to track 4, turn cleanly transitioned to Green.");

    console.log("\n ALL 10 MILESTONE 10 TESTS PASSED SUCCESSFULLY! \n");
  } finally {
    // Teardown test game key
    await testRedis.del(RedisKeys.game(gameId));
    await testRedis.quit();
  }
}

runMilestone10GameTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
