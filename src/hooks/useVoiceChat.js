import { useCallback, useEffect, useRef, useState } from 'react';

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useVoiceChat(socket, roomId, playerId, players, enabled) {
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoOff, setIsVideoOff] = useState(true);
  const [micError, setMicError] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map()); // playerId -> { pc, videoEl }
  const pendingCandidatesRef = useRef(new Map());
  const initPromiseRef = useRef(null);
  const reconnectTimersRef = useRef(new Map());

  const clearReconnectTimer = useCallback((remotePlayerId) => {
    const timer = reconnectTimersRef.current.get(remotePlayerId);
    if (timer) {
      clearTimeout(timer);
      reconnectTimersRef.current.delete(remotePlayerId);
    }
  }, []);

  const getLocalStream = useCallback(
    async (includeAudio = false, includeVideo = false) => {
      const existing = localStreamRef.current;
      const hasAudio = existing?.getAudioTracks().length > 0;
      const hasVideo = existing?.getVideoTracks().length > 0;

      if (existing && !includeAudio && !includeVideo) {
        [...existing.getTracks()].forEach((t) => {
          t.stop();
          existing.removeTrack(t);
        });
        peersRef.current.forEach(({ pc }) => {
          pc.getSenders().forEach((sender) => {
            if (sender.track) sender.replaceTrack(null);
          });
        });
        localStreamRef.current = null;
        setLocalStream(null);
        return null;
      }
      if (!includeAudio && !includeVideo) return null;

      if (existing) {
        if (includeAudio && !hasAudio) {
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
              video: false,
            });
            const audioTrack = audioStream.getAudioTracks()[0];
            existing.addTrack(audioTrack);
            setLocalStream(new MediaStream(existing.getTracks()));
            for (const [remoteId, { pc }] of peersRef.current) {
              const sender =
                pc.getSenders().find((s) => s.track?.kind === 'audio') ||
                pc.getSenders().find((s) => s.track == null);
              if (sender) {
                await sender.replaceTrack(audioTrack);
              } else {
                pc.addTrack(audioTrack, existing);
              }
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              socket?.emit('voice-offer', { targetPlayerId: remoteId, offer });
            }
            return existing;
          } catch (err) {
            setMicError(err.message || 'Microphone access denied');
            return existing;
          }
        }
        if (!includeAudio && hasAudio) {
          [...existing.getAudioTracks()].forEach((t) => {
            t.stop();
            existing.removeTrack(t);
          });
          peersRef.current.forEach(({ pc }) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
            if (sender) sender.replaceTrack(null);
          });
          setLocalStream(
            existing.getTracks().length > 0 ? new MediaStream(existing.getTracks()) : null
          );
          if (existing.getTracks().length === 0) {
            localStreamRef.current = null;
          }
          return localStreamRef.current;
        }
        if (includeVideo && !hasVideo) {
          try {
            const videoStream = await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
              audio: false,
            });
            const videoTrack = videoStream.getVideoTracks()[0];
            existing.addTrack(videoTrack);
            setLocalStream(new MediaStream(existing.getTracks()));
            for (const [remoteId, { pc }] of peersRef.current) {
              const sender =
                pc.getSenders().find((s) => s.track?.kind === 'video') ||
                pc.getSenders().find((s) => s.track == null);
              if (sender) {
                await sender.replaceTrack(videoTrack);
              } else {
                pc.addTrack(videoTrack, existing);
              }
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              socket?.emit('voice-offer', { targetPlayerId: remoteId, offer });
            }
            return existing;
          } catch (err) {
            setMicError(err.message || 'Camera access denied');
            return existing;
          }
        }
        if (!includeVideo && hasVideo) {
          const videoTracks = [...existing.getVideoTracks()];
          videoTracks.forEach((t) => {
            t.stop();
            existing.removeTrack(t);
          });
          peersRef.current.forEach(({ pc }) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
            if (sender) sender.replaceTrack(null);
          });
          const remaining = existing.getTracks();
          setLocalStream(remaining.length > 0 ? new MediaStream(remaining) : null);
          if (remaining.length === 0) {
            localStreamRef.current = null;
          }
          return localStreamRef.current;
        }
        return existing;
      }

      if (initPromiseRef.current) return initPromiseRef.current;
      initPromiseRef.current = (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: includeAudio
              ? {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                }
              : false,
            video: includeVideo
              ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
              : false,
          });
          localStreamRef.current = stream;
          setLocalStream(stream);
          setMicError(null);
          for (const [remoteId, { pc }] of peersRef.current) {
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket?.emit('voice-offer', { targetPlayerId: remoteId, offer });
          }
          return stream;
        } catch (err) {
          setMicError(err.message || 'Microphone/camera access denied');
          return null;
        } finally {
          initPromiseRef.current = null;
        }
      })();
      return initPromiseRef.current;
    },
    [socket]
  );

  const createPeerConnection = useCallback(
    (remotePlayerId, remotePlayerName) => {
      const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });

      pc.ontrack = (e) => {
        if (e.streams?.[0]) {
          setRemoteStreams((prev) => {
            const next = new Map(prev);
            next.set(remotePlayerId, { stream: e.streams[0], name: remotePlayerName });
            return next;
          });
        }
      };

      pc.onicecandidate = (e) => {
        if (e.candidate && socket?.connected) {
          socket.emit('voice-ice-candidate', {
            targetPlayerId: remotePlayerId,
            candidate: e.candidate,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          clearReconnectTimer(remotePlayerId);
          return;
        }

        if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed' ||
          pc.connectionState === 'disconnected'
        ) {
          clearReconnectTimer(remotePlayerId);
          const timer = setTimeout(() => {
            const current = peersRef.current.get(remotePlayerId)?.pc;
            if (current !== pc) return;
            try {
              pc.close();
            } catch (_) {}
            peersRef.current.delete(remotePlayerId);
            pendingCandidatesRef.current.delete(remotePlayerId);
            setRemoteStreams((prev) => {
              const next = new Map(prev);
              next.delete(remotePlayerId);
              return next;
            });
          }, pc.connectionState === 'disconnected' ? 3000 : 0);
          reconnectTimersRef.current.set(remotePlayerId, timer);
        }
      };

      return { pc };
    },
    [socket]
  );

  const connectToPeer = useCallback(
    async (remotePlayerId, remotePlayerName) => {
      if (!socket?.connected || playerId == null || remotePlayerId === playerId)
        return;
      if (peersRef.current.has(remotePlayerId)) return;

      const { pc } = createPeerConnection(remotePlayerId, remotePlayerName);
      peersRef.current.set(remotePlayerId, { pc });

      const stream = await getLocalStream(!isMuted, !isVideoOff);
      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }

      const weInitiate = playerId < remotePlayerId;
      if (weInitiate) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('voice-offer', {
            targetPlayerId: remotePlayerId,
            offer: pc.localDescription,
          });
        } catch (err) {
          console.error('[Voice] Create offer failed:', err);
          closePeer(remotePlayerId);
        }
      }

      const pending = pendingCandidatesRef.current.get(remotePlayerId);
      if (pending?.length) {
        for (const c of pending) {
          try {
            await pc.addIceCandidate(c);
          } catch (_) {}
        }
        pendingCandidatesRef.current.delete(remotePlayerId);
      }
    },
    [socket, playerId, isMuted, isVideoOff, getLocalStream, createPeerConnection]
  );

  const closePeer = useCallback((remotePlayerId) => {
    clearReconnectTimer(remotePlayerId);
    const entry = peersRef.current.get(remotePlayerId);
    if (entry) {
      entry.pc.close();
      peersRef.current.delete(remotePlayerId);
    }
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(remotePlayerId);
      return next;
    });
    pendingCandidatesRef.current.delete(remotePlayerId);
  }, [clearReconnectTimer]);

  const closeAllPeers = useCallback(() => {
    peersRef.current.forEach((_, id) => closePeer(id));
  }, [closePeer]);

  useEffect(() => {
    if (!enabled || !socket || roomId == null || playerId == null || !players?.length) {
      closeAllPeers();
      if (!enabled && localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        setLocalStream(null);
      }
      return;
    }

    const otherIds = players.filter((p) => p.id !== playerId).map((p) => p.id);
    const currentPeerIds = [...peersRef.current.keys()];

    for (const id of currentPeerIds) {
      if (!otherIds.includes(id)) closePeer(id);
    }
    for (const id of otherIds) {
      if (!peersRef.current.has(id) && playerId < id) {
        const p = players.find((x) => x.id === id);
        connectToPeer(id, p?.name ?? `Player ${id}`);
      }
    }
  }, [enabled, socket, roomId, playerId, players, connectToPeer, closePeer, closeAllPeers]);

  useEffect(() => {
    if (!socket || !enabled || playerId == null) return;

    const onSocketDisconnect = () => {
      closeAllPeers();
    };

    const onSocketConnect = () => {
      const others = players?.filter((p) => p.id !== playerId) || [];
      others.forEach((p) => {
        if (!peersRef.current.has(p.id) && playerId < p.id) {
          connectToPeer(p.id, p.name ?? `Player ${p.id}`);
        }
      });
    };

    socket.on('disconnect', onSocketDisconnect);
    socket.on('connect', onSocketConnect);

    return () => {
      socket.off('disconnect', onSocketDisconnect);
      socket.off('connect', onSocketConnect);
    };
  }, [socket, enabled, playerId, players, connectToPeer, closeAllPeers]);

  useEffect(() => {
    if (!socket || !enabled) return;

    const onOffer = async ({ fromPlayerId, offer }) => {
      if (fromPlayerId === playerId) return;

      const existing = peersRef.current.get(fromPlayerId);
      if (existing) {
        try {
          await existing.pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await existing.pc.createAnswer();
          await existing.pc.setLocalDescription(answer);
          socket.emit('voice-answer', {
            targetPlayerId: fromPlayerId,
            answer: existing.pc.localDescription,
          });
        } catch (err) {
          console.error('[Voice] Renegotiation failed:', err);
        }
        return;
      }

      const fromPlayer = players?.find((p) => p.id === fromPlayerId);
      const { pc } = createPeerConnection(
        fromPlayerId,
        fromPlayer?.name ?? `Player ${fromPlayerId}`
      );
      peersRef.current.set(fromPlayerId, { pc });

      const stream = await getLocalStream(!isMuted, !isVideoOff);
      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('voice-answer', {
          targetPlayerId: fromPlayerId,
          answer: pc.localDescription,
        });
      } catch (err) {
        console.error('[Voice] Handle offer failed:', err);
        closePeer(fromPlayerId);
      }

      const pending = pendingCandidatesRef.current.get(fromPlayerId);
      if (pending?.length) {
        for (const c of pending) {
          try {
            await pc.addIceCandidate(c);
          } catch (_) {}
        }
        pendingCandidatesRef.current.delete(fromPlayerId);
      }
    };

    const onAnswer = async ({ fromPlayerId, answer }) => {
      const entry = peersRef.current.get(fromPlayerId);
      if (!entry) return;
      try {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error('[Voice] Set remote description failed:', err);
      }
    };

    const onIceCandidate = async ({ fromPlayerId, candidate }) => {
      const entry = peersRef.current.get(fromPlayerId);
      if (entry) {
        try {
          await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (_) {}
      } else {
        const pending = pendingCandidatesRef.current.get(fromPlayerId) || [];
        pending.push(candidate);
        pendingCandidatesRef.current.set(fromPlayerId, pending);
      }
    };

    socket.on('voice-offer', onOffer);
    socket.on('voice-answer', onAnswer);
    socket.on('voice-ice-candidate', onIceCandidate);

    return () => {
      socket.off('voice-offer', onOffer);
      socket.off('voice-answer', onAnswer);
      socket.off('voice-ice-candidate', onIceCandidate);
    };
  }, [socket, enabled, playerId, players, isMuted, isVideoOff, getLocalStream, createPeerConnection, closePeer]);

  const toggleMute = useCallback(() => {
    setIsMuted((m) => {
      const next = !m;
      getLocalStream(!next, !isVideoOff);
      return next;
    });
  }, [getLocalStream, isVideoOff]);

  const toggleVideo = useCallback(() => {
    setIsVideoOff((v) => {
      const next = !v;
      getLocalStream(!isMuted, !next);
      return next;
    });
  }, [getLocalStream, isMuted]);

  const cleanup = useCallback(() => {
    closeAllPeers();
    reconnectTimersRef.current.forEach((timer) => clearTimeout(timer));
    reconnectTimersRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
  }, [closeAllPeers]);

  return {
    isMuted,
    toggleMute,
    isVideoOff,
    toggleVideo,
    micError,
    localStream,
    remoteStreams,
    cleanup,
  };
}
