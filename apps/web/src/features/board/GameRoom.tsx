"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getGameStateAction,
  rollDiceAction,
  moveTokenAction,
  leaveGameAction,
} from "@/actions/game";
import { LudoBoard } from "./LudoBoard";
import { DiceRoller } from "./DiceRoller";
import { PlayerCard } from "./PlayerCard";
import { WinnerModal } from "./WinnerModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  calculateLegalMoves,
  type GameState,
  type TokenKey,
  type PlayerColor,
} from "@ludo/game-engine";
import {
  LogOut,
  Loader2,
  AlertTriangle,
  Swords,
  Radio,
} from "lucide-react";

interface GameRoomProps {
  gameId: string;
  currentUserId: string;
  onLeave: () => void;
}

export function GameRoom({ gameId, currentUserId, onLeave }: GameRoomProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [disconnectedPlayers, setDisconnectedPlayers] = useState<
    Record<string, { disconnectedAt: number; gracePeriodSeconds: number }>
  >({});
  const [deviceTakeover, setDeviceTakeover] = useState<string | null>(null);
  const [now, setNow] = useState<number>(0);

  // 1. Fetch Game State
  const fetchState = useCallback(async () => {
    try {
      const res = await getGameStateAction(gameId);
      if (res.success && res.game) {
        setGameState(res.game);
        setError(null);
      } else if (res.error) {
        setError(res.error);
      }
    } catch {
      // Suppress network abort error
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  // 1-second interval timer for turn countdown & disconnect grace periods
  useEffect(() => {
    const initialTimer = setTimeout(() => {
      setNow(Date.now());
    }, 0);
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, []);

  // Initial load and fallback polling every 1.2 seconds
  useEffect(() => {
    let isMounted = true;

    getGameStateAction(gameId)
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.game) {
          setGameState(res.game);
          setError(null);
        } else if (res.error) {
          setError(res.error);
        }
        setLoading(false);
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    const interval = setInterval(() => {
      if (!isMounted) return;
      getGameStateAction(gameId)
        .then((res) => {
          if (!isMounted) return;
          if (res.success && res.game) {
            setGameState(res.game);
          } else if (res.error === "Game not found") {
            setGameState((prev) => (prev ? { ...prev, status: "ABANDONED" } : null));
          }
        })
        .catch(() => {});
    }, 1200);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [gameId]);

  // 2. Connect to WebSocket Service for real-time events per Section 9.5
  useEffect(() => {
    let ws: WebSocket | null = null;
    let isMounted = true;

    async function initWebSocket() {
      try {
        const ticketRes = await fetch("/api/ws-token");
        if (!ticketRes.ok) return;
        const { ticket } = await ticketRes.json();
        if (!ticket || !isMounted) return;

        const wsHost = window.location.hostname;
        const wsBaseUrl = process.env.NEXT_PUBLIC_WS_URL || `ws://${wsHost}:3001`;
        const socket = new WebSocket(`${wsBaseUrl}?ticket=${ticket}&deviceId=web-client`);

        socket.onopen = () => {
          if (!isMounted) return;
          setWsConnected(true);
          // Join the game room
          socket.send(
            JSON.stringify({
              type: "JOIN_GAME",
              actionId: crypto.randomUUID(),
              payload: { gameId },
            })
          );
        };

        socket.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === "GAME_STATE" && data.payload) {
              setGameState(data.payload as GameState);
            } else if (data.type === "OPPONENT_DISCONNECTED" && data.payload) {
              const p = data.payload as {
                userId: string;
                disconnectedAt: number;
                gracePeriodSeconds: number;
              };
              setDisconnectedPlayers((prev) => ({
                ...prev,
                [p.userId]: {
                  disconnectedAt: p.disconnectedAt,
                  gracePeriodSeconds: p.gracePeriodSeconds,
                },
              }));
            } else if (data.type === "OPPONENT_RECONNECTED" && data.payload) {
              const p = data.payload as { userId: string };
              setDisconnectedPlayers((prev) => {
                const next = { ...prev };
                delete next[p.userId];
                return next;
              });
            } else if (data.type === "DEVICE_TAKEOVER") {
              setDeviceTakeover(
                data.payload?.message || "Session superseded by a new device connection"
              );
            } else if (
              [
                "DICE_ROLLED",
                "TOKEN_MOVED",
                "TURN_CHANGED",
                "TURN_SKIPPED",
                "PLAYER_CAPTURED",
                "PLAYER_WON",
                "GAME_PLAYER_LEFT",
                "GAME_COMPLETED",
                "GAME_ABANDONED",
              ].includes(data.type)
            ) {
              fetchState();
            }
          } catch {
            // non-json or unparsed
          }
        };

        socket.onclose = () => {
          if (isMounted) setWsConnected(false);
        };

        socket.onerror = () => {
          if (isMounted) setWsConnected(false);
        };

        ws = socket;
      } catch {
        // Fallback to polling silently
      }
    }

    initWebSocket();

    return () => {
      isMounted = false;
      if (ws) ws.close();
    };
  }, [gameId, fetchState]);

  // 3. Compute Legal Moves for the current active player
  const legalMoves: TokenKey[] = useMemo(() => {
    if (!gameState || gameState.status !== "IN_PROGRESS") return [];
    if (gameState.currentTurn === null || gameState.diceValue === null) return [];
    if (gameState.turnPhase !== "WAITING_FOR_MOVE") return [];

    const activePlayer = gameState.players[gameState.currentTurn];
    if (!activePlayer) return [];

    return calculateLegalMoves(
      activePlayer,
      gameState.currentTurn,
      gameState.diceValue
    );
  }, [gameState]);

  // 4. Handle Dice Roll
  const handleRollDice = async () => {
    if (!gameState || isActing) return;
    setIsActing(true);
    setError(null);

    try {
      const res = await rollDiceAction(gameId);
      if (res.success && res.game) {
        setGameState(res.game);
      } else {
        setError(res.error || "Failed to roll dice");
      }
    } catch {
      setError("Network error rolling dice");
    } finally {
      setIsActing(false);
    }
  };

  // 5. Handle Token Selection & Move
  const handleSelectToken = async (tokenKey: TokenKey) => {
    if (!gameState || isActing) return;
    setIsActing(true);
    setError(null);

    try {
      const res = await moveTokenAction(gameId, tokenKey);
      if (res.success && res.game) {
        setGameState(res.game);
      } else {
        setError(res.error || "Failed to move token");
      }
    } catch {
      setError("Network error moving token");
    } finally {
      setIsActing(false);
    }
  };

  // 6. Handle Leave Game
  const handleLeaveGame = async () => {
    setIsLeaving(true);
    try {
      await leaveGameAction(gameId);
    } finally {
      setIsLeaving(false);
      onLeave();
    }
  };

  // Turn & Disconnect Timer calculations (unconditional hooks)
  const turnSecondsRemaining = useMemo(() => {
    if (!gameState || gameState.status !== "IN_PROGRESS" || gameState.currentTurn === null || !now) return 10;
    const turnStartedAt = gameState.turnStartedAt || gameState.lastActivityAt;
    const elapsedSeconds = Math.floor((now - turnStartedAt) / 1000);
    return Math.max(0, 10 - elapsedSeconds);
  }, [gameState, now]);

  const getDisconnectRemaining = useCallback((userId?: string) => {
    if (!userId || !now) return undefined;
    const record = disconnectedPlayers[userId];
    if (!record) return undefined;
    const elapsed = Math.floor((now - record.disconnectedAt) / 1000);
    return Math.max(0, record.gracePeriodSeconds - elapsed);
  }, [disconnectedPlayers, now]);

  if (loading || !gameState) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <p className="text-sm font-medium">Loading live Ludo game...</p>
      </div>
    );
  }

  const currentSlot = gameState.currentTurn;
  const activePlayer = currentSlot !== null ? gameState.players[currentSlot] : null;
  const isMyTurn = activePlayer?.userId === currentUserId;
  const activeColor: PlayerColor = activePlayer?.color || "RED";
  const activePlayerName = activePlayer?.username || `Player ${(currentSlot ?? 0) + 1}`;

  // Winner Information
  const isWinnerPresent = gameState.status === "COMPLETED" && gameState.winnerUserId;
  const winnerPlayer = gameState.players.find(
    (p) => p && p.userId === gameState.winnerUserId
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 relative">
      {/* Device Takeover Modal */}
      {deviceTakeover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
          <div className="bg-zinc-900 border border-amber-500/50 rounded-2xl max-w-md w-full p-6 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-zinc-100 mb-2">Device Takeover</h3>
            <p className="text-sm text-zinc-400 mb-6">
              {deviceTakeover}
            </p>
            <Button
              onClick={handleLeaveGame}
              className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold"
            >
              Return to Dashboard
            </Button>
          </div>
        </div>
      )}

      {/* Match Abandoned Modal */}
      {gameState.status === "ABANDONED" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-md w-full p-6 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-zinc-100 mb-2">Match Ended</h3>
            <p className="text-sm text-zinc-400 mb-6">
              The match has ended because all opponents left the game.
            </p>
            <Button
              onClick={handleLeaveGame}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              Return to Dashboard
            </Button>
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Swords className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-zinc-100">Live 4-Player Ludo</h2>
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs gap-1 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </Badge>
              {wsConnected && (
                <Badge variant="outline" className="text-indigo-400 border-indigo-800 text-[10px] gap-1 py-0 hidden sm:flex">
                  <Radio className="w-2.5 h-2.5 animate-pulse" /> WebSocket
                </Badge>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Turn {gameState.version} • Server Authoritative Rules
            </p>
          </div>
        </div>

        {/* Leave Game Button */}
        <Button
          variant="outline"
          onClick={handleLeaveGame}
          disabled={isLeaving}
          className="border-zinc-800 hover:bg-zinc-900 text-zinc-300 text-sm"
        >
          {isLeaving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <LogOut className="w-4 h-4 mr-2" />
          )}
          Leave Match
        </Button>
      </div>

      {/* Error alert if any */}
      {error && (
        <div className="bg-rose-950/60 border border-rose-800/80 rounded-xl p-3 text-xs sm:text-sm text-rose-300 flex items-center gap-2 animate-in fade-in">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Game Arena: 4 Seated Players & 15x15 Ludo Board */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Seated Players 1 & 4 */}
        <div className="lg:col-span-3 grid grid-cols-2 lg:grid-cols-1 gap-3 order-2 lg:order-1">
          <PlayerCard
            player={gameState.players[0]}
            slotIndex={0}
            isCurrentTurn={currentSlot === 0}
            isCurrentUser={gameState.players[0]?.userId === currentUserId}
            isDisconnected={!!gameState.players[0] && !!disconnectedPlayers[gameState.players[0].userId]}
            disconnectSecondsRemaining={getDisconnectRemaining(gameState.players[0]?.userId)}
            turnSecondsRemaining={currentSlot === 0 ? turnSecondsRemaining : undefined}
          />
          <PlayerCard
            player={gameState.players[3]}
            slotIndex={3}
            isCurrentTurn={currentSlot === 3}
            isCurrentUser={gameState.players[3]?.userId === currentUserId}
            isDisconnected={!!gameState.players[3] && !!disconnectedPlayers[gameState.players[3].userId]}
            disconnectSecondsRemaining={getDisconnectRemaining(gameState.players[3]?.userId)}
            turnSecondsRemaining={currentSlot === 3 ? turnSecondsRemaining : undefined}
          />
        </div>

        {/* Center: The 15x15 Interactive Ludo Board */}
        <div className="lg:col-span-6 flex flex-col items-center gap-4 order-1 lg:order-2">
          <LudoBoard
            game={gameState}
            currentUserId={currentUserId}
            legalMoves={legalMoves}
            onSelectToken={handleSelectToken}
            disabled={isActing}
          />

          {/* Interactive Dice Roller Panel */}
          <div className="w-full">
            <DiceRoller
              diceValue={gameState.diceValue}
              turnPhase={gameState.turnPhase}
              isMyTurn={isMyTurn}
              consecutiveSixes={gameState.consecutiveSixes}
              activeColor={activeColor}
              activePlayerName={activePlayerName}
              onRoll={handleRollDice}
              disabled={isActing}
            />
          </div>
        </div>

        {/* Right Side: Seated Players 2 & 3 */}
        <div className="lg:col-span-3 grid grid-cols-2 lg:grid-cols-1 gap-3 order-3">
          <PlayerCard
            player={gameState.players[1]}
            slotIndex={1}
            isCurrentTurn={currentSlot === 1}
            isCurrentUser={gameState.players[1]?.userId === currentUserId}
            isDisconnected={!!gameState.players[1] && !!disconnectedPlayers[gameState.players[1].userId]}
            disconnectSecondsRemaining={getDisconnectRemaining(gameState.players[1]?.userId)}
            turnSecondsRemaining={currentSlot === 1 ? turnSecondsRemaining : undefined}
          />
          <PlayerCard
            player={gameState.players[2]}
            slotIndex={2}
            isCurrentTurn={currentSlot === 2}
            isCurrentUser={gameState.players[2]?.userId === currentUserId}
            isDisconnected={!!gameState.players[2] && !!disconnectedPlayers[gameState.players[2].userId]}
            disconnectSecondsRemaining={getDisconnectRemaining(gameState.players[2]?.userId)}
            turnSecondsRemaining={currentSlot === 2 ? turnSecondsRemaining : undefined}
          />
        </div>
      </div>

      {/* Winner Modal */}
      {isWinnerPresent && winnerPlayer && (
        <WinnerModal
          isOpen={true}
          winnerUsername={winnerPlayer.username}
          winnerColor={winnerPlayer.color}
          isCurrentUserWinner={winnerPlayer.userId === currentUserId}
          isForfeit={
            Object.values(winnerPlayer.tokens).filter((t) => t.type === "FINISHED").length < 4
          }
          onReturnToLobby={handleLeaveGame}
        />
      )}
    </div>
  );
}
