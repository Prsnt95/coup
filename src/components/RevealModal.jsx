import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import AssassinImg from '../assets/Assassin.png';
import AmbassadorImg from '../assets/Ambassador.png';
import CaptainImg from '../assets/Captain.png';
import ContessaImg from '../assets/contessa.png';
import DukeImg from '../assets/Duke.png';
import './RevealModal.css';

const CHARACTER_IMAGES = {
  Assassin: AssassinImg,
  Ambassador: AmbassadorImg,
  Captain: CaptainImg,
  Contessa: ContessaImg,
  Duke: DukeImg,
};

const CHARACTER_COLORS = {
  Duke: '#6366f1',
  Assassin: '#7c2d12',
  Captain: '#8b5cf6',
  Ambassador: '#059669',
  Contessa: '#ec4899',
};

function RevealModal({ reveal, onDismiss }) {
  const [stage, setStage] = useState('pop'); // pop -> flip -> result -> done
  const [flipped, setFlipped] = useState(false);

  const character = reveal?.character;
  const imageSrc = character ? CHARACTER_IMAGES[character] : null;

  useEffect(() => {
    if (!reveal) return;

    // Stage 1: Card pops up (1.2s)
    const popTimer = setTimeout(() => setStage('flip'), 1200);

    // Stage 2: Card flips to reveal (1.5s after pop)
    const flipTimer = setTimeout(() => setFlipped(true), 2700);

    // Stage 3: Show result text (2s after flip starts)
    const resultTimer = setTimeout(() => setStage('result'), 3500);

    // Stage 4: Dismiss after result displayed (2.5s to read)
    const dismissTimer = setTimeout(() => {
      setStage('done');
      onDismiss?.();
    }, 6000);

    return () => {
      clearTimeout(popTimer);
      clearTimeout(flipTimer);
      clearTimeout(resultTimer);
      clearTimeout(dismissTimer);
    };
  }, [reveal, onDismiss]);

  if (!reveal) return null;

  const isChallenge = reveal.challengeResult != null;
  const resultMessage =
    reveal.challengeResult === 'failed'
      ? `${reveal.challengerName} was wrong! ${reveal.playerName} had the ${reveal.character}.`
      : reveal.challengeResult === 'success'
        ? `${reveal.playerName} didn't have it! They revealed ${reveal.character} and lost influence.`
        : reveal.context === 'coup'
          ? `${reveal.playerName} lost their ${reveal.character} to a Coup!`
          : reveal.context === 'assassination'
            ? `${reveal.playerName} lost their ${reveal.character} to Assassination!`
            : `${reveal.playerName} revealed ${reveal.character}.`;

  const modalContent = (
    <div className="reveal-modal-overlay" onClick={() => stage === 'result' && onDismiss?.()}>
      <div className={`reveal-modal ${stage}`}>
        <div className="reveal-card-container">
          <div
            className={`reveal-card ${flipped ? 'flipped' : ''}`}
            style={{
              '--card-color':
                (character && CHARACTER_COLORS[character]) || 'var(--primary)',
            }}
          >
            <div className="reveal-card-inner">
              <div className="reveal-card-back">
                <span className="reveal-card-back-icon">?</span>
              </div>
              <div className="reveal-card-front">
                {imageSrc ? (
                  <img src={imageSrc} alt={character} className="reveal-card-image" />
                ) : (
                  <span className="reveal-card-character">{character}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {stage === 'result' || stage === 'done' ? (
          <div className="reveal-result">
            <h3 className="reveal-result-title">
              {reveal.challengeResult === 'failed'
                ? 'Challenge Failed!'
                : reveal.challengeResult === 'success'
                  ? 'Challenge Succeeded!'
                  : 'Card Revealed'}
            </h3>
            <p className="reveal-result-message">{resultMessage}</p>
          </div>
        ) : (
          <p className="reveal-hint">
            {stage === 'pop' && 'Revealing...'}
            {stage === 'flip' && 'The truth is revealed!'}
          </p>
        )}
      </div>
    </div>
  );

  // Render at document.body to avoid overflow/stacking issues
  return createPortal(modalContent, document.body);
}

export default RevealModal;
