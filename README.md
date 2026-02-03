# Coup - Multiplayer Card Game

A beautifully designed, real-time multiplayer web implementation of the classic Coup card game.

## Features

- 🎮 Real-time multiplayer gameplay (3-6 players)
- 🎨 Beautiful, modern UI with smooth animations
- 🔄 WebSocket-based real-time synchronization
- 🎯 Full game logic implementation:
  - All character abilities (Duke, Assassin, Captain, Ambassador, Contessa)
  - Challenge and blocking mechanics
  - Turn-based gameplay
  - Card reveal animations
- 📱 Responsive design

## Game Rules

**Objective:** Be the last player standing by eliminating all other players' influence cards.

**Setup:** Each player starts with 2 face-down character cards and 2 coins.

**Actions:**
- **Income:** Take 1 coin (cannot be challenged)
- **Foreign Aid:** Take 2 coins (can be blocked by Duke)
- **Coup:** Pay 7 coins to force a player to lose an influence (mandatory if you have 10+ coins)
- **Character Actions:** Claim to have a character to use their ability (can be challenged)

**Characters:**
- **Duke:** Take 3 coins; blocks Foreign Aid
- **Assassin:** Pay 3 coins to assassinate (blocked by Contessa)
- **Captain:** Steal 2 coins (blocked by Captain)
- **Ambassador:** Exchange cards with the deck
- **Contessa:** Blocks assassination attempts

**Challenges:** Any player can challenge an action. If challenged and you don't have the claimed card, you lose an influence. If you do have it, the challenger loses an influence.

## Installation

1. Install dependencies:
```bash
npm install
```

## Running the Game

1. Start both the server and client:
```bash
npm run dev
```

This will start:
- Backend server on `http://localhost:3001`
- Frontend development server on `http://localhost:3000`

2. Open `http://localhost:3000` in your browser

3. Create a room or join an existing one using the room code

4. Once 3+ players join, the host can start the game

## How to Play

1. **Create/Join Room:** Enter your name and either create a new room or join with a room code
2. **Wait for Players:** Need at least 3 players to start
3. **Start Game:** Host clicks "Start Game" when ready
4. **Take Actions:** On your turn, select an action and target (if needed)
5. **Challenge/Block:** Other players can challenge your claims or block actions
6. **Survive:** Be the last player with influence cards remaining!

## Project Structure

```
coup/
├── server/
│   ├── index.js      # Express server with Socket.io
│   └── game.js       # Game logic and state management
├── src/
│   ├── components/   # React components
│   │   ├── Lobby.jsx
│   │   ├── GameBoard.jsx
│   │   ├── PlayerArea.jsx
│   │   ├── ActionPanel.jsx
│   │   └── Card.jsx
│   ├── App.jsx       # Main app component
│   └── main.jsx      # Entry point
└── package.json
```

## Technologies

- **Frontend:** React, Vite
- **Backend:** Node.js, Express
- **Real-time:** Socket.io
- **Styling:** CSS3 with CSS Variables

Enjoy playing Coup! 🎲
