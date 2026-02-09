import './ActionPanel.css';

function ActionPanel({ player, onAction, selectedTarget }) {
  const mustCoup = player.coins >= 10;

  return (
    <div className="action-panel">
      <h3>Your Turn - Choose an Action</h3>
      
      {mustCoup && (
        <div className="mandatory-coup">
          ⚠️ You have 10+ coins! You must perform a Coup.
        </div>
      )}

      <div className="actions-grid">
        <div className="action-group basic-actions">
          <h4>Basic Actions</h4>
          <div className="basic-actions-grid">
            <button
              className="action-button basic-action income"
              onClick={() => onAction('income')}
              disabled={mustCoup}
              title="Income (+1 coin)"
            >
              <span className="action-icon">💰</span>
              <span className="action-label">Income</span>
            </button>
            <button
              className="action-button basic-action foreign-aid"
              onClick={() => onAction('foreign-aid')}
              disabled={mustCoup}
              title="Foreign Aid (+2 coins)"
            >
              <span className="action-icon">💵</span>
              <span className="action-label">Foreign Aid</span>
            </button>
            <button
              className="action-button basic-action coup"
              onClick={() => onAction('coup')}
              disabled={player.coins < 7 || !selectedTarget && selectedTarget !== 0}
              title="Coup (7 coins)"
            >
              <span className="action-icon">⚔️</span>
              <span className="action-label">Coup</span>
            </button>
          </div>
        </div>

        <div className="action-group character-actions">
          <h4>Character Actions</h4>
          <div className="character-actions-grid">
            <button
              className="action-button character-action duke"
              onClick={() => onAction('duke')}
              disabled={mustCoup}
              title="Duke - Tax (+3 coins)"
            >
              <span className="action-icon">👑</span>
              <span className="action-label">Duke</span>
              <span className="action-description">Tax</span>
            </button>
            <button
              className="action-button character-action assassin"
              onClick={() => onAction('assassin')}
              disabled={mustCoup || player.coins < 3 || !selectedTarget && selectedTarget !== 0}
              title="Assassin - Assassinate (3 coins)"
            >
              <span className="action-icon">🗡️</span>
              <span className="action-label">Assassin</span>
              <span className="action-description">Assassinate</span>
            </button>
            <button
              className="action-button character-action captain"
              onClick={() => onAction('captain')}
              disabled={mustCoup || !selectedTarget && selectedTarget !== 0}
              title="Captain - Steal (2 coins)"
            >
              <span className="action-icon">🏴‍☠️</span>
              <span className="action-label">Captain</span>
              <span className="action-description">Steal</span>
            </button>
            <button
              className="action-button character-action ambassador"
              onClick={() => onAction('ambassador')}
              disabled={mustCoup}
              title="Ambassador - Exchange"
            >
              <span className="action-icon">🕴️</span>
              <span className="action-label">Ambassador</span>
              <span className="action-description">Exchange</span>
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

export default ActionPanel;
