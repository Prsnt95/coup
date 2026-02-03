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
const players = new Map();

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('create-room', ({ playerName }) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const game = new Game(roomId);
    games.set(roomId, game);

    const playerId = game.addPlayer(playerName, socket.id);
    players.set(socket.id, { roomId, playerId });
    socket.join(roomId);

    socket.emit('room-created', { roomId, playerId });
    // Send personalized state to each player
    game.getPlayers().forEach((player) => {
      io.to(player.socketId).emit('game-state', game.getPublicState(player.id));
    });
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
    // Send personalized state to each player
    game.getPlayers().forEach((player) => {
      io.to(player.socketId).emit('game-state', game.getPublicState(player.id));
    });
  });

  socket.on('start-game', () => {
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const game = games.get(playerData.roomId);
    if (!game || game.getHostId() !== playerData.playerId) return;

    if (game.getPlayers().length < 3) {
      socket.emit('error', { message: 'Need at least 3 players to start' });
      return;
    }

    game.start();
    // Send personalized state to each player
    game.getPlayers().forEach((player) => {
      io.to(player.socketId).emit('game-state', game.getPublicState(player.id));
    });
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
    // Send personalized state to each player
    game.getPlayers().forEach((player) => {
      io.to(player.socketId).emit('game-state', game.getPublicState(player.id));
    });

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
    // Send personalized state to each player
    game.getPlayers().forEach((player) => {
      io.to(player.socketId).emit('game-state', game.getPublicState(player.id));
    });

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
    // Send personalized state to each player
    game.getPlayers().forEach((player) => {
      io.to(player.socketId).emit('game-state', game.getPublicState(player.id));
    });

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
    // Send personalized state to each player
    game.getPlayers().forEach((player) => {
      io.to(player.socketId).emit('game-state', game.getPublicState(player.id));
    });

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
    // Send personalized state to each player
    game.getPlayers().forEach((player) => {
      io.to(player.socketId).emit('game-state', game.getPublicState(player.id));
    });

    if (result.error) {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('disconnect', () => {
    const playerData = players.get(socket.id);
    if (playerData) {
      const game = games.get(playerData.roomId);
      if (game) {
        game.removePlayer(playerData.playerId);
        // Send personalized state to each remaining player
        game.getPlayers().forEach((player) => {
          io.to(player.socketId).emit(
            'game-state',
            game.getPublicState(player.id)
          );
        });

        if (game.getPlayers().length === 0) {
          games.delete(playerData.roomId);
        }
      }
      players.delete(socket.id);
    }
    console.log('Player disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
