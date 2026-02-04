import { useEffect, useRef, useState } from 'react';

import ActionPanel from './ActionPanel';
import Card from './Card';
import './GameBoard.css';
import PlayerArea from './PlayerArea';

function AmbassadorExchange({
  currentCards,
  drawnCards,
  keepCount,
  onConfirm,
}) {
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    setSelected([]);
  }, [currentCards, drawnCards, keepCount]);

  const options = [...(currentCards || []), ...(drawnCards || [])];
  const currentCount = currentCards ? currentCards.length : 0;

  const toggleSelection = (index) => {
    setSelected((prev) => {
      if (prev.includes(index)) {
        return prev.filter((item) => item !== index);
      }
      if (prev.length >= keepCount) {
        return prev;
      }
      return [...prev, index];
    });
  };

  return (
    <div className='ambassador-modal'>
      <div className='ambassador-panel'>
        <h3>Ambassador Exchange</h3>
        <p>
          Select {keepCount} card{keepCount === 1 ? '' : 's'} to keep.
        </p>
        <div className='ambassador-section'>
          <h4>Your Cards</h4>
          <div className='ambassador-options'>
            {options.slice(0, currentCount).map((character, index) => (
              <Card
                key={`current-${character}-${index}`}
                character={character}
                revealed
                selected={selected.includes(index)}
                onClick={() => toggleSelection(index)}
              />
            ))}
          </div>
        </div>
        <div className='ambassador-section'>
          <h4>Deck Cards</h4>
          <div className='ambassador-options'>
            {options.slice(currentCount).map((character, offset) => {
              const index = currentCount + offset;
              return (
                <Card
                  key={`drawn-${character}-${index}`}
                  character={character}
                  revealed
                  selected={selected.includes(index)}
                  onClick={() => toggleSelection(index)}
                />
              );
            })}
          </div>
        </div>
        <button
          className='choose-card-button'
          onClick={() => onConfirm(selected)}
          disabled={selected.length !== keepCount}
        >
          Confirm Exchange
        </button>
      </div>
    </div>
  );
}

function GameBoard({ gameState, playerId, playerName, socket }) {
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [statusKind, setStatusKind] = useState('info');
  const [responseLocked, setResponseLocked] = useState(false);
  const lastLogIdRef = useRef(null);
  const messageTimerRef = useRef(null);

  const currentPlayer = gameState.players.find(
    (p) => p.id === gameState.currentPlayerIndex
  );
  const myPlayer = gameState.players.find((p) => p.id === playerId);
  const isMyTurn = currentPlayer?.id === playerId;
  // When there's a block, the challenge target is the blocker; otherwise the action player.
  const challengedPlayerId =
    gameState.pendingAction?.blockerId ??
    gameState.pendingAction?.playerId ??
    null;
  const challengedCharacter =
    gameState.pendingAction?.blockCharacter ??
    gameState.pendingAction?.character ??
    null;
  const challengedPlayerName =
    gameState.players.find((p) => p.id === challengedPlayerId)?.name ??
    'Unknown';
  const canChallenge =
    gameState.phase === 'challenge-pending' &&
    challengedPlayerId !== null &&
    playerId !== challengedPlayerId &&
    !myPlayer?.eliminated;
  const canBlock = (() => {
    if (gameState.phase !== 'block-pending' || !gameState.pendingAction) {
      return false;
    }
    if (myPlayer?.eliminated) return false;
    const action = gameState.pendingAction;
    if (action.type === 'foreign-aid') {
      return playerId !== action.playerId;
    }
    if (action.type === 'assassin' || action.type === 'captain') {
      return playerId === action.targetId;
    }
    return false;
  })();
  // Only the player who must lose a card should choose which one to reveal
  const mustChooseCardPlayerId = (() => {
    if (gameState.phase !== 'choose-card' || !gameState.pendingAction)
      return null;
    const pa = gameState.pendingAction;
    if (pa.challengeStage === 'reveal') return pa.challengedPlayerId;
    if (pa.challengeResult === 'failed') return pa.challengerId; // challenger was wrong → challenger loses
    if (pa.challengeResult === 'success') return pa.challengedPlayerId; // challenged was wrong → they lose
    if (pa.type === 'coup' || pa.type === 'assassination') return pa.targetId; // target of attack loses
    return null;
  })();
  const needsCardChoice = mustChooseCardPlayerId === playerId;

  const responseKey = `${gameState.phase}:${gameState.pendingAction?.type ?? ''}:${gameState.pendingAction?.playerId ?? ''}:${gameState.pendingAction?.blockerId ?? ''}:${gameState.pendingAction?.targetId ?? ''}`;

  useEffect(() => {
    setResponseLocked(false);
  }, [responseKey]);

  const pushMessage = (message, kind = 'info') => {
    setStatusMessage(message);
    setStatusKind(kind);
    if (messageTimerRef.current) {
      clearTimeout(messageTimerRef.current);
    }
    messageTimerRef.current = setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
  };

  useEffect(() => {
    const logs = gameState?.logs;
    if (!logs || logs.length === 0) return;
    const latest = logs[logs.length - 1];
    if (!latest) return;
    const lastSeenId = lastLogIdRef.current ?? 0;
    if (latest.id === lastSeenId) return;

    const relevant = [...logs]
      .reverse()
      .find(
        (entry) =>
          entry.id > lastSeenId &&
          entry.players?.includes(playerId) &&
          entry.outcome === 'lost' &&
          (entry.kind === 'challenge' || entry.kind === 'block')
      );

    lastLogIdRef.current = latest.id;

    if (relevant) {
      pushMessage(relevant.message, 'danger');
    }
  }, [gameState?.logs, playerId]);

  const handleAction = (action, character = null) => {
    if (action === 'coup' || action === 'assassin' || action === 'captain') {
      if (!selectedTarget && selectedTarget !== 0) {
        return;
      }
      if (selectedTarget === playerId) {
        return;
      }
    }
    socket.emit('action', { action, targetId: selectedTarget, character });
    setSelectedTarget(null);
  };

  const handleChallenge = () => {
    if (responseLocked) return;
    if (!gameState.pendingAction || challengedPlayerId == null) return;
    // Always use the same derived target/character as the UI so we never send "challenge yourself".
    const targetId = challengedPlayerId;
    const character = challengedCharacter;
    setResponseLocked(true);
    pushMessage('Challenge submitted.', 'info');
    socket.emit('challenge', { targetId, character });
  };

  const handleBlock = (character) => {
    if (responseLocked) return;
    if (!gameState.pendingAction) return;
    const targetId = gameState.pendingAction.playerId;
    setResponseLocked(true);
    pushMessage('Block submitted.', 'info');
    socket.emit('block', { targetId, character });
  };

  const handlePass = () => {
    if (responseLocked) return;
    setResponseLocked(true);
    pushMessage('Pass submitted.', 'info');
    socket.emit('pass');
  };

  const handleCardChoice = (cardIndex) => {
    socket.emit('choose-card', { cardIndex });
    setSelectedCard(null);
  };

  if (gameState.winner) {
    return (
      <div className='game-board winner-screen'>
        <div className='winner-content'>
          <h1>🎉 Game Over! 🎉</h1>
          <h2>{gameState.winner.name} Wins!</h2>
          <p>They were the last player standing.</p>
        </div>
      </div>
    );
  }

  return (
    <div className='game-board'>
      <div className='game-header'>
        <h1>COUP</h1>
        <div className='game-info'>
          <span className='room-code'>Room: {gameState.roomId}</span>
          <span className='phase-badge'>{gameState.phase}</span>
        </div>
      </div>

      <div className='players-container'>
        {gameState.players.map((player, index) => (
          <PlayerArea
            key={player.id}
            player={player}
            isCurrentPlayer={player.id === gameState.currentPlayerIndex}
            isMe={player.id === playerId}
            onSelect={() => {
              if (
                isMyTurn &&
                gameState.phase === 'playing' &&
                player.id !== playerId &&
                !player.eliminated
              ) {
                setSelectedTarget(player.id);
              }
            }}
            isSelected={selectedTarget === player.id}
            pendingAction={gameState.pendingAction}
          />
        ))}
      </div>

      {myPlayer && (
        <div className='my-hand'>
          <h3>Your Cards</h3>
          {needsCardChoice &&
            gameState.pendingAction?.challengeStage === 'reveal' && (
              <p className='challenge-reveal-hint'>
                You were challenged to show{' '}
                <strong>{gameState.pendingAction?.challengedCharacter}</strong>.
                Select a card to reveal.
              </p>
            )}
          <div className='cards-container'>
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
              className='choose-card-button'
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

          {statusMessage && (
            <div className={`status-banner ${statusKind}`}>{statusMessage}</div>
          )}

          {canChallenge && (
            <div className='challenge-panel'>
              <h3>
                Challenge {challengedPlayerName}
                {gameState.pendingAction?.blockerId != null ? "'s block?" : '?'}
              </h3>
              <p>
                They claimed to have: <strong>{challengedCharacter}</strong>
              </p>
              <button
                className='challenge-button'
                onClick={handleChallenge}
                disabled={responseLocked}
              >
                Challenge
              </button>
              <button
                className='pass-button'
                onClick={handlePass}
                disabled={responseLocked}
              >
                Pass
              </button>
            </div>
          )}

          {canBlock && gameState.pendingAction?.type === 'foreign-aid' && (
            <div className='block-panel'>
              <h3>Block Foreign Aid?</h3>
              <p>
                {
                  gameState.players.find(
                    (p) => p.id === gameState.pendingAction?.playerId
                  )?.name
                }{' '}
                is taking Foreign Aid
              </p>
              <button
                className='block-button'
                onClick={() => handleBlock('Duke')}
                disabled={responseLocked}
              >
                Block with Duke
              </button>
              <button
                className='pass-button'
                onClick={handlePass}
                disabled={responseLocked}
              >
                Pass
              </button>
            </div>
          )}

          {canBlock && gameState.pendingAction?.type === 'assassin' && (
            <div className='block-panel'>
              <h3>Block Assassination?</h3>
              <p>
                {
                  gameState.players.find(
                    (p) => p.id === gameState.pendingAction?.targetId
                  )?.name
                }{' '}
                is being assassinated
              </p>
              {gameState.pendingAction?.targetId === playerId && (
                <button
                  className='block-button'
                  onClick={() => handleBlock('Contessa')}
                  disabled={responseLocked}
                >
                  Block with Contessa
                </button>
              )}
              <button
                className='pass-button'
                onClick={handlePass}
                disabled={responseLocked}
              >
                Pass
              </button>
            </div>
          )}

          {canBlock && gameState.pendingAction?.type === 'captain' && (
            <div className='block-panel'>
              <h3>Block Steal?</h3>
              <p>
                {
                  gameState.players.find(
                    (p) => p.id === gameState.pendingAction?.targetId
                  )?.name
                }{' '}
                is being stolen from
              </p>
              {gameState.pendingAction?.targetId === playerId && (
                <button
                  className='block-button'
                  onClick={() => handleBlock('Captain')}
                  disabled={responseLocked}
                >
                  Block with Captain
                </button>
              )}
              <button
                className='pass-button'
                onClick={handlePass}
                disabled={responseLocked}
              >
                Pass
              </button>
            </div>
          )}
        </div>
      )}

      <div className='action-area'>
        {isMyTurn && gameState.phase === 'playing' && (
          <ActionPanel
            player={myPlayer}
            onAction={handleAction}
            selectedTarget={selectedTarget}
          />
        )}

        {gameState.phase === 'ambassador-exchange' &&
          gameState.pendingAction?.playerId === playerId && (
            <AmbassadorExchange
              currentCards={gameState.pendingAction.currentCards || []}
              drawnCards={gameState.pendingAction.drawnCards || []}
              keepCount={gameState.pendingAction.keepCount || 0}
              onConfirm={(selected) =>
                socket.emit('ambassador-choose', { selectedIndices: selected })
              }
            />
          )}

        {gameState.phase === 'ambassador-exchange' &&
          gameState.pendingAction?.playerId !== playerId && (
            <div className='wait-turn'>
              <p>
                Waiting for{' '}
                {
                  gameState.players.find(
                    (p) => p.id === gameState.pendingAction?.playerId
                  )?.name
                }{' '}
                to exchange cards...
              </p>
            </div>
          )}

        {!isMyTurn && gameState.phase === 'playing' && (
          <div className='wait-turn'>
            <p>Waiting for {currentPlayer?.name}'s turn...</p>
          </div>
        )}

        <div className='game-log'>
          <h3>Game Log</h3>
          {(gameState.logs || []).length > 0 ? (
            <div className='log-entries'>
              {(gameState.logs || []).slice(-8).map((entry) => {
                const isMine = entry.players?.includes(playerId);
                const isLoss = entry.outcome === 'lost';
                return (
                  <div
                    key={entry.id}
                    className={`log-entry ${isMine ? 'mine' : ''} ${
                      isLoss ? 'loss' : ''
                    }`}
                  >
                    {entry.message}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className='log-empty'>No activity yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default GameBoard;
