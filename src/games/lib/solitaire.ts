/**
 * Klondike solitaire rules — pure state + transitions, so the deal, the move
 * legality and the win condition can be tested without a browser.
 */

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Card = { rank: number; suit: Suit; face: boolean };

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

export type Pile =
  /** 7 tableau columns. */
  | { kind: 'tableau'; index: number }
  /** 4 foundations, one per suit index. */
  | { kind: 'foundation'; index: number }
  /** The stock (face down) and the waste (face up). */
  | { kind: 'stock' }
  | { kind: 'waste' };

export type SolitaireState = {
  tableau: Card[][];
  foundations: Card[][];
  stock: Card[];
  waste: Card[];
  score: number;
  moves: number;
};

export function isRed(suit: Suit): boolean {
  return suit === 'H' || suit === 'D';
}

export function createDeck(rng: () => number = Math.random): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank += 1) deck.push({ rank, suit, face: false });
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function deal(deck: Card[]): SolitaireState {
  const cards = deck.map((card) => ({ ...card, face: false }));
  const tableau: Card[][] = [];
  let cursor = 0;
  for (let column = 0; column < 7; column += 1) {
    const pile: Card[] = [];
    for (let row = 0; row <= column; row += 1) {
      const card = cards[cursor];
      cursor += 1;
      pile.push({ ...card, face: row === column });
    }
    tableau.push(pile);
  }
  return {
    tableau,
    foundations: [[], [], [], []],
    stock: cards.slice(cursor),
    waste: [],
    score: 0,
    moves: 0,
  };
}

export function columnOf(state: SolitaireState, pile: Pile): Card[] | null {
  if (pile.kind === 'tableau') return state.tableau[pile.index];
  if (pile.kind === 'foundation') return state.foundations[pile.index];
  if (pile.kind === 'waste') return state.waste;
  return null;
}

/** A tableau run must be descending and alternate colours. */
export function tableauRun(pile: Card[], from: number): boolean {
  if (from < 0 || from >= pile.length) return false;
  if (!pile[from].face) return false;
  for (let i = from; i < pile.length - 1; i += 1) {
    const a = pile[i];
    const b = pile[i + 1];
    if (a.rank !== b.rank + 1) return false;
    if (isRed(a.suit) === isRed(b.suit)) return false;
  }
  return true;
}

export function canDropTableau(card: Card, column: Card[]): boolean {
  if (!column.length) return card.rank === 13;
  const top = column[column.length - 1];
  return top.face && top.rank === card.rank + 1 && isRed(top.suit) !== isRed(card.suit);
}

export function canDropFoundation(card: Card, foundation: Card[]): boolean {
  if (!foundation.length) return card.rank === 1;
  const top = foundation[foundation.length - 1];
  return top.suit === card.suit && top.rank === card.rank - 1;
}

/**
 * Moves `count` cards from the end of `pile` to a target. Only the legal
 * combinations are allowed, so an illegal drag simply does not change state.
 */
export function moveCards(state: SolitaireState, from: Pile, count: number, to: Pile): SolitaireState {
  if (count <= 0) return state;
  if (from.kind === 'stock') return state;
  if (to.kind === 'stock' || to.kind === 'waste') return state;

  const source = columnOf(state, from);
  if (!source || source.length < count) return state;
  const start = source.length - count;

  if (from.kind === 'tableau' && !tableauRun(source, start)) return state;
  if (from.kind === 'waste' && count !== 1) return state;
  if (from.kind === 'foundation' && count !== 1) return state;
  if (from.kind === 'tableau' && to.kind === 'tableau' && from.index === to.index) return state;

  const moving = source.slice(start);
  const card = moving[0];

  const next: SolitaireState = {
    ...state,
    tableau: state.tableau.map((pile) => [...pile]),
    foundations: state.foundations.map((pile) => [...pile]),
    waste: [...state.waste],
    score: state.score,
    moves: state.moves + 1,
  };
  const nextSource = columnOf(next, from)!;
  const target = columnOf(next, to)!;

  if (to.kind === 'tableau' && !canDropTableau(card, target)) return state;
  if (to.kind === 'foundation') {
    if (!canDropFoundation(card, target)) return state;
    if (from.kind !== 'tableau' && count !== 1) return state;
  }

  nextSource.splice(start, count);
  target.push(...moving);
  if (from.kind === 'tableau' && nextSource.length) {
    nextSource[nextSource.length - 1].face = true;
  }
  if (to.kind === 'foundation') next.score += 10;
  if (from.kind === 'foundation' && to.kind === 'tableau') next.score -= 10;
  return next;
}

/** Draws one card from the stock to the waste, flipping the stock when empty. */
export function drawCard(state: SolitaireState): SolitaireState {
  const next: SolitaireState = { ...state, stock: [...state.stock], waste: [...state.waste], moves: state.moves + 1 };
  if (!next.stock.length) {
    if (!next.waste.length) return state;
    next.stock = next.waste
      .slice()
      .reverse()
      .map((card) => ({ ...card, face: false }));
    next.waste = [];
    next.score = Math.max(0, next.score - 20);
    return next;
  }
  const card = next.stock.pop()!;
  next.waste.push({ ...card, face: true });
  return next;
}

export function topOf(pile: Card[]): Card | null {
  return pile.length ? pile[pile.length - 1] : null;
}

export function foundationSuit(index: number): Suit {
  return SUITS[index];
}

export function won(state: SolitaireState): boolean {
  return state.foundations.every((pile) => pile.length === 13);
}
