import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import './App.css';

// In dev (Vite on :3000), backend is on :3001. In production use VITE_SOCKET_URL (e.g. your Render backend).
const socketUrl =
  import.meta.env.VITE_SOCKET_URL ||
  (window.location.port === '3000' ? 'http://localhost:3001' : window.location.origin);
const socket = io(socketUrl);

function App() {
  const [gameState, setGameState] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [error, setError] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setConnected(socket.connected);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  useEffect(() => {
    socket.on('room-created', ({ roomId, playerId }) => {
      setRoomId(roomId);
      setPlayerId(playerId);
    });

    socket.on('joined-room', ({ roomId, playerId }) => {
      setRoomId(roomId);
      setPlayerId(playerId);
    });

    socket.on('game-state', (state) => {
      setGameState(state);
    });

    socket.on('error', ({ message }) => {
      setError(message);
      setTimeout(() => setError(null), 5000);
    });

    return () => {
      socket.off('room-created');
      socket.off('joined-room');
      socket.off('game-state');
      socket.off('error');
    };
  }, []);

  const handleCreateRoom = (name) => {
    setPlayerName(name);
    socket.emit('create-room', { playerName: name });
  };

  const handleJoinRoom = (name, room) => {
    setPlayerName(name);
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

  if (gameState && gameState.phase !== 'waiting') {
    return (
      <GameBoard
        gameState={gameState}
        playerId={playerId}
        playerName={playerName}
        socket={socket}
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
