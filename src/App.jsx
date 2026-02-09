import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import './App.css';

// In dev (Vite on :3000), backend is on :3001. In production use VITE_SOCKET_URL (e.g. your Render backend).
const socketUrl =
  import.meta.env.VITE_SOCKET_URL ||
  (window.location.port === '3000' ? 'http://localhost:3001' : window.location.origin);
const socket = io(socketUrl, {
  reconnection: true,
  reconnectionDelay: 50,
  reconnectionDelayMax: 200,
  reconnectionAttempts: 10,
  timeout: 5000
});

const STORAGE_KEYS = {
  ROOM_ID: 'coup_roomId',
  PLAYER_ID: 'coup_playerId',
  PLAYER_NAME: 'coup_playerName',
};

function App() {
  const [gameState, setGameState] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [error, setError] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [connected, setConnected] = useState(socket.connected);

  // Load saved game data on mount and attempt immediate reconnect
  useEffect(() => {
    const savedRoomId = sessionStorage.getItem(STORAGE_KEYS.ROOM_ID);
    const savedPlayerIdStr = sessionStorage.getItem(STORAGE_KEYS.PLAYER_ID);
    const savedPlayerName = sessionStorage.getItem(STORAGE_KEYS.PLAYER_NAME);
    
    // Parse playerId safely, checking for NaN
    const savedPlayerId = savedPlayerIdStr ? parseInt(savedPlayerIdStr, 10) : null;
    const isValidPlayerId = savedPlayerId !== null && !isNaN(savedPlayerId);

    if (savedRoomId && isValidPlayerId && savedPlayerName) {
      setRoomId(savedRoomId);
      setPlayerId(savedPlayerId);
      setPlayerName(savedPlayerName);
      
      // Try to reconnect immediately if socket is already connected
      if (socket.connected) {
        console.log('Socket already connected on mount, attempting immediate reconnect...');
        socket.emit('reconnect-room', { roomId: savedRoomId, playerId: savedPlayerId });
      }
    }
  }, []);

  useEffect(() => {
    const onConnect = () => {
      console.log('Socket connected, attempting to reconnect to game...');
      setConnected(true);
      // Attempt to reconnect if we have saved game data
      const savedRoomId = sessionStorage.getItem(STORAGE_KEYS.ROOM_ID);
      const savedPlayerIdStr = sessionStorage.getItem(STORAGE_KEYS.PLAYER_ID);
      const savedPlayerId = savedPlayerIdStr ? parseInt(savedPlayerIdStr, 10) : null;
      
      if (savedRoomId && savedPlayerId !== null && !isNaN(savedPlayerId)) {
        console.log(`Emitting reconnect-room: room=${savedRoomId}, player=${savedPlayerId}`);
        socket.emit('reconnect-room', { roomId: savedRoomId, playerId: savedPlayerId });
      }
    };
    const onDisconnect = () => {
      console.log('Socket disconnected');
      setConnected(false);
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setConnected(socket.connected);
    
    // If already connected, try to reconnect immediately
    if (socket.connected) {
      console.log('Socket already connected, attempting immediate reconnect...');
      const savedRoomId = sessionStorage.getItem(STORAGE_KEYS.ROOM_ID);
      const savedPlayerIdStr = sessionStorage.getItem(STORAGE_KEYS.PLAYER_ID);
      const savedPlayerId = savedPlayerIdStr ? parseInt(savedPlayerIdStr, 10) : null;
      
      if (savedRoomId && savedPlayerId !== null && !isNaN(savedPlayerId)) {
        console.log(`Emitting reconnect-room (immediate): room=${savedRoomId}, player=${savedPlayerId}`);
        socket.emit('reconnect-room', { roomId: savedRoomId, playerId: savedPlayerId });
      }
    }
    
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  useEffect(() => {
    socket.on('room-created', ({ roomId, playerId }) => {
      setRoomId(roomId);
      setPlayerId(playerId);
      sessionStorage.setItem(STORAGE_KEYS.ROOM_ID, roomId);
      sessionStorage.setItem(STORAGE_KEYS.PLAYER_ID, playerId.toString());
    });

    socket.on('joined-room', ({ roomId, playerId }) => {
      setRoomId(roomId);
      setPlayerId(playerId);
      sessionStorage.setItem(STORAGE_KEYS.ROOM_ID, roomId);
      sessionStorage.setItem(STORAGE_KEYS.PLAYER_ID, playerId.toString());
    });

    socket.on('reconnected-room', ({ roomId, playerId }) => {
      setRoomId(roomId);
      setPlayerId(playerId);
      // Ensure sessionStorage is up to date
      sessionStorage.setItem(STORAGE_KEYS.ROOM_ID, roomId);
      sessionStorage.setItem(STORAGE_KEYS.PLAYER_ID, playerId.toString());
    });

    socket.on('game-state', (state) => {
      setGameState(state);
    });

    socket.on('left-game', () => {
      // Clear game state and return to lobby
      sessionStorage.removeItem(STORAGE_KEYS.ROOM_ID);
      sessionStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
      sessionStorage.removeItem(STORAGE_KEYS.PLAYER_NAME);
      setRoomId(null);
      setPlayerId(null);
      setPlayerName('');
      setGameState(null);
    });

    socket.on('error', ({ message }) => {
      setError(message);
      setTimeout(() => setError(null), 5000);
      // If reconnection failed, clear saved data
      if (message.includes('not found') || message.includes('Player not found')) {
        sessionStorage.removeItem(STORAGE_KEYS.ROOM_ID);
        sessionStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
        sessionStorage.removeItem(STORAGE_KEYS.PLAYER_NAME);
        setRoomId(null);
        setPlayerId(null);
        setPlayerName('');
        setGameState(null);
      }
    });

    return () => {
      socket.off('room-created');
      socket.off('joined-room');
      socket.off('reconnected-room');
      socket.off('game-state');
      socket.off('left-game');
      socket.off('error');
    };
  }, []);

  const handleCreateRoom = (name) => {
    setPlayerName(name);
    sessionStorage.setItem(STORAGE_KEYS.PLAYER_NAME, name);
    socket.emit('create-room', { playerName: name });
  };

  const handleJoinRoom = (name, room) => {
    setPlayerName(name);
    sessionStorage.setItem(STORAGE_KEYS.PLAYER_NAME, name);
    socket.emit('join-room', { roomId: room, playerName: name });
  };

  if (error) {
    return (
      <div className="error-banner">
        {error}
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="connection-banner">
        <h2>Connecting to game server…</h2>
        <p>
          If this doesn’t go away, the frontend can’t reach the backend.
          <br />
          Using Vercel + Render? In Vercel set <strong>VITE_SOCKET_URL</strong> to your Render URL (e.g. <code>https://your-app.onrender.com</code>), then redeploy.
        </p>
      </div>
    );
  }

  const handleLeaveGame = () => {
    // Clear state - the socket event will also trigger this
    sessionStorage.removeItem(STORAGE_KEYS.ROOM_ID);
    sessionStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
    sessionStorage.removeItem(STORAGE_KEYS.PLAYER_NAME);
    setRoomId(null);
    setPlayerId(null);
    setPlayerName('');
    setGameState(null);
  };

  if (gameState && gameState.phase !== 'waiting') {
    return (
      <GameBoard
        gameState={gameState}
        playerId={playerId}
        playerName={playerName}
        socket={socket}
        onLeaveGame={handleLeaveGame}
      />
    );
  }

  return (
    <Lobby
      onCreateRoom={handleCreateRoom}
      onJoinRoom={handleJoinRoom}
      roomId={roomId}
      gameState={gameState}
      playerId={playerId}
      socket={socket}
    />
  );
}

export default App;
