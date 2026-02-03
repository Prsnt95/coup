import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import './App.css';

const socket = io('http://localhost:3001');

function App() {
  const [gameState, setGameState] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [error, setError] = useState(null);
  const [playerName, setPlayerName] = useState('');

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
