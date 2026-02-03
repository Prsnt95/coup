import { useState, useEffect } from 'react';
import PlayerArea from './PlayerArea';
import ActionPanel from './ActionPanel';
import Card from './Card';
import './GameBoard.css';

function GameBoard({ gameState, playerId, playerName, socket }) {
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);

  const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayerIndex);
  const myPlayer = gameState.players.find(p => p.id === playerId);
  const isMyTurn = currentPlayer?.id === playerId;
  const canChallenge = gameState.phase === 'challenge-pending' && !isMyTurn;
  const canBlock = gameState.phase === 'block-pending' && !isMyTurn;
  const needsCardChoice = gameState.phase === 'choose-card' && 
    (gameState.pendingAction?.playerId === playerId || 
     gameState.pendingAction?.challengerId === playerId);

  const handleAction = (action, character = null) => {
    if (action === 'coup' || action === 'assassin' || action === 'captain') {
      if (!selectedTarget && selectedTarget !== 0) {
        return;
      }
    }
    socket.emit('action', { action, targetId: selectedTarget, character });
    setSelectedTarget(null);
  };

  const handleChallenge = () => {
    if (!gameState.pendingAction) return;
    let targetId, character;
    if (gameState.pendingAction.blockerId) {
      // Challenging a block
      targetId = gameState.pendingAction.blockerId;
      character = gameState.pendingAction.blockCharacter;
    } else {
      // Challenging an action
      targetId = gameState.pendingAction.playerId;
      character = gameState.pendingAction.character;
    }
    socket.emit('challenge', { targetId, character });
  };

  const handleBlock = (character) => {
    if (!gameState.pendingAction) return;
    const targetId = gameState.pendingAction.playerId;
    socket.emit('block', { targetId, character });
  };

  const handlePass = () => {
    socket.emit('pass');
  };

  const handleCardChoice = (cardIndex) => {
    socket.emit('choose-card', { cardIndex });
    setSelectedCard(null);
  };

  if (gameState.winner) {
    return (
      <div className="game-board winner-screen">
        <div className="winner-content">
          <h1>🎉 Game Over! 🎉</h1>
          <h2>{gameState.winner.name} Wins!</h2>
          <p>They were the last player standing.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="game-board">
      <div className="game-header">
        <h1>COUP</h1>
        <div className="game-info">
          <span className="room-code">Room: {gameState.roomId}</span>
          <span className="phase-badge">{gameState.phase}</span>
        </div>
      </div>

      <div className="players-container">
        {gameState.players.map((player, index) => (
          <PlayerArea
            key={player.id}
            player={player}
            isCurrentPlayer={player.id === gameState.currentPlayerIndex}
            isMe={player.id === playerId}
            onSelect={() => {
              if (isMyTurn && (gameState.phase === 'playing')) {
                setSelectedTarget(player.id);
              }
            }}
            isSelected={selectedTarget === player.id}
            pendingAction={gameState.pendingAction}
          />
        ))}
      </div>

      {myPlayer && (
        <div className="my-hand">
          <h3>Your Cards</h3>
          <div className="cards-container">
            {myPlayer.cards.map((card, index) => (
              <Card
                key={index}
                character={card.character}
                revealed={card.revealed}
                onClick={() => {
                  if (needsCardChoice) {
                    setSelectedCard(index);
                  }
                }}
                selected={selectedCard === index}
                disabled={!needsCardChoice}
              />
            ))}
          </div>
          {needsCardChoice && (
            <button
              className="choose-card-button"
              onClick={() => {
                if (selectedCard !== null) {
                  handleCardChoice(selectedCard);
                }
              }}
              disabled={selectedCard === null}
            >
              Choose This Card
            </button>
          )}
        </div>
      )}

      <div className="action-area">
        {isMyTurn && gameState.phase === 'playing' && (
          <ActionPanel
            player={myPlayer}
            otherPlayers={gameState.players.filter(p => p.id !== playerId && !p.eliminated)}
            onAction={handleAction}
            selectedTarget={selectedTarget}
          />
        )}

        {canChallenge && (
          <div className="challenge-panel">
            {gameState.pendingAction?.blockerId ? (
              <>
                <h3>Challenge {gameState.players.find(p => p.id === gameState.pendingAction?.blockerId)?.name}'s block?</h3>
                <p>They claimed to have: <strong>{gameState.pendingAction?.blockCharacter}</strong></p>
              </>
            ) : (
              <>
                <h3>Challenge {gameState.players.find(p => p.id === gameState.pendingAction?.playerId)?.name}?</h3>
                <p>They claimed to have: <strong>{gameState.pendingAction?.character}</strong></p>
              </>
            )}
            <button className="challenge-button" onClick={handleChallenge}>
              Challenge
            </button>
            <button className="pass-button" onClick={handlePass}>
              Pass
            </button>
          </div>
        )}

        {canBlock && gameState.pendingAction?.type === 'foreign-aid' && (
          <div className="block-panel">
            <h3>Block Foreign Aid?</h3>
            <p>{gameState.players.find(p => p.id === gameState.pendingAction?.playerId)?.name} is taking Foreign Aid</p>
            <button className="block-button" onClick={() => handleBlock('Duke')}>
              Block with Duke
            </button>
            <button className="pass-button" onClick={handlePass}>
              Pass
            </button>
          </div>
        )}

        {canBlock && gameState.pendingAction?.type === 'assassin' && (
          <div className="block-panel">
            <h3>Block Assassination?</h3>
            <p>{gameState.players.find(p => p.id === gameState.pendingAction?.targetId)?.name} is being assassinated</p>
            {gameState.pendingAction?.targetId === playerId && (
              <button className="block-button" onClick={() => handleBlock('Contessa')}>
                Block with Contessa
              </button>
            )}
            <button className="pass-button" onClick={handlePass}>
              Pass
            </button>
          </div>
        )}

        {canBlock && gameState.pendingAction?.type === 'captain' && (
          <div className="block-panel">
            <h3>Block Steal?</h3>
            <p>{gameState.players.find(p => p.id === gameState.pendingAction?.targetId)?.name} is being stolen from</p>
            {gameState.pendingAction?.targetId === playerId && (
              <button className="block-button" onClick={() => handleBlock('Captain')}>
                Block with Captain
              </button>
            )}
            <button className="pass-button" onClick={handlePass}>
              Pass
            </button>
          </div>
        )}

        {!isMyTurn && gameState.phase === 'playing' && (
          <div className="wait-turn">
            <p>Waiting for {currentPlayer?.name}'s turn...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default GameBoard;
