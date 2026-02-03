import { useState } from 'react';

import './Lobby.css';

function Lobby({
  onCreateRoom,
  onJoinRoom,
  roomId,
  gameState,
  playerId,
  socket,
}) {
  const [playerName, setPlayerName] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const handleCreate = (e) => {
    e.preventDefault();
    if (playerName.trim()) {
      onCreateRoom(playerName.trim());
    }
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (playerName.trim() && joinRoomId.trim()) {
      onJoinRoom(playerName.trim(), joinRoomId.trim().toUpperCase());
    }
  };

  const handleStartGame = () => {
    socket.emit('start-game');
  };

  return (
    <div className='lobby'>
      <div className='lobby-header'>
        <h1 className='lobby-title'>COUP</h1>
        <p className='lobby-subtitle'>A Game of Deception & Strategy</p>
      </div>

      {roomId ? (
        <div className='room-container'>
          <div className='room-info'>
            <h2>Room: {roomId}</h2>
            <p>Share this code with friends to join</p>
          </div>

          <div className='players-list'>
            <h3>Players ({gameState?.players.length || 0}/6)</h3>
            <div className='players-grid'>
              {gameState?.players.map((player) => (
                <div
                  key={player.id}
                  className={`player-card ${player.id === playerId ? 'you' : ''} ${player.id === gameState.hostId ? 'host' : ''}`}
                >
                  <div className='player-name'>{player.name}</div>
                  {player.id === playerId && (
                    <div className='you-badge'>You</div>
                  )}
                  {player.id === gameState.hostId && (
                    <div className='host-badge'>Host</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {gameState?.hostId === playerId && (
            <button
              className='start-button'
              onClick={handleStartGame}
              disabled={!gameState || gameState.players.length < 2}
            >
              Start Game
            </button>
          )}

          {gameState && gameState.players.length < 2 && (
            <p className='waiting-text'>
              Waiting for more players (minimum 2)...
            </p>
          )}
        </div>
      ) : (
        <div className='lobby-actions'>
          <button
            className='action-button create'
            onClick={() => {
              setShowCreate(true);
              setShowJoin(false);
            }}
          >
            Create Room
          </button>
          <button
            className='action-button join'
            onClick={() => {
              setShowJoin(true);
              setShowCreate(false);
            }}
          >
            Join Room
          </button>

          {showCreate && (
            <form className='lobby-form' onSubmit={handleCreate}>
              <input
                type='text'
                placeholder='Enter your name'
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className='lobby-input'
                autoFocus
              />
              <div className='form-buttons'>
                <button type='submit' className='submit-button'>
                  Create
                </button>
                <button
                  type='button'
                  className='cancel-button'
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {showJoin && (
            <form className='lobby-form' onSubmit={handleJoin}>
              <input
                type='text'
                placeholder='Enter your name'
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className='lobby-input'
              />
              <input
                type='text'
                placeholder='Enter room code'
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                className='lobby-input'
                maxLength={6}
                autoFocus
              />
              <div className='form-buttons'>
                <button type='submit' className='submit-button'>
                  Join
                </button>
                <button
                  type='button'
                  className='cancel-button'
                  onClick={() => setShowJoin(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default Lobby;
