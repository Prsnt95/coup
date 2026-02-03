const CHARACTERS = ['Duke', 'Assassin', 'Captain', 'Ambassador', 'Contessa'];
const DECK_SIZE = 15; // 3 of each character

export class Game {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = [];
    this.deck = [];
    this.treasury = 50;
    this.currentPlayerIndex = 0;
    this.phase = 'waiting'; // waiting, playing, action-pending, challenge-pending, block-pending
    this.pendingAction = null;
    this.hostId = null;
    this.winner = null;
    this.shuffleDeck();
  }

  shuffleDeck() {
    this.deck = [];
    for (let i = 0; i < CHARACTERS.length; i++) {
      for (let j = 0; j < 3; j++) {
        this.deck.push(CHARACTERS[i]);
      }
    }
    // Fisher-Yates shuffle
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  addPlayer(name, socketId) {
    const playerId = this.players.length;
    const cards = [this.deck.pop(), this.deck.pop()];
    const player = {
      id: playerId,
      name,
      socketId,
      coins: 2,
      cards: cards.map((card) => ({ character: card, revealed: false })),
      eliminated: false,
    };
    this.players.push(player);
    if (this.hostId === null) {
      this.hostId = playerId;
    }
    return playerId;
  }

  removePlayer(playerId) {
    this.players = this.players.filter((p) => p.id !== playerId);
    if (this.hostId === playerId && this.players.length > 0) {
      this.hostId = this.players[0].id;
    }
  }

  getHostId() {
    return this.hostId;
  }

  getPlayers() {
    return this.players;
  }

  isFull() {
    return this.players.length >= 6;
  }

  start() {
    if (this.players.length < 3) return false;
    this.phase = 'playing';
    this.currentPlayerIndex = 0;
    return true;
  }

  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  getPlayer(playerId) {
    return this.players.find((p) => p.id === playerId);
  }

  performAction(playerId, action, targetId = null, character = null) {
    if (this.phase !== 'playing') {
      return { error: 'Game not in playing phase' };
    }

    const player = this.getPlayer(playerId);
    if (!player || player.eliminated) {
      return { error: 'Invalid player' };
    }

    if (player.id !== this.getCurrentPlayer().id) {
      return { error: 'Not your turn' };
    }

    // Handle mandatory coup
    if (player.coins >= 10 && action !== 'coup') {
      return { error: 'You must perform a Coup (you have 10+ coins)' };
    }

    switch (action) {
      case 'income':
        player.coins += 1;
        this.nextTurn();
        return { success: true };

      case 'foreign-aid':
        this.pendingAction = { type: 'foreign-aid', playerId, targetId: null };
        this.phase = 'block-pending';
        return { success: true, requiresBlock: true };

      case 'coup':
        if (player.coins < 7) {
          return { error: 'Not enough coins for Coup' };
        }
        if (!targetId && targetId !== 0) {
          return { error: 'Must specify target for Coup' };
        }
        const target = this.getPlayer(targetId);
        if (!target || target.eliminated) {
          return { error: 'Invalid target' };
        }
        player.coins -= 7;
        this.pendingAction = { type: 'coup', playerId, targetId };
        this.phase = 'choose-card';
        return { success: true, requiresCardChoice: true, targetId };

      case 'duke':
        this.pendingAction = { type: 'duke', playerId, character: 'Duke' };
        this.phase = 'challenge-pending';
        return { success: true, requiresChallenge: true };

      case 'assassin':
        if (player.coins < 3) {
          return { error: 'Not enough coins for Assassin' };
        }
        if (!targetId && targetId !== 0) {
          return { error: 'Must specify target for Assassin' };
        }
        const assassinTarget = this.getPlayer(targetId);
        if (!assassinTarget || assassinTarget.eliminated) {
          return { error: 'Invalid target' };
        }
        player.coins -= 3;
        this.pendingAction = {
          type: 'assassin',
          playerId,
          targetId,
          character: 'Assassin',
        };
        this.phase = 'challenge-pending';
        return { success: true, requiresChallenge: true };

      case 'captain':
        if (!targetId && targetId !== 0) {
          return { error: 'Must specify target for Captain' };
        }
        const captainTarget = this.getPlayer(targetId);
        if (!captainTarget || captainTarget.eliminated) {
          return { error: 'Invalid target' };
        }
        this.pendingAction = {
          type: 'captain',
          playerId,
          targetId,
          character: 'Captain',
        };
        this.phase = 'challenge-pending';
        return { success: true, requiresChallenge: true };

      case 'ambassador':
        this.pendingAction = {
          type: 'ambassador',
          playerId,
          character: 'Ambassador',
        };
        this.phase = 'challenge-pending';
        return { success: true, requiresChallenge: true };

      default:
        return { error: 'Invalid action' };
    }
  }

  challenge(challengerId, targetId, character) {
    if (this.phase !== 'challenge-pending') {
      return { error: 'No pending challenge' };
    }

    const challenger = this.getPlayer(challengerId);
    const target = this.getPlayer(targetId);

    if (!challenger || !target) {
      return { error: 'Invalid player' };
    }

    if (challenger.id === target.id) {
      return { error: 'Cannot challenge yourself' };
    }

    const action = this.pendingAction;

    // Handle challenge to action or block
    let challengedPlayer, challengedCharacter;
    if (action.blockerId && action.blockerId === targetId) {
      // Challenging a block
      challengedPlayer = target;
      challengedCharacter = action.blockCharacter;
    } else if (action.playerId === targetId) {
      // Challenging an action
      challengedPlayer = target;
      challengedCharacter = action.character;
    } else {
      return { error: 'Invalid challenge target' };
    }

    // Check if challenged player has the claimed character
    const hasCharacter = challengedPlayer.cards.some(
      (card) => !card.revealed && card.character === challengedCharacter
    );

    if (hasCharacter) {
      // Challenger loses influence
      this.phase = 'choose-card';
      this.pendingAction = {
        ...action,
        challengerId,
        challengeResult: 'failed',
        challengedPlayerId: challengedPlayer.id,
      };
      return {
        success: true,
        requiresCardChoice: true,
        playerId: challengerId,
      };
    } else {
      // Challenged player loses influence
      this.phase = 'choose-card';
      this.pendingAction = {
        ...action,
        challengerId,
        challengeResult: 'success',
        challengedPlayerId: challengedPlayer.id,
      };
      return {
        success: true,
        requiresCardChoice: true,
        playerId: challengedPlayer.id,
      };
    }
  }

  block(blockerId, targetId, character) {
    if (this.phase !== 'block-pending') {
      return { error: 'No pending block' };
    }

    const blocker = this.getPlayer(blockerId);
    const target = this.getPlayer(targetId);

    if (!blocker || !target) {
      return { error: 'Invalid player' };
    }

    const action = this.pendingAction;

    // Check if blocking is valid
    if (action.type === 'foreign-aid' && character !== 'Duke') {
      return { error: 'Only Duke can block Foreign Aid' };
    }
    if (action.type === 'assassin' && character !== 'Contessa') {
      return { error: 'Only Contessa can block Assassin' };
    }
    if (action.type === 'captain' && character !== 'Captain') {
      return { error: 'Only Captain can block Captain' };
    }

    // Block can be challenged
    this.pendingAction = { ...action, blockerId, blockCharacter: character };
    this.phase = 'challenge-pending';
    return { success: true, requiresChallenge: true };
  }

  chooseCard(playerId, cardIndex) {
    const player = this.getPlayer(playerId);
    if (!player) {
      return { error: 'Invalid player' };
    }

    if (this.phase === 'choose-card') {
      const card = player.cards[cardIndex];
      if (!card || card.revealed) {
        return { error: 'Invalid card' };
      }

      card.revealed = true;
      this.deck.push(card.character);
      this.shuffleDeck();

      // Check if player is eliminated
      const activeCards = player.cards.filter((c) => !c.revealed);
      if (activeCards.length === 0) {
        player.eliminated = true;
        this.checkGameEnd();
      }

      // Handle action completion
      const action = this.pendingAction;

      if (action.challengeResult === 'failed') {
        // Challenger lost
        if (action.blockerId) {
          // Block was successfully challenged, block fails, action proceeds
          const originalAction = { ...action };
          delete originalAction.blockerId;
          delete originalAction.blockCharacter;
          delete originalAction.challengerId;
          delete originalAction.challengeResult;
          delete originalAction.challengedPlayerId;
          this.pendingAction = originalAction;
          if (originalAction.type === 'foreign-aid') {
            this.phase = 'block-pending';
          } else {
            this.completeAction();
          }
        } else {
          // Action challenge failed, action proceeds
          this.completeAction();
        }
      } else if (action.challengeResult === 'success') {
        // Challenged player lost
        if (
          action.blockerId &&
          action.challengedPlayerId === action.blockerId
        ) {
          // Block was successfully challenged, block fails
          const originalAction = { ...action };
          delete originalAction.blockerId;
          delete originalAction.blockCharacter;
          delete originalAction.challengerId;
          delete originalAction.challengeResult;
          delete originalAction.challengedPlayerId;
          this.pendingAction = originalAction;
          if (originalAction.type === 'foreign-aid') {
            this.phase = 'block-pending';
          } else {
            this.completeAction();
          }
        } else if (!action.blockerId) {
          // Action was successfully challenged, action fails
          this.pendingAction = null;
          this.phase = 'playing';
          this.nextTurn();
        } else {
          // Block challenge failed, block succeeds
          this.completeAction();
        }
      } else if (action.type === 'coup') {
        // Coup completed
        this.pendingAction = null;
        this.phase = 'playing';
        this.nextTurn();
      } else if (action.type === 'assassination') {
        // Assassination completed
        this.pendingAction = null;
        this.phase = 'playing';
        this.nextTurn();
      } else {
        // Ambassador card swap
        if (action.type === 'ambassador') {
          this.handleAmbassador(player);
        } else {
          this.completeAction();
        }
      }

      return { success: true };
    }

    return { error: 'Invalid phase for card choice' };
  }

  handleAmbassador(player) {
    // Draw 2 cards
    const drawnCards = [this.deck.pop(), this.deck.pop()];
    const currentCards = player.cards.filter((c) => !c.revealed);

    // Player chooses which cards to keep
    // For simplicity, we'll let them keep their current cards
    // In a full implementation, you'd need a UI for card selection
    this.deck.push(...drawnCards);
    this.shuffleDeck();

    this.completeAction();
  }

  completeAction() {
    const action = this.pendingAction;
    if (!action) return;

    const player = this.getPlayer(action.playerId);

    switch (action.type) {
      case 'foreign-aid':
        if (action.blockerId && !action.challengeResult) {
          // Block was successful (not challenged or challenge failed)
          this.pendingAction = null;
          this.phase = 'playing';
          this.nextTurn();
        } else {
          // No block or block was successfully challenged
          player.coins += 2;
          this.pendingAction = null;
          this.phase = 'playing';
          this.nextTurn();
        }
        break;

      case 'duke':
        player.coins += 3;
        this.pendingAction = null;
        this.phase = 'playing';
        this.nextTurn();
        break;

      case 'assassin':
        if (action.blockerId && !action.challengeResult) {
          // Block was successful
          this.pendingAction = null;
          this.phase = 'playing';
          this.nextTurn();
        } else {
          // Assassination proceeds
          const target = this.getPlayer(action.targetId);
          this.pendingAction = {
            type: 'assassination',
            targetId: action.targetId,
          };
          this.phase = 'choose-card';
        }
        break;

      case 'captain':
        if (action.blockerId && !action.challengeResult) {
          // Block was successful
          this.pendingAction = null;
          this.phase = 'playing';
          this.nextTurn();
        } else {
          const target = this.getPlayer(action.targetId);
          const stolen = Math.min(2, target.coins);
          target.coins -= stolen;
          player.coins += stolen;
          this.pendingAction = null;
          this.phase = 'playing';
          this.nextTurn();
        }
        break;

      case 'ambassador':
        // Already handled
        break;
    }
  }

  nextTurn() {
    do {
      this.currentPlayerIndex =
        (this.currentPlayerIndex + 1) % this.players.length;
    } while (this.getCurrentPlayer().eliminated);

    this.checkGameEnd();
  }

  pass(playerId) {
    if (this.phase === 'challenge-pending') {
      // No one challenged, action proceeds
      if (this.pendingAction.blockerId) {
        // Block was not challenged, block succeeds
        this.completeAction();
      } else {
        // Action was not challenged, action proceeds
        this.completeAction();
      }
      return { success: true };
    } else if (this.phase === 'block-pending') {
      // No one blocked, action proceeds
      this.completeAction();
      return { success: true };
    }
    return { error: 'Cannot pass in current phase' };
  }

  checkGameEnd() {
    const activePlayers = this.players.filter((p) => !p.eliminated);
    if (activePlayers.length === 1) {
      this.winner = activePlayers[0];
      this.phase = 'finished';
    }
  }

  getPublicState(playerId = null) {
    return {
      roomId: this.roomId,
      phase: this.phase,
      currentPlayerIndex: this.currentPlayerIndex,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        coins: p.coins,
        cards: p.cards.map((c) => ({
          // Show actual character to the player who owns the cards, or if revealed
          character:
            c.revealed || (playerId !== null && p.id === playerId)
              ? c.character
              : 'Hidden',
          revealed: c.revealed,
        })),
        cardCount: p.cards.filter((c) => !c.revealed).length,
        eliminated: p.eliminated,
      })),
      pendingAction: this.pendingAction,
      treasury: this.treasury,
      deckSize: this.deck.length,
      winner: this.winner
        ? {
            id: this.winner.id,
            name: this.winner.name,
          }
        : null,
      hostId: this.hostId,
    };
  }
}
