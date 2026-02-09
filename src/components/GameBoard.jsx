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

function GameBoard({ gameState, playerId, playerName, socket, onLeaveGame }) {
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [statusKind, setStatusKind] = useState('info');
  const [responseLocked, setResponseLocked] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const lastLogIdRef = useRef(null);
  const messageTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);

  // Create player color mapping (avoiding log colors: orange/warning #f59e0b, red/danger #ef4444)
  // Using high-contrast colors that are distinct from each other
  const playerColors = [
    '#6366f1', // Indigo (blue)
    '#10b981', // Emerald (green)
    '#8b5cf6', // Violet (purple)
    '#06b6d4', // Cyan (light blue)
    '#f472b6', // Pink (distinct from red)
    '#84cc16', // Lime (yellow-green)
  ];
  const playerColorMap = new Map();
  gameState.players.forEach((player, index) => {
    playerColorMap.set(player.name, playerColors[index % playerColors.length]);
  });

  // Function to format log message with colored player names
  const formatLogMessage = (message) => {
    if (!message) return message;
    let formatted = message;

    // Replace each player name with a colored span
    gameState.players.forEach((player) => {
      const color = playerColorMap.get(player.name);
      if (color) {
        // Escape special regex characters in player name
        const escapedName = player.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Use word boundary regex to match whole words only
        const regex = new RegExp(`\\b${escapedName}\\b`, 'g');
        formatted = formatted.replace(regex, (match) => {
          return `<span style="color: ${color}; font-weight: 600;">${match}</span>`;
        });
      }
    });

    return formatted;
  };

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
  const isRevealContext =
    needsCardChoice &&
    gameState.pendingAction?.challengeStage === 'reveal';
  const isDiscardContext = needsCardChoice && !isRevealContext;

  // Function to determine player status based on current game state
  const getPlayerStatus = (playerIdToCheck) => {
    const player = gameState.players.find((p) => p.id === playerIdToCheck);
    if (!player || player.eliminated) {
      return null;
    }

    // During choose-card phase (after challenge), show win/loss status
    if (gameState.phase === 'choose-card' && gameState.pendingAction) {
      const pa = gameState.pendingAction;
      const challengerId = pa.challengerId;
      const challengedId = pa.challengedPlayerId;

      // If challenge result is determined
      if (pa.challengeResult === 'failed') {
        // Challenger was wrong - challenger loses, challenged wins
        if (playerIdToCheck === challengerId) {
          return 'Lost Challenge, Discarding card';
        }
        if (playerIdToCheck === challengedId) {
          return 'Won Challenge';
        }
      } else if (pa.challengeResult === 'success') {
        // Challenged was wrong - challenged loses, challenger wins
        if (playerIdToCheck === challengedId) {
          return 'Lost Challenge, Discarding card';
        }
        if (playerIdToCheck === challengerId) {
          return 'Won Challenge';
        }
      } else if (pa.challengeStage === 'reveal') {
        // Still waiting for reveal - challenged needs to choose card
        if (playerIdToCheck === challengedId) {
          return 'Revealing card';
        }
        if (playerIdToCheck === challengerId) {
          return 'Challenge';
        }
      }

      // Fallback: if player needs to choose a card (coup/assassination = discard)
      if (mustChooseCardPlayerId === playerIdToCheck) {
        return 'Discarding card';
      }
    }

    // Check if player needs to choose a card (for non-challenge cases)
    if (mustChooseCardPlayerId === playerIdToCheck) {
      return 'Discarding card';
    }

    // If it's the player's turn and they haven't acted yet
    if (
      playerIdToCheck === gameState.currentPlayerIndex &&
      gameState.phase === 'playing'
    ) {
      return null; // Border indicator is enough
    }

    // During challenge-pending phase
    if (
      gameState.phase === 'challenge-pending' &&
      gameState.responseState?.type === 'challenge'
    ) {
      // If this player is the one being challenged
      if (playerIdToCheck === challengedPlayerId) {
        // Find what they claimed from logs
        const logs = gameState.logs || [];
        for (let i = logs.length - 1; i >= 0; i--) {
          const entry = logs[i];
          if (
            entry.players?.includes(playerIdToCheck) &&
            (entry.message.includes('claimed') ||
              entry.message.includes('attempted'))
          ) {
            return entry.message;
          }
        }
        return null;
      }

      // If this player challenged
      if (gameState.pendingAction?.challengerId === playerIdToCheck) {
        return 'Challenge';
      }

      // If this player passed
      if (gameState.responseState.passed?.includes(playerIdToCheck)) {
        return 'Passed';
      }

      // If this player is eligible but hasn't acted
      if (gameState.responseState.eligible?.includes(playerIdToCheck)) {
        return 'Waiting';
      }
    }

    // During block-pending phase
    if (
      gameState.phase === 'block-pending' &&
      gameState.responseState?.type === 'block'
    ) {
      // If this player blocked
      if (gameState.pendingAction?.blockerId === playerIdToCheck) {
        return 'Blocking';
      }

      // If this player passed
      if (gameState.responseState.passed?.includes(playerIdToCheck)) {
        return 'Passed';
      }

      // If this player is eligible but hasn't acted
      if (gameState.responseState.eligible?.includes(playerIdToCheck)) {
        return 'Waiting';
      }
    }

    // If there's a pending action and this player performed it, show what they claimed
    // (This handles block-pending phase where the action player isn't being challenged)
    if (
      gameState.pendingAction?.playerId === playerIdToCheck &&
      gameState.phase !== 'challenge-pending'
    ) {
      const logs = gameState.logs || [];
      for (let i = logs.length - 1; i >= 0; i--) {
        const entry = logs[i];
        if (
          entry.players?.includes(playerIdToCheck) &&
          (entry.message.includes('claimed') ||
            entry.message.includes('attempted') ||
            entry.message.includes('taking Foreign Aid') ||
            entry.message.includes('took Income'))
        ) {
          return entry.message;
        }
      }
    }

    return null;
  };

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
      // Check if target is null or undefined (0 is a valid player ID)
      if (selectedTarget === null || selectedTarget === undefined) {
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

  // Countdown timer for game over screen
  useEffect(() => {
    if (gameState?.winner) {
      setCountdown(5);
      countdownTimerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownTimerRef.current);
            if (onLeaveGame) {
              onLeaveGame();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, [gameState?.winner, onLeaveGame]);

  if (gameState.winner) {
    return (
      <div className='game-board winner-screen'>
        <div className='winner-content'>
          <h1>🎉 Game Over! 🎉</h1>
          <h2>{gameState.winner.name} Wins!</h2>
          <p>They were the last player standing.</p>
          <p className='countdown-timer'>
            Returning to home screen in {countdown}...
          </p>
        </div>
      </div>
    );
  }

  const handleLeaveGame = () => {
    if (window.confirm('Are you sure you want to leave the game?')) {
      socket.emit('leave-game');
      if (onLeaveGame) {
        onLeaveGame();
      }
    }
  };

  return (
    <div className='game-board'>
      <div className='game-header'>
        <h1>COUP</h1>
        <div className='game-info'>
          <span className='room-code'>Room: {gameState.roomId}</span>
          <span className='phase-badge'>{gameState.phase}</span>
          <button className='leave-game-button' onClick={handleLeaveGame}>
            Leave Game
          </button>
        </div>
      </div>

      <div className='players-and-logs'>
        <div className='players-container'>
          {gameState.players.map((player, index) => {
            // Use the same color mapping as defined above
            const playerColor =
              playerColorMap.get(player.name) ||
              playerColors[index % playerColors.length];

            return (
              <PlayerArea
                key={player.id}
                player={player}
                isCurrentPlayer={player.id === gameState.currentPlayerIndex}
                isMe={player.id === playerId}
                playerColor={playerColor}
                status={getPlayerStatus(player.id)}
                formatStatusMessage={formatLogMessage}
                onSelect={() => {
                  if (
                    isMyTurn &&
                    gameState.phase === 'playing' &&
                    player.id !== playerId &&
                    !player.eliminated
                  ) {
                    // Toggle selection - if already selected, unselect
                    if (selectedTarget === player.id) {
                      setSelectedTarget(null);
                    } else {
                      setSelectedTarget(player.id);
                    }
                  }
                }}
                isSelected={selectedTarget === player.id}
                pendingAction={gameState.pendingAction}
              />
            );
          })}
        </div>
        <div className='game-log'>
          <h3>Game Log</h3>
          {(gameState.logs || []).length > 0 ? (
            <div className='log-entries'>
              {(gameState.logs || []).slice(-15).map((entry) => {
                const isMine = entry.players?.includes(playerId);
                const isLoss = entry.outcome === 'lost';
                const formattedMessage = formatLogMessage(entry.message);
                return (
                  <div
                    key={entry.id}
                    className={`log-entry ${isMine ? 'mine' : ''} ${
                      isLoss ? 'loss' : ''
                    }`}
                    dangerouslySetInnerHTML={{ __html: formattedMessage }}
                  />
                );
              })}
            </div>
          ) : (
            <p className='log-empty'>No activity yet.</p>
          )}
        </div>
      </div>

      {myPlayer && (
        <div className='hand-and-actions'>
        <div className='my-hand'>
          <h3>Your Cards</h3>
          {isRevealContext && (
            <p className='challenge-reveal-hint'>
              You were challenged to show{' '}
              <strong>{gameState.pendingAction?.challengedCharacter}</strong>.
              Select a card to reveal.
            </p>
          )}
          {isDiscardContext && (
            <p className='challenge-reveal-hint'>
              You are losing influence. Select a card to discard.
            </p>
          )}
          <div className='cards-container'>
            {myPlayer.cards.map((card, index) => (
              <div key={index} className='card-wrapper'>
                <Card
                  character={card.character}
                  revealed={card.revealed}
                  onClick={() => {
                    if (needsCardChoice && !card.revealed) {
                      setSelectedCard(index);
                    }
                  }}
                  selected={selectedCard === index}
                  disabled={!needsCardChoice || card.revealed}
                />
                <div className='card-title'>{card.character}</div>
              </div>
            ))}
          </div>
          {needsCardChoice && (
            <button
              className='choose-card-button'
              onClick={() => {
                if (
                  selectedCard !== null &&
                  myPlayer.cards[selectedCard] &&
                  !myPlayer.cards[selectedCard].revealed
                ) {
                  handleCardChoice(selectedCard);
                }
              }}
              disabled={
                selectedCard === null ||
                (selectedCard !== null &&
                  myPlayer.cards[selectedCard]?.revealed)
              }
            >
              {isRevealContext ? 'Reveal' : 'Discard'}
            </button>
          )}

          {statusMessage && (
            <div className={`status-banner ${statusKind}`}>{statusMessage}</div>
          )}
        </div>

      {/* Action area: challenge, block, actions, or waiting */}
      <div className='action-area'>
      {canChallenge ? (
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
      ) : canBlock && gameState.pendingAction?.type === 'foreign-aid' ? (
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
      ) : canBlock && gameState.pendingAction?.type === 'assassin' ? (
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
      ) : canBlock && gameState.pendingAction?.type === 'captain' ? (
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
            <>
              <button
                className='block-button'
                onClick={() => handleBlock('Captain')}
                disabled={responseLocked}
              >
                Block with Captain
              </button>
              <button
                className='block-button'
                onClick={() => handleBlock('Ambassador')}
                disabled={responseLocked}
              >
                Block with Ambassador
              </button>
            </>
          )}
          <button
            className='pass-button'
            onClick={handlePass}
            disabled={responseLocked}
          >
            Pass
          </button>
        </div>
      ) : isMyTurn && gameState.phase === 'playing' ? (
        <ActionPanel
          player={myPlayer}
          onAction={handleAction}
          selectedTarget={selectedTarget}
        />
      ) : needsCardChoice ? (
        <div className='card-choice-hint-panel'>
          {isDiscardContext ? (
            <p>You are losing influence. Select a card to discard.</p>
          ) : (
            <p>
              You were challenged to show{' '}
              <strong>{gameState.pendingAction?.challengedCharacter}</strong>.
              Select a card to reveal.
            </p>
          )}
        </div>
      ) : (
        <div className='waiting-panel'>
              <h3>Waiting for:</h3>
              <p>
                {(() => {
                  // During challenge-pending phase (challengedPlayerId can be 0)
                  if (
                    gameState.phase === 'challenge-pending' &&
                    gameState.pendingAction &&
                    challengedPlayerId != null
                  ) {
                    // I'm the one who made the action (could be challenged) - waiting for others to pass or challenge
                    if (challengedPlayerId === playerId) {
                      return 'other players to pass or challenge';
                    }
                    // Challenged player needs to reveal their card - we're waiting for them
                    if (gameState.pendingAction?.challengeStage === 'reveal') {
                      const challengedPlayer = gameState.players.find(
                        (p) => p.id === challengedPlayerId
                      );
                      return challengedPlayer
                        ? `${challengedPlayer.name} to respond to challenge`
                        : 'challenge response';
                    }
                    // I'm not eligible to challenge - waiting for others to pass or challenge
                    if (!canChallenge) {
                      return 'other players to pass or challenge';
                    }
                  }
                  if (
                    gameState.phase === 'block-pending' &&
                    gameState.pendingAction
                  ) {
                    const actionPlayer = gameState.players.find(
                      (p) => p.id === gameState.pendingAction?.playerId
                    );
                    if (gameState.pendingAction.type === 'foreign-aid') {
                      return actionPlayer
                        ? `someone to block ${actionPlayer.name}'s Foreign Aid`
                        : 'block response';
                    }
                    if (
                      gameState.pendingAction.type === 'assassin' ||
                      gameState.pendingAction.type === 'captain'
                    ) {
                      const targetPlayer = gameState.players.find(
                        (p) => p.id === gameState.pendingAction?.targetId
                      );
                      return targetPlayer
                        ? `${targetPlayer.name} to block`
                        : 'block response';
                    }
                  }
                  if (
                    gameState.phase === 'choose-card' &&
                    gameState.pendingAction
                  ) {
                    const choosingPlayer = gameState.players.find(
                      (p) => p.id === mustChooseCardPlayerId
                    );
                    const isReveal =
                      gameState.pendingAction?.challengeStage === 'reveal';
                    const action = isReveal ? 'reveal a card' : 'discard a card';
                    return choosingPlayer
                      ? `${choosingPlayer.name} to ${action}`
                      : 'card choice';
                  }
                  if (gameState.phase === 'ambassador-exchange' && gameState.pendingAction) {
                    const exchangingPlayer = gameState.players.find(
                      (p) => p.id === gameState.pendingAction?.playerId
                    );
                    return exchangingPlayer
                      ? `${exchangingPlayer.name} to complete their Ambassador exchange`
                      : 'Ambassador exchange';
                  }
                  if (
                    gameState.currentPlayerIndex !== null &&
                    gameState.phase === 'playing'
                  ) {
                    const currentPlayer = gameState.players.find(
                      (p) => p.id === gameState.currentPlayerIndex
                    );
                    return currentPlayer
                      ? `${currentPlayer.name} to take their turn`
                      : 'next turn';
                  }
                  return 'game to continue';
                })()}
              </p>
            </div>
      )}
      </div>
        </div>
      )}

      {/* Ambassador Exchange Modal - rendered outside action-area */}
      {gameState.phase === 'ambassador-exchange' &&
        gameState.pendingAction?.playerId === playerId && (
          <AmbassadorExchange
            currentCards={gameState.pendingAction.currentCards || []}
            drawnCards={gameState.pendingAction.drawnCards || []}
            keepCount={gameState.pendingAction.keepCount || 0}
            onConfirm={(selected) =>
              socket.emit('ambassador-choose', {
                selectedIndices: selected,
              })
            }
          />
        )}
    </div>
  );
}

export default GameBoard;
