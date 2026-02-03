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
        <div className="action-group">
          <h4>Basic Actions</h4>
          <button
            className="action-button income"
            onClick={() => onAction('income')}
            disabled={mustCoup}
          >
            Income (+1 coin)
          </button>
          <button
            className="action-button foreign-aid"
            onClick={() => onAction('foreign-aid')}
            disabled={mustCoup}
          >
            Foreign Aid (+2 coins)
          </button>
          <button
            className="action-button coup"
            onClick={() => onAction('coup')}
            disabled={player.coins < 7 || !selectedTarget && selectedTarget !== 0}
          >
            Coup (7 coins)
          </button>
        </div>

        <div className="action-group">
          <h4>Character Actions</h4>
          <button
            className="action-button duke"
            onClick={() => onAction('duke')}
            disabled={mustCoup}
          >
            Duke (+3 coins)
          </button>
          <button
            className="action-button assassin"
            onClick={() => onAction('assassin')}
            disabled={mustCoup || player.coins < 3 || !selectedTarget && selectedTarget !== 0}
          >
            Assassin (3 coins)
          </button>
          <button
            className="action-button captain"
            onClick={() => onAction('captain')}
            disabled={mustCoup || !selectedTarget && selectedTarget !== 0}
          >
            Captain (Steal 2)
          </button>
          <button
            className="action-button ambassador"
            onClick={() => onAction('ambassador')}
            disabled={mustCoup}
          >
            Ambassador (Exchange)
          </button>
        </div>
      </div>

    </div>
  );
}

export default ActionPanel;
