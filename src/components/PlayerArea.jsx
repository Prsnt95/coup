import Card from './Card';
import './PlayerArea.css';

function PlayerArea({ player, isCurrentPlayer, isMe, onSelect, isSelected, pendingAction, playerColor, status, formatStatusMessage }) {
  const isTarget = pendingAction && (
    pendingAction.targetId === player.id ||
    pendingAction.playerId === player.id
  );

  // Format the status message if a formatter is provided
  const formattedStatus = status && formatStatusMessage ? formatStatusMessage(status) : status;

  return (
    <div
      className={`player-area ${isCurrentPlayer ? 'current-turn' : ''} ${isMe ? 'me' : ''} ${isSelected ? 'selected' : ''} ${isTarget ? 'target' : ''} ${player.eliminated ? 'eliminated' : ''}`}
      onClick={onSelect}
      style={{ '--player-color': playerColor }}
    >
      <div className="player-header">
        <h3 className="player-name">{player.name}</h3>
        <div className="player-labels">
          {isMe && <span className="you-label">You</span>}
          {isSelected && <span className="selected-label">Selected</span>}
          {isCurrentPlayer && <span className="turn-indicator">●</span>}
        </div>
      </div>
      
      {status && !player.eliminated && (
        <div className={`player-status status-${status.toLowerCase().replace(/[,\s]+/g, '-').replace(/[^a-z0-9-]/g, '')}`}>
          {formatStatusMessage ? (
            <span dangerouslySetInnerHTML={{ __html: formattedStatus }} />
          ) : (
            status
          )}
        </div>
      )}
      
      <div className={`player-coins ${player.coins >= 7 ? 'fire-glow' : ''}`}>
        <span className="coin-icon">🪙</span>
        <span className="coin-count">{player.coins}</span>
      </div>

      <div className="player-cards">
        {player.cards.map((card, index) => (
          <div key={index} className="card-wrapper">
            <Card
              character={card.character}
              revealed={card.revealed}
              disabled
            />
            {card.revealed && (
              <div className="card-title">
                {card.character}
              </div>
            )}
          </div>
        ))}
      </div>

      {player.eliminated && (
        <div className="eliminated-overlay">
          <span>ELIMINATED</span>
        </div>
      )}
    </div>
  );
}

export default PlayerArea;
