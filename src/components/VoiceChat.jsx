import { useEffect, useRef, useState } from 'react';

import { useVoiceChat } from '../hooks/useVoiceChat';
import './VoiceChat.css';

function VoiceChat({ socket, roomId, playerId, players, enabled }) {
  const {
    isMuted,
    toggleMute,
    isVideoOff,
    toggleVideo,
    micError,
    localStream,
    remoteStreams,
    cleanup,
  } = useVoiceChat(socket, roomId, playerId, players, enabled);

  const localVideoRef = useRef(null);
  const [showVideoPanel, setShowVideoPanel] = useState(false);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  useEffect(() => {
    if (!localVideoRef.current) return;
    if (localStream && localStream.getVideoTracks().length > 0) {
      localVideoRef.current.srcObject = localStream;
    } else {
      localVideoRef.current.srcObject = null;
    }
  }, [localStream, showVideoPanel]);

  if (!enabled) return null;

  const remoteList = [...remoteStreams.entries()];

  return (
    <div className='voice-chat'>
      {micError && (
        <div className='voice-chat-error' title={micError}>
          Camera/mic unavailable
        </div>
      )}
      <div className='voice-chat-buttons'>
        <button
          type='button'
          className={`voice-chat-btn ${isMuted ? 'muted' : ''}`}
          onClick={toggleMute}
          title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          disabled={!!micError}
        >
          {isMuted ? (
            <svg
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth='2'
            >
              <path d='M11 5L6 9H2v6h4l5 4V5z' />
              <line x1='23' y1='9' x2='17' y2='15' />
              <line x1='17' y1='9' x2='23' y2='15' />
            </svg>
          ) : (
            <svg
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth='2'
            >
              <path d='M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z' />
              <path d='M19 10v2a7 7 0 0 1-14 0v-2' />
              <line x1='12' y1='19' x2='12' y2='23' />
              <line x1='8' y1='23' x2='16' y2='23' />
            </svg>
          )}
        </button>
        <button
          type='button'
          className={`voice-chat-btn ${isVideoOff ? 'muted' : ''}`}
          onClick={toggleVideo}
          title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
          disabled={!!micError}
        >
          {isVideoOff ? (
            <svg
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth='2'
            >
              <path d='M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10' />
              <line x1='1' y1='1' x2='23' y2='23' />
            </svg>
          ) : (
            <svg
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth='2'
            >
              <path d='M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z' />
              <circle cx='12' cy='13' r='4' />
            </svg>
          )}
        </button>
        <button
          type='button'
          className={`voice-chat-btn ${showVideoPanel ? 'active' : ''}`}
          onClick={() => setShowVideoPanel((v) => !v)}
          title={showVideoPanel ? 'Hide video' : 'Show video'}
        >
          <svg
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
          >
            <rect x='2' y='7' width='20' height='15' rx='2' ry='2' />
            <polyline points='17 2 12 7 7 2' />
          </svg>
        </button>
      </div>

      {showVideoPanel && (
        <div className='voice-chat-panel'>
          <div className='voice-chat-videos'>
            <div className='voice-chat-video-tile local'>
              <video ref={localVideoRef} autoPlay playsInline muted />
              <span className='voice-chat-label'>You</span>
            </div>
            {remoteList.map(([id, { stream, name }]) => (
              <RemoteVideo key={id} stream={stream} name={name} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RemoteVideo({ stream, name }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <div className='voice-chat-video-tile remote'>
      <video ref={ref} autoPlay playsInline />
      <span className='voice-chat-label'>{name}</span>
    </div>
  );
}

export default VoiceChat;
