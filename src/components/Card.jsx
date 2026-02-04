import AssassinImg from '../assets/Assassin.png';
import AmbassadorImg from '../assets/Ambassador.png';
import CaptainImg from '../assets/Captain.png';
import ContessaImg from '../assets/contessa.png';
import DukeImg from '../assets/Duke.png';
import './Card.css';

const CHARACTER_COLORS = {
  Duke: '#6366f1',
  Assassin: '#7c2d12',
  Captain: '#8b5cf6',
  Ambassador: '#059669',
  Contessa: '#ec4899',
  Hidden: '#1e293b',
};

const CHARACTER_IMAGES = {
  Assassin: AssassinImg,
  Ambassador: AmbassadorImg,
  Captain: CaptainImg,
  Contessa: ContessaImg,
  Duke: DukeImg,
};

function Card({ character, revealed, onClick, selected, disabled }) {
  const color = CHARACTER_COLORS[character] || CHARACTER_COLORS.Hidden;
  const isHidden = character === 'Hidden';
  const imageSrc = CHARACTER_IMAGES[character];

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
          {imageSrc ? (
            <img src={imageSrc} alt={character} className='card-image' />
          ) : (
            <div className='card-character'>{character}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default Card;
