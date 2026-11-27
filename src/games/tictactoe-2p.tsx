import { useEffect, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';

type Mark = 'X' | 'O';
type Cell = Mark | null;

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function getWinner(board: Cell[]): { mark: Mark; line: number[] } | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { mark: board[a] as Mark, line };
  }
  return null;
}

export default function TicTacToe2P({ session, game }: GameProps) {
  const [board, setBoard] = useState<Cell[]>(Array<Cell>(9).fill(null));
  const [turn, setTurn] = useState<Mark>('X');
  const [wins, setWins] = useState({ X: 0, O: 0 });
  const [message, setMessage] = useState('X beginnt. Klickt abwechselnd ein Feld.');
  const [winLine, setWinLine] = useState<number[]>([]);
  const [roundOver, setRoundOver] = useState(false);

  function newRound() {
    setBoard(Array<Cell>(9).fill(null));
    setTurn('X');
    setWinLine([]);
    setRoundOver(false);
    setMessage('Neue Runde – X beginnt.');
  }

  useEffect(() => {
    setWins({ X: 0, O: 0 });
    newRound();
    setMessage('X beginnt. Klickt abwechselnd ein Feld.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  function play(index: number) {
    if (session.status !== 'playing' || board[index] || roundOver) return;
    const next = [...board];
    next[index] = turn;
    setBoard(next);
    sfx.pick();

    const winner = getWinner(next);
    if (winner) {
      const scores = { ...wins, [winner.mark]: wins[winner.mark] + 1 };
      setWins(scores);
      setWinLine(winner.line);
      setRoundOver(true);
      sfx.win();
      if (scores[winner.mark] >= 3) {
        setMessage(`${winner.mark} gewinnt das Match mit 3 Runden!`);
        window.setTimeout(() => session.finish(0, `Spieler ${winner.mark} gewinnt das Match`), 700);
      } else {
        setMessage(`Runde an ${winner.mark}! Zwischenstand ${scores.X}:${scores.O}`);
        window.setTimeout(newRound, 1500);
      }
      return;
    }

    if (next.every(Boolean)) {
      setRoundOver(true);
      setMessage('Unentschieden – neue Runde.');
      window.setTimeout(newRound, 1400);
      return;
    }
    setTurn(turn === 'X' ? 'O' : 'X');
  }

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus" style={{ color: '#38bdf8' }}>X <b>{wins.X}</b></span>
          <span className="gstatus" style={{ color: '#f472b6' }}>O <b>{wins.O}</b></span>
          <span className={`gstatus ${turn === 'X' ? 'is-turn' : ''}`}>{turn} am Zug</span>
        </>
      }
    >
      <div className="game-wrap">
        <div className="board-wrap">
          <div className="board square ttt-board">
            {board.map((cell, index) => (
              <button
                key={index}
                type="button"
                className={`ttt-cell ${cell ? `is-${cell.toLowerCase()}` : ''} ${winLine.includes(index) ? 'is-win' : ''}`}
                onClick={() => play(index)}
                aria-label={`Feld ${index + 1}`}
              >
                {cell}
              </button>
            ))}
          </div>
        </div>
        <div className="game-toolbar">
          <button type="button" className="gbtn" onClick={newRound}>
            Neue Runde
          </button>
        </div>
        <p className="game-hint">{message} Best of five – wer zuerst drei Runden holt, gewinnt.</p>
      </div>
    </GameStage>
  );
}
