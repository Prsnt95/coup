import './Card.css';

const CHARACTER_COLORS = {
  Duke: '#6366f1',
  Assassin: '#7c2d12',
  Captain: '#8b5cf6',
  Ambassador: '#059669',
  Contessa: '#ec4899',
  Hidden: '#1e293b',
};

function Card({ character, revealed, onClick, selected, disabled }) {
  const color = CHARACTER_COLORS[character] || CHARACTER_COLORS.Hidden;
  const isHidden = character === 'Hidden';

  return (
    <div
      className={`card ${revealed ? 'revealed' : ''} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
      style={{ '--card-color': color }}
    >
      {isHidden ? (
        <div className='card-content hidden-content'>
          <div className='card-back'>?</div>
        </div>
      ) : (
        <div
          className={`card-content ${revealed ? 'revealed-content' : 'owned-content'}`}
        >
          <div className='card-character'>{character}</div>
        </div>
      )}
    </div>
  );
}

export default Card;
