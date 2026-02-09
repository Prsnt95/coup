import cors from 'cors';
import express from 'express';
import fs from 'fs';
import { createServer } from 'http';
import path from 'path';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';

import { Game } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction =
  process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod';

const app = express();
app.use(cors({ origin: isProduction ? true : 'http://localhost:3000' }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: isProduction ? true : 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// In production, serve the built React app only if dist exists (e.g. single deploy).
// When using Vercel for frontend, backend runs without dist (backend-only).
const distPath = path.join(__dirname, '..', 'dist');
if (isProduction && fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const games = new Map();
const players = new Map(); // Maps socket.id -> { roomId, playerId }
const disconnectTimers = new Map(); // Maps `${roomId}:${playerId}` -> timeoutId

// Helper function to broadcast game state only to connected players
function broadcastGameState(game, playersMap) {
  game.getPlayers().forEach((player) => {
    // Find the socket ID for this player by checking the players Map
    // A player is connected if their socketId exists in the players Map
    for (const [socketId, data] of playersMap.entries()) {
      if (data.roomId === game.roomId && data.playerId === player.id) {
        // This player is connected, send them the game state
        io.to(socketId).emit('game-state', game.getPublicState(player.id));
        break;
      }
    }
  });
}

io.on('connection', (socket) => {
  console.log(
    `[CONNECTION] Player connected: ${socket.id} at ${new Date().toISOString()}`
  );
  console.log(
    `[CONNECTION] Current active timers:`,
    Array.from(disconnectTimers.keys())
  );

  // When a new socket connects, check if it's a reconnect and cancel any pending timers
  // This handles the case where reconnect-room hasn't been called yet
  socket.once('reconnect-room', ({ roomId, playerId }) => {
    const timerKey = `${roomId}:${playerId}`;
    const existingTimer = disconnectTimers.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      disconnectTimers.delete(timerKey);
      console.log(
        `[CONNECTION] Pre-emptively cancelled timer for ${timerKey} on connection`
      );
    }
  });

  socket.on('create-room', ({ playerName }) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const game = new Game(roomId);
    games.set(roomId, game);

    const playerId = game.addPlayer(playerName, socket.id);
    players.set(socket.id, { roomId, playerId });
    socket.join(roomId);

    socket.emit('room-created', { roomId, playerId });
    // Send personalized state to each connected player
    broadcastGameState(game, players);
  });

  socket.on('join-room', ({ roomId, playerName }) => {
    const game = games.get(roomId);
    if (!game) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (game.isFull()) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    const playerId = game.addPlayer(playerName, socket.id);
    players.set(socket.id, { roomId, playerId });
    socket.join(roomId);

    socket.emit('joined-room', { roomId, playerId });
    // Send personalized state to each connected player
    broadcastGameState(game, players);
  });

  socket.on('reconnect-room', ({ roomId, playerId }) => {
    console.log(
      `[RECONNECT] Reconnect attempt: player ${playerId} in room ${roomId} at ${new Date().toISOString()}`
    );
    console.log(
      `[RECONNECT] Current disconnectTimers keys:`,
      Array.from(disconnectTimers.keys())
    );

    // FIRST: Cancel disconnect timer immediately before any other checks
    const timerKey = `${roomId}:${playerId}`;
    const existingTimer = disconnectTimers.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      disconnectTimers.delete(timerKey);
      console.log(
        `[RECONNECT] ✓ Cancelled disconnect timer for player ${playerId} in room ${roomId} at ${new Date().toISOString()}`
      );
    } else {
      console.log(
        `[RECONNECT] No timer found for player ${playerId} in room ${roomId} (timerKey: ${timerKey}) at ${new Date().toISOString()}`
      );
    }

    const game = games.get(roomId);
    if (!game) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const player = game.getPlayerById(playerId);
    if (!player) {
      socket.emit('error', { message: 'Player not found in this room' });
      return;
    }

    // Update the player's socket ID
    game.updatePlayerSocketId(playerId, socket.id);

    // Remove old socket mapping if it exists
    for (const [oldSocketId, data] of players.entries()) {
      if (data.roomId === roomId && data.playerId === playerId) {
        players.delete(oldSocketId);
        break;
      }
    }

    // Add new socket mapping
    players.set(socket.id, { roomId, playerId });
    socket.join(roomId);

    console.log(
      `✓ Player ${playerId} reconnected successfully in room ${roomId}`
    );
    socket.emit('reconnected-room', { roomId, playerId });
    // Send personalized state to the reconnected player
    socket.emit('game-state', game.getPublicState(playerId));
    // Also notify other connected players
    broadcastGameState(game, players);
  });

  socket.on('start-game', () => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const game = games.get(playerData.roomId);
    if (!game || game.getHostId() !== playerData.playerId) return;

    if (game.getPlayers().length < 2) {
      socket.emit('error', { message: 'Need at least 2 players to start' });
      return;
    }

    game.start();
    // Send personalized state to each connected player
    broadcastGameState(game, players);
  });

  socket.on('action', ({ action, targetId, character }) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const game = games.get(playerData.roomId);
    if (!game) return;

    const result = game.performAction(
      playerData.playerId,
      action,
      targetId,
      character
    );
    // Send personalized state to each connected player
    broadcastGameState(game, players);

    if (result.error) {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('challenge', ({ targetId, character }) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const game = games.get(playerData.roomId);
    if (!game) return;

    const result = game.challenge(playerData.playerId, targetId, character);
    // Send personalized state to each connected player
    broadcastGameState(game, players);

    if (result.error) {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('pass', () => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const game = games.get(playerData.roomId);
    if (!game) return;

    const result = game.pass(playerData.playerId);
    // Send personalized state to each connected player
    broadcastGameState(game, players);

    if (result.error) {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('block', ({ targetId, character }) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const game = games.get(playerData.roomId);
    if (!game) return;

    const result = game.block(playerData.playerId, targetId, character);
    // Send personalized state to each connected player
    broadcastGameState(game, players);

    if (result.error) {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('choose-card', ({ cardIndex }) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const game = games.get(playerData.roomId);
    if (!game) return;

    const result = game.chooseCard(playerData.playerId, cardIndex);
    // Send personalized state to each connected player
    broadcastGameState(game, players);

    if (result.error) {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('ambassador-choose', ({ selectedIndices }) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const game = games.get(playerData.roomId);
    if (!game) return;

    const result = game.chooseAmbassador(playerData.playerId, selectedIndices);
    // Send personalized state to each connected player
    broadcastGameState(game, players);

    if (result.error) {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('leave-game', () => {
    const playerData = players.get(socket.id);
    if (!playerData) {
      socket.emit('left-game');
      return;
    }

    // Cancel any disconnect timer for this player
    const timerKey = `${playerData.roomId}:${playerData.playerId}`;
    const existingTimer = disconnectTimers.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      disconnectTimers.delete(timerKey);
    }

    const game = games.get(playerData.roomId);
    if (game) {
      // Remove player from game
      game.removePlayer(playerData.playerId);

      // If it was the current player's turn, skip to next turn immediately (they chose to leave)
      if (game.phase !== 'waiting') {
        const currentPlayer = game.getCurrentPlayer();
        if (currentPlayer && currentPlayer.id === playerData.playerId) {
          game.nextTurn();
        }
      }

      // Notify remaining players
      broadcastGameState(game, players);

      // Delete game if no players left
      if (game.getPlayers().length === 0) {
        games.delete(playerData.roomId);
      }
    }

    // Remove from players map
    players.delete(socket.id);
    socket.leave(playerData.roomId);

    // Notify the leaving player
    socket.emit('left-game');
  });

  socket.on('disconnect', () => {
    console.log(
      `[DISCONNECT] Socket ${socket.id} disconnected at ${new Date().toISOString()}`
    );
    const playerData = players.get(socket.id);
    if (playerData) {
      console.log(
        `[DISCONNECT] Player data found: roomId=${playerData.roomId}, playerId=${playerData.playerId}`
      );
      const game = games.get(playerData.roomId);
      if (game) {
        // Only remove player if game hasn't started (still in waiting phase)
        // This allows reconnection during active games
        if (game.phase === 'waiting') {
          game.removePlayer(playerData.playerId);
          // Send personalized state to each remaining connected player
          broadcastGameState(game, players);

          if (game.getPlayers().length === 0) {
            games.delete(playerData.roomId);
          }
        } else {
          // During active game, check if we need to skip disconnected player's turn
          const currentPlayer = game.getCurrentPlayer();
          console.log(
            `[DISCONNECT] Game phase: ${game.phase}, Current player: ${currentPlayer?.id}, Disconnecting player: ${playerData.playerId}`
          );
          console.log(
            `[DISCONNECT] All players in game:`,
            game.getPlayers().map((p) => ({ id: p.id, name: p.name }))
          );

          if (currentPlayer && currentPlayer.id === playerData.playerId) {
            // Current player disconnected - start 10 second timer before skipping turn
            const timerKey = `${playerData.roomId}:${playerData.playerId}`;

            // Clear any existing timer for this player
            const existingTimer = disconnectTimers.get(timerKey);
            if (existingTimer) {
              clearTimeout(existingTimer);
              console.log(
                `[DISCONNECT] Cleared existing timer for ${timerKey}`
              );
            }

            // Store player data before removing from players map
            const roomId = playerData.roomId;
            const playerId = playerData.playerId;

            // Start new timer
            console.log(
              `[TIMER] Starting 10-second disconnect timer for player ${playerId} in room ${roomId} at ${new Date().toISOString()}`
            );
            console.log(`[TIMER] Timer key: ${timerKey}`);
            const timer = setTimeout(() => {
              console.log(
                `[TIMER] Timer callback executing for player ${playerId} in room ${roomId} at ${new Date().toISOString()}`
              );
              // Check if timer still exists (if it was cancelled, it won't be in the map)
              if (!disconnectTimers.has(timerKey)) {
                console.log(
                  `Timer for player ${playerId} was cancelled - they reconnected`
                );
                return; // Timer was cancelled, player reconnected
              }

              // Check if player is still disconnected by checking if they're in players map
              const stillDisconnected = !Array.from(players.values()).some(
                (data) => data.roomId === roomId && data.playerId === playerId
              );

              console.log(
                `Timer expired for player ${playerId} in room ${roomId}. Still disconnected: ${stillDisconnected}`
              );

              // Remove timer from map before checking, to prevent race conditions
              disconnectTimers.delete(timerKey);

              if (stillDisconnected) {
                const currentGame = games.get(roomId);
                if (currentGame) {
                  const current = currentGame.getCurrentPlayer();
                  // Only skip if it's still this player's turn and they're still disconnected
                  if (current && current.id === playerId) {
                    // Double-check they're still disconnected after removing timer
                    const stillNotConnected = !Array.from(
                      players.values()
                    ).some(
                      (data) =>
                        data.roomId === roomId && data.playerId === playerId
                    );
                    if (stillNotConnected) {
                      console.log(
                        `Skipping turn for disconnected player ${playerId}`
                      );
                      currentGame.nextTurn();
                      broadcastGameState(currentGame, players);
                    }
                  }
                }
              }
            }, 10000); // 10 seconds

            disconnectTimers.set(timerKey, timer);
            console.log(
              `[TIMER] Timer set successfully. Current timers:`,
              Array.from(disconnectTimers.keys())
            );

            // Notify other players that this player disconnected and has 10 seconds to reconnect
            broadcastGameState(game, players);
          } else {
            console.log(
              `[DISCONNECT] Not current player's turn - no timer needed. Current: ${currentPlayer?.id}, Disconnecting: ${playerData.playerId}`
            );
          }
        }
        // If game is in progress, we'll keep the player in the game
        // and they can reconnect using reconnect-room
      } else {
        console.log(
          `[DISCONNECT] Game not found for roomId: ${playerData.roomId}`
        );
      }
      // Remove from players map AFTER setting up the timer
      players.delete(socket.id);
      console.log(`[DISCONNECT] Removed socket ${socket.id} from players map`);
    } else {
      console.log(`[DISCONNECT] No player data found for socket ${socket.id}`);
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
