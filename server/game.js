const CHARACTERS = ['Duke', 'Assassin', 'Captain', 'Ambassador', 'Contessa'];
const DECK_SIZE = 15; // 3 of each character

export class Game {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = [];
    this.deck = [];
    this.treasury = 50;
    this.currentPlayerIndex = 0;
    this.phase =
      'waiting'; // waiting, playing, action-pending, challenge-pending, block-pending, ambassador-exchange
    this.pendingAction = null;
    this.responseState = null;
    this.logs = [];
    this.logSeq = 0;
    this.hostId = null;
    this.winner = null;
    this.initializeDeck();
  }

  initializeDeck() {
    this.deck = [];
    for (let i = 0; i < CHARACTERS.length; i++) {
      for (let j = 0; j < 3; j++) {
        this.deck.push(CHARACTERS[i]);
      }
    }
    this.shuffleDeck();
  }

  shuffleDeck() {
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
    if (this.players.length < 2) return false;
    this.phase = 'playing';
    this.currentPlayerIndex = 0;
    this.logEvent({
      message: `Game started with ${this.players.length} players.`,
      kind: 'system',
      players: this.players.map((p) => p.id),
    });
    return true;
  }

  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  getPlayer(playerId) {
    return this.players.find((p) => p.id === playerId);
  }

  getPlayerName(playerId) {
    const player = this.getPlayer(playerId);
    return player ? player.name : 'Unknown';
  }

  logEvent({ message, kind = 'info', outcome = null, players = [] }) {
    const entry = {
      id: ++this.logSeq,
      message,
      kind,
      outcome,
      players,
      ts: Date.now(),
    };
    this.logs.push(entry);
    if (this.logs.length > 40) {
      this.logs.shift();
    }
    console.log(`[${this.roomId}] ${message}`);
  }

  getActivePlayers() {
    return this.players.filter((p) => !p.eliminated);
  }

  getEligibleChallengers(action) {
    if (!action) return [];
    const challengedId =
      action.blockerId !== undefined && action.blockerId !== null
        ? action.blockerId
        : action.playerId;
    return this.players
      .filter((p) => !p.eliminated && p.id !== challengedId)
      .map((p) => p.id);
  }

  getEligibleBlockers(action) {
    if (!action) return [];
    if (action.type === 'foreign-aid') {
      return this.players
        .filter((p) => !p.eliminated && p.id !== action.playerId)
        .map((p) => p.id);
    }
    if (action.type === 'assassin' || action.type === 'captain') {
      const target = this.getPlayer(action.targetId);
      if (!target || target.eliminated) return [];
      return [target.id];
    }
    return [];
  }

  startChallengePhase() {
    this.phase = 'challenge-pending';
    const eligible = this.getEligibleChallengers(this.pendingAction);
    if (eligible.length === 0) {
      this.responseState = null;
      this.resolveNoChallenge();
      return;
    }
    this.responseState = {
      type: 'challenge',
      eligible,
      passed: new Set(),
    };
  }

  startBlockPhase() {
    this.phase = 'block-pending';
    const eligible = this.getEligibleBlockers(this.pendingAction);
    if (eligible.length === 0) {
      this.responseState = null;
      this.resolveNoBlock();
      return;
    }
    this.responseState = {
      type: 'block',
      eligible,
      passed: new Set(),
    };
  }

  clearResponseState() {
    this.responseState = null;
  }

  stripChallengeFields(action) {
    if (!action) return null;
    const {
      blockerId,
      blockCharacter,
      challengerId,
      challengeResult,
      challengedPlayerId,
      challengedCharacter,
      challengeStage,
      ...rest
    } = action;
    return rest;
  }

  getRequiredCardChooser() {
    const action = this.pendingAction;
    if (!action || this.phase !== 'choose-card') return null;
    if (action.challengeStage === 'reveal') return action.challengedPlayerId;
    if (action.challengeResult === 'failed') return action.challengerId;
    if (action.type === 'coup' || action.type === 'assassination')
      return action.targetId;
    return null;
  }

  exchangeCardAtIndex(player, cardIndex) {
    if (!player) return;
    const card = player.cards[cardIndex];
    if (!card) return;
    const oldCard = card.character;
    this.deck.push(oldCard);
    this.shuffleDeck();
    const replacement = this.deck.pop();
    if (replacement) {
      player.cards[cardIndex] = { character: replacement, revealed: false };
    }
  }

  revealCardLoss(player, cardIndex) {
    const card = player.cards[cardIndex];
    if (!card || card.revealed) {
      return { error: 'Invalid card' };
    }

    card.revealed = true;
    this.logEvent({
      message: `${player.name} revealed ${card.character} and lost influence.`,
      kind: 'loss',
      outcome: 'lost',
      players: [player.id],
    });

    const activeCards = player.cards.filter((c) => !c.revealed);
    if (activeCards.length === 0) {
      player.eliminated = true;
      this.logEvent({
        message: `${player.name} has been eliminated.`,
        kind: 'loss',
        outcome: 'eliminated',
        players: [player.id],
      });
      this.checkGameEnd();
    }

    return { success: true };
  }

  resolveUnchallengedBlock() {
    const action = this.pendingAction;
    if (action && action.blockerId !== undefined && action.blockerId !== null) {
      const blockerName = this.getPlayerName(action.blockerId);
      const actorName = this.getPlayerName(action.playerId);
      const actionName =
        action.type === 'assassin'
          ? 'assassination'
          : action.type === 'captain'
            ? 'steal'
            : action.type === 'foreign-aid'
              ? 'foreign aid'
              : 'action';
      this.logEvent({
        message: `${blockerName}'s block stands. ${actorName}'s ${actionName} is canceled.`,
        kind: 'block',
        outcome: 'success',
        players: [action.blockerId, action.playerId, action.targetId].filter(
          (id) => id !== undefined && id !== null
        ),
      });
    }
    this.pendingAction = null;
    this.phase = 'playing';
    this.nextTurn();
  }

  resolveUnchallengedAction(action) {
    if (!action) return;
    const player = this.getPlayer(action.playerId);
    if (!player) return;

    switch (action.type) {
      case 'duke':
        player.coins += 3;
        this.logEvent({
          message: `No challenge. ${player.name} takes 3 coins (Duke).`,
          kind: 'action',
          outcome: 'success',
          players: [player.id],
        });
        this.pendingAction = null;
        this.phase = 'playing';
        this.nextTurn();
        break;

      case 'ambassador':
        this.logEvent({
          message: `No challenge. ${player.name} will exchange cards (Ambassador).`,
          kind: 'action',
          outcome: 'success',
          players: [player.id],
        });
        this.handleAmbassador(player);
        break;

      case 'assassin':
      case 'captain':
        this.pendingAction = action;
        this.startBlockPhase();
        break;

      default:
        this.pendingAction = null;
        this.phase = 'playing';
        this.nextTurn();
        break;
    }
  }

  resolveActionIgnoringBlocks(action) {
    if (!action) return;
    const player = this.getPlayer(action.playerId);

    switch (action.type) {
      case 'foreign-aid':
        if (player) {
          player.coins += 2;
          this.logEvent({
            message: `Foreign Aid succeeds. ${player.name} gains 2 coins.`,
            kind: 'action',
            outcome: 'success',
            players: [player.id],
          });
        }
        this.pendingAction = null;
        this.phase = 'playing';
        this.nextTurn();
        break;

      case 'assassin': {
        const target = this.getPlayer(action.targetId);
        if (!target || target.eliminated) {
          this.pendingAction = null;
          this.phase = 'playing';
          this.nextTurn();
          break;
        }
        this.logEvent({
          message: `Assassination succeeds. ${target.name} must lose influence.`,
          kind: 'action',
          outcome: 'success',
          players: [action.playerId, action.targetId],
        });
        this.pendingAction = {
          type: 'assassination',
          targetId: action.targetId,
        };
        this.phase = 'choose-card';
        break;
      }

      case 'captain': {
        const target = this.getPlayer(action.targetId);
        if (!target || target.eliminated) {
          this.pendingAction = null;
          this.phase = 'playing';
          this.nextTurn();
          break;
        }
        const stolen = Math.min(2, target.coins);
        target.coins -= stolen;
        if (player) {
          player.coins += stolen;
        }
        this.logEvent({
          message: `${player?.name || 'Unknown'} steals ${stolen} coin${stolen === 1 ? '' : 's'} from ${target.name}.`,
          kind: 'action',
          outcome: 'success',
          players: [action.playerId, action.targetId],
        });
        this.pendingAction = null;
        this.phase = 'playing';
        this.nextTurn();
        break;
      }

      default:
        this.pendingAction = null;
        this.phase = 'playing';
        this.nextTurn();
        break;
    }
  }

  resolveNoChallenge() {
    const action = this.pendingAction;
    if (!action) return;

    if (action.blockerId !== undefined && action.blockerId !== null) {
      this.resolveUnchallengedBlock();
      return;
    }

    const cleanAction = this.stripChallengeFields(action);
    this.pendingAction = cleanAction;
    this.resolveUnchallengedAction(cleanAction);
  }

  resolveNoBlock() {
    const action = this.pendingAction;
    if (!action) return;
    const cleanAction = this.stripChallengeFields(action);
    this.pendingAction = cleanAction;
    this.resolveActionIgnoringBlocks(cleanAction);
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

    this.clearResponseState();

    switch (action) {
      case 'income':
        player.coins += 1;
        this.logEvent({
          message: `${player.name} took Income (+1).`,
          kind: 'action',
          outcome: 'success',
          players: [player.id],
        });
        this.nextTurn();
        return { success: true };

      case 'foreign-aid':
        this.pendingAction = { type: 'foreign-aid', playerId, targetId: null };
        this.logEvent({
          message: `${player.name} is taking Foreign Aid (+2).`,
          kind: 'action',
          players: [player.id],
        });
        this.startBlockPhase();
        return { success: true, requiresBlock: true };

      case 'coup':
        if (player.coins < 7) {
          return { error: 'Not enough coins for Coup' };
        }
        if (!targetId && targetId !== 0) {
          return { error: 'Must specify target for Coup' };
        }
        if (targetId === playerId) {
          return { error: 'Cannot target yourself' };
        }
        const target = this.getPlayer(targetId);
        if (!target || target.eliminated) {
          return { error: 'Invalid target' };
        }
        player.coins -= 7;
        this.pendingAction = { type: 'coup', playerId, targetId };
        this.phase = 'choose-card';
        this.logEvent({
          message: `${player.name} launched a Coup against ${target.name}.`,
          kind: 'action',
          players: [player.id, target.id],
        });
        return { success: true, requiresCardChoice: true, targetId };

      case 'duke':
        this.pendingAction = { type: 'duke', playerId, character: 'Duke' };
        this.logEvent({
          message: `${player.name} claimed Duke (+3).`,
          kind: 'action',
          players: [player.id],
        });
        this.startChallengePhase();
        return { success: true, requiresChallenge: true };

      case 'assassin':
        if (player.coins < 3) {
          return { error: 'Not enough coins for Assassin' };
        }
        if (!targetId && targetId !== 0) {
          return { error: 'Must specify target for Assassin' };
        }
        if (targetId === playerId) {
          return { error: 'Cannot target yourself' };
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
        this.logEvent({
          message: `${player.name} attempted an assassination on ${assassinTarget.name}.`,
          kind: 'action',
          players: [player.id, assassinTarget.id],
        });
        this.startChallengePhase();
        return { success: true, requiresChallenge: true };

      case 'captain':
        if (!targetId && targetId !== 0) {
          return { error: 'Must specify target for Captain' };
        }
        if (targetId === playerId) {
          return { error: 'Cannot target yourself' };
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
        this.logEvent({
          message: `${player.name} attempted to steal from ${captainTarget.name}.`,
          kind: 'action',
          players: [player.id, captainTarget.id],
        });
        this.startChallengePhase();
        return { success: true, requiresChallenge: true };

      case 'ambassador':
        this.pendingAction = {
          type: 'ambassador',
          playerId,
          character: 'Ambassador',
        };
        this.logEvent({
          message: `${player.name} claimed Ambassador (exchange).`,
          kind: 'action',
          players: [player.id],
        });
        this.startChallengePhase();
        return { success: true, requiresChallenge: true };

      default:
        return { error: 'Invalid action' };
    }
  }

  challenge(challengerId, targetId, character) {
    if (this.phase !== 'challenge-pending') {
      return { error: 'No pending challenge' };
    }

    const action = this.pendingAction;
    if (!action) {
      return { error: 'No pending action' };
    }

    const challenger = this.getPlayer(challengerId);
    const target = this.getPlayer(targetId);

    if (!challenger || !target) {
      return { error: 'Invalid player' };
    }

    if (challenger.id === target.id) {
      return { error: 'Cannot challenge yourself' };
    }

    // Handle challenge to action or block
    let challengedPlayer, challengedCharacter;
    if (
      action.blockerId !== undefined &&
      action.blockerId !== null &&
      action.blockerId === targetId
    ) {
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

    const eligible =
      this.responseState?.type === 'challenge'
        ? this.responseState.eligible
        : this.getEligibleChallengers(action);
    if (!eligible.includes(challengerId)) {
      return { error: 'Not eligible to challenge' };
    }

    const challengeLabel = action.blockerId !== undefined && action.blockerId !== null
      ? `block (${challengedCharacter})`
      : challengedCharacter;
    this.logEvent({
      message: `${challenger.name} challenged ${challengedPlayer.name}'s ${challengeLabel}.`,
      kind: 'challenge',
      players: [challenger.id, challengedPlayer.id],
    });

    this.clearResponseState();

    this.phase = 'choose-card';
    this.pendingAction = {
      ...action,
      challengerId,
      challengedPlayerId: challengedPlayer.id,
      challengedCharacter,
      challengeStage: 'reveal',
    };
    return {
      success: true,
      requiresCardChoice: true,
      playerId: challengedPlayer.id,
    };
  }

  block(blockerId, targetId, character) {
    if (this.phase !== 'block-pending') {
      return { error: 'No pending block' };
    }

    const action = this.pendingAction;
    if (!action) {
      return { error: 'No pending action' };
    }

    const blocker = this.getPlayer(blockerId);
    if (!blocker) {
      return { error: 'Invalid player' };
    }

    const eligible = this.getEligibleBlockers(action);
    if (!eligible.includes(blockerId)) {
      return { error: 'You cannot block this action' };
    }

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
    const blockLabel =
      action.type === 'foreign-aid'
        ? 'Foreign Aid'
        : action.type === 'assassin'
          ? 'assassination'
          : action.type === 'captain'
            ? 'steal'
            : 'action';
    this.logEvent({
      message: `${blocker.name} blocked ${blockLabel} with ${character}.`,
      kind: 'block',
      players: [blockerId, action.playerId, action.targetId].filter(
        (id) => id !== undefined && id !== null
      ),
    });
    this.clearResponseState();
    this.pendingAction = { ...action, blockerId, blockCharacter: character };
    this.startChallengePhase();
    return { success: true, requiresChallenge: true };
  }

  chooseCard(playerId, cardIndex) {
    const player = this.getPlayer(playerId);
    if (!player) {
      return { error: 'Invalid player' };
    }

    if (this.phase !== 'choose-card') {
      return { error: 'Invalid phase for card choice' };
    }

    const requiredChooser = this.getRequiredCardChooser();
    if (requiredChooser !== playerId) {
      return { error: 'Not allowed to choose a card right now' };
    }

    const action = this.pendingAction;
    if (!action) {
      return { success: true };
    }

    if (action.challengeStage === 'reveal') {
      if (playerId !== action.challengedPlayerId) {
        return { error: 'Not allowed to reveal for this challenge' };
      }
      const card = player.cards[cardIndex];
      if (!card || card.revealed) {
        return { error: 'Invalid card' };
      }

      const claimed = action.challengedCharacter;
      if (card.character === claimed) {
        const challengerName = this.getPlayerName(action.challengerId);
        this.logEvent({
          message: `${player.name} revealed ${claimed}. Challenge failed — ${challengerName} loses influence.`,
          kind: 'challenge',
          outcome: 'lost',
          players: [action.challengerId],
        });
        // Exchange revealed card for a new one.
        this.exchangeCardAtIndex(player, cardIndex);

        this.pendingAction = {
          ...action,
          challengeResult: 'failed',
          challengeStage: 'loss',
        };
        return { success: true };
      }

      const lossResult = this.revealCardLoss(player, cardIndex);
      if (lossResult?.error) {
        return lossResult;
      }

      this.logEvent({
        message: `${player.name} did not reveal ${claimed}. Challenge succeeded — ${player.name} loses influence.`,
        kind: 'challenge',
        outcome: 'lost',
        players: [action.challengedPlayerId],
      });
      if (action.blockerId !== undefined && action.blockerId !== null) {
        const blockerName = this.getPlayerName(action.blockerId);
        this.logEvent({
          message: `${blockerName}'s block fails.`,
          kind: 'block',
          outcome: 'lost',
          players: [action.blockerId],
        });
      }

      if (action.blockerId !== undefined && action.blockerId !== null) {
        const cleanAction = this.stripChallengeFields(action);
        this.pendingAction = cleanAction;
        this.resolveActionIgnoringBlocks(cleanAction);
      } else {
        this.pendingAction = null;
        this.phase = 'playing';
        this.nextTurn();
      }
      return { success: true };
    }

    const card = player.cards[cardIndex];
    if (!card || card.revealed) {
      return { error: 'Invalid card' };
    }

    const lossResult = this.revealCardLoss(player, cardIndex);
    if (lossResult?.error) {
      return lossResult;
    }

    if (action.challengeResult === 'failed') {
      // Challenger lost: action or block stands
      if (action.blockerId !== undefined && action.blockerId !== null) {
        this.resolveUnchallengedBlock();
      } else {
        const cleanAction = this.stripChallengeFields(action);
        this.pendingAction = cleanAction;
        this.resolveUnchallengedAction(cleanAction);
      }
      return { success: true };
    }

    if (action.challengeResult === 'success') {
      if (action.blockerId !== undefined && action.blockerId !== null) {
        const cleanAction = this.stripChallengeFields(action);
        this.pendingAction = cleanAction;
        this.resolveActionIgnoringBlocks(cleanAction);
      } else {
        this.pendingAction = null;
        this.phase = 'playing';
        this.nextTurn();
      }
      return { success: true };
    }

    if (action.type === 'coup' || action.type === 'assassination') {
      this.pendingAction = null;
      this.phase = 'playing';
      this.nextTurn();
      return { success: true };
    }

    return { success: true };
  }

  handleAmbassador(player) {
    // Draw 2 cards
    const drawnCards = [];
    if (this.deck.length > 0) drawnCards.push(this.deck.pop());
    if (this.deck.length > 0) drawnCards.push(this.deck.pop());

    const activeIndexes = player.cards
      .map((card, index) => (!card.revealed ? index : null))
      .filter((index) => index !== null);

    const currentCards = activeIndexes.map((index) => player.cards[index].character);
    const pool = [...currentCards, ...drawnCards];

    const keepCount = activeIndexes.length;

    this.pendingAction = {
      type: 'ambassador-exchange',
      playerId: player.id,
      exchangeOptions: pool,
      currentCards,
      drawnCards,
      keepCount,
      activeIndexes,
    };
    this.phase = 'ambassador-exchange';
    this.logEvent({
      message: `${player.name} is choosing ${keepCount} card${keepCount === 1 ? '' : 's'} to keep.`,
      kind: 'action',
      players: [player.id],
    });
  }

  chooseAmbassador(playerId, selectedIndices) {
    if (this.phase !== 'ambassador-exchange') {
      return { error: 'No ambassador exchange in progress' };
    }

    const action = this.pendingAction;
    if (!action || action.type !== 'ambassador-exchange') {
      return { error: 'Invalid ambassador exchange state' };
    }

    if (action.playerId !== playerId) {
      return { error: 'Not your exchange' };
    }

    if (!Array.isArray(selectedIndices)) {
      return { error: 'Invalid selection' };
    }

    const keepCount = action.keepCount;
    if (selectedIndices.length !== keepCount) {
      return { error: `Must select ${keepCount} cards` };
    }

    const unique = new Set(selectedIndices);
    if (unique.size !== selectedIndices.length) {
      return { error: 'Duplicate card selection' };
    }

    const options = action.exchangeOptions || [];
    for (const index of selectedIndices) {
      if (typeof index !== 'number' || index < 0 || index >= options.length) {
        return { error: 'Invalid card selection' };
      }
    }

    const player = this.getPlayer(playerId);
    if (!player) {
      return { error: 'Invalid player' };
    }

    const selectedCards = selectedIndices.map((index) => options[index]);
    const remaining = options.filter((_, index) => !unique.has(index));

    const activeIndexes = action.activeIndexes || [];
    activeIndexes.forEach((index, i) => {
      player.cards[index] = { character: selectedCards[i], revealed: false };
    });

    this.deck.push(...remaining);
    this.shuffleDeck();

    this.logEvent({
      message: `${player.name} completed an Ambassador exchange.`,
      kind: 'action',
      outcome: 'success',
      players: [player.id],
    });

    this.pendingAction = null;
    this.phase = 'playing';
    this.nextTurn();
    return { success: true };
  }

  nextTurn() {
    do {
      this.currentPlayerIndex =
        (this.currentPlayerIndex + 1) % this.players.length;
    } while (this.getCurrentPlayer().eliminated);

    this.checkGameEnd();
  }

  pass(playerId) {
    const action = this.pendingAction;
    if (!action) {
      return { error: 'No pending action' };
    }

    const passer = this.getPlayer(playerId);
    if (!passer) {
      return { error: 'Invalid player' };
    }

    if (this.phase === 'challenge-pending') {
      if (!this.responseState || this.responseState.type !== 'challenge') {
        this.responseState = {
          type: 'challenge',
          eligible: this.getEligibleChallengers(action),
          passed: new Set(),
        };
      }

      const eligible = this.responseState.eligible;
      if (eligible.length === 0) {
        this.clearResponseState();
        this.resolveNoChallenge();
        return { success: true };
      }
      if (!eligible.includes(playerId)) {
        return { error: 'Not eligible to pass' };
      }
      if (this.responseState.passed.has(playerId)) {
        return { error: 'Already passed' };
      }

      this.responseState.passed.add(playerId);
      this.logEvent({
        message: `${passer.name} passed on the challenge.`,
        kind: 'pass',
        players: [playerId],
      });

      if (eligible.length === 0 || this.responseState.passed.size >= eligible.length) {
        this.clearResponseState();
        this.logEvent({
          message: 'No one challenged.',
          kind: 'challenge',
          players: eligible,
        });
        this.resolveNoChallenge();
      }

      return { success: true };
    }

    if (this.phase === 'block-pending') {
      if (!this.responseState || this.responseState.type !== 'block') {
        this.responseState = {
          type: 'block',
          eligible: this.getEligibleBlockers(action),
          passed: new Set(),
        };
      }

      const eligible = this.responseState.eligible;
      if (eligible.length === 0) {
        this.clearResponseState();
        this.resolveNoBlock();
        return { success: true };
      }
      if (!eligible.includes(playerId)) {
        return { error: 'Not eligible to pass' };
      }
      if (this.responseState.passed.has(playerId)) {
        return { error: 'Already passed' };
      }

      this.responseState.passed.add(playerId);
      this.logEvent({
        message: `${passer.name} passed on the block.`,
        kind: 'pass',
        players: [playerId],
      });

      if (eligible.length === 0 || this.responseState.passed.size >= eligible.length) {
        this.clearResponseState();
        this.logEvent({
          message: 'No one blocked.',
          kind: 'block',
          players: eligible,
        });
        this.resolveNoBlock();
      }

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
    let publicPendingAction = this.pendingAction;
    if (
      publicPendingAction &&
      publicPendingAction.type === 'ambassador-exchange' &&
      playerId !== publicPendingAction.playerId
    ) {
      publicPendingAction = {
        ...publicPendingAction,
        exchangeOptions: null,
        currentCards: null,
        drawnCards: null,
        activeIndexes: null,
      };
    }
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
      pendingAction: publicPendingAction,
      treasury: this.treasury,
      deckSize: this.deck.length,
      logs: this.logs,
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
