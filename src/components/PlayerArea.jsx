import Card from './Card';
import './PlayerArea.css';

function PlayerArea({ player, isCurrentPlayer, isMe, onSelect, isSelected, pendingAction }) {
  const isTarget = pendingAction && (
    pendingAction.targetId === player.id ||
    pendingAction.playerId === player.id
  );

  return (
    <div
      className={`player-area ${isCurrentPlayer ? 'current-turn' : ''} ${isMe ? 'me' : ''} ${isSelected ? 'selected' : ''} ${isTarget ? 'target' : ''} ${player.eliminated ? 'eliminated' : ''}`}
      onClick={onSelect}
    >
      <div className="player-header">
        <h3 className="player-name">{player.name}</h3>
        {isMe && <span className="you-label">You</span>}
        {isCurrentPlayer && <span className="turn-indicator">●</span>}
      </div>
      
      <div className="player-coins">
        <span className="coin-icon">🪙</span>
        <span className="coin-count">{player.coins}</span>
      </div>

      <div className="player-cards">
        {player.cards.map((card, index) => (
          <Card
            key={index}
            character={card.character}
            revealed={card.revealed}
            disabled
          />
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
