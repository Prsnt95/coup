Original prompt: why the the audio/video call not proper, it cuts off/freezes and never reopens.

also the video overlay sometimes blocks the action buttons.

- Investigating current voice/video lifecycle in `src/hooks/useVoiceChat.js` and UI layering in `src/components/PlayerArea.css`.
- Fixed reconnect lifecycle in `src/hooks/useVoiceChat.js`:
  - Added peer reconnect timers and teardown on `failed/closed/disconnected` states so stale peers are fully removed and can reconnect.
  - Added socket `connect`/`disconnect` listeners to rebuild peer links after signaling reconnect.
  - Cleared reconnect timers during cleanup.
- Reduced media renegotiation instability in `src/hooks/useVoiceChat.js`:
  - When enabling audio/video tracks again, now prefers `sender.replaceTrack(...)` before `addTrack(...)` to avoid duplicate senders after toggles.
- Fixed video overlay/button overlap in `src/components/VoiceChat.css`:
  - Video panel now opens above the call buttons (`position: absolute; bottom: 64px`) instead of pushing downward into action controls.
  - Added `pointer-events` scoping so only chat controls/panel capture clicks.
  - On small screens, moved the chat anchor to top-right to avoid covering bottom action buttons.
- Validation:
  - `npm run build` passes.
  - `ReadLints` reports no new linter issues in edited files.
- Follow-up request handled:
  - `src/components/VoiceChat.jsx` now renders hidden `<audio>` sinks for all remote streams at all times, so listening continues even when the video panel is collapsed.
  - `src/components/VoiceChat.css` adds a hidden container style for those persistent audio sinks.
