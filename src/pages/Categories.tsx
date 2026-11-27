import { CATEGORIES, byCategory, byTag } from '../data/games';
import { Link } from '../lib/router';

export function Categories() {
  return (
    <div className="page">
      <header className="page-head">
        <span className="eyebrow">6 Kategorien</span>
        <h1>Kategorien</h1>
        <p className="page-sub">Von Reflex bis Logik – such dir aus, wie du heute spielen willst.</p>
      </header>

      <div className="category-grid">
        {CATEGORIES.map((category) => {
          const games = byCategory(category.id);
          return (
            <Link key={category.id} to={`/games?cat=${encodeURIComponent(category.id)}`} className="category-card">
              <div className="category-card-top">
                <span className="category-icon" aria-hidden>
                  {category.icon}
                </span>
                <span className="category-count">{games.length} Spiele</span>
              </div>
              <h2>{category.label}</h2>
              <p className="muted">{category.blurb}</p>
              <div className="category-preview">
                {games.slice(0, 4).map((game) => (
                  <span
                    key={game.id}
                    className="preview-dot"
                    style={{ ['--from' as string]: game.from, ['--to' as string]: game.to }}
                    title={game.name}
                  >
                    {game.icon}
                  </span>
                ))}
              </div>
              <span className="category-link">Ansehen →</span>
            </Link>
          );
        })}

        <Link to="/games?sort=popular" className="category-card classic">
          <div className="category-card-top">
            <span className="category-icon" aria-hidden>
              🕹️
            </span>
            <span className="category-count">{byTag('klassiker').length} Spiele</span>
          </div>
          <h2>Klassiker</h2>
          <p className="muted">Snake, Tetris, Pong und die anderen Dauerbrenner.</p>
          <div className="category-preview">
            {byTag('klassiker')
              .slice(0, 4)
              .map((game) => (
                <span
                  key={game.id}
                  className="preview-dot"
                  style={{ ['--from' as string]: game.from, ['--to' as string]: game.to }}
                  title={game.name}
                >
                  {game.icon}
                </span>
              ))}
          </div>
          <span className="category-link">Ansehen →</span>
        </Link>
      </div>
    </div>
  );
}
