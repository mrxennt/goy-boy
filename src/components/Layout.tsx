import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, isActive, navigate, useRoute } from '../lib/router';
import { levelOf, useAppState } from '../lib/store';
import { SettingsDialog } from './SettingsDialog';
import { Toasts } from './Toasts';
import { sfx } from '../lib/sound';

const NAV_ITEMS = [
  { to: '/', label: 'Home' },
  { to: '/games', label: 'Alle Spiele' },
  { to: '/categories', label: 'Kategorien' },
  { to: '/favorites', label: 'Favoriten' },
  { to: '/recent', label: 'Zuletzt gespielt' },
];

export function Layout({ children }: { children: ReactNode }) {
  const route = useRoute();
  const { profile, xp, settings } = useAppState();
  const searchRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState(route.query.get('q') ?? '');

  useEffect(() => {
    setMenuOpen(false);
  }, [route.path]);

  useEffect(() => {
    if (route.path === '/games') setQuery(route.query.get('q') ?? '');
  }, [route.path, route.search]);

  /* Effects preference drives a data attribute that CSS uses to drop blur,
     glow and transitions (also auto-detected from prefers-reduced-motion). */
  useEffect(() => {
    document.documentElement.dataset.effects = settings.effects;
  }, [settings.effects]);

  /* "/" jumps to the search field, like on most content sites. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submitSearch = (value: string) => {
    setQuery(value);
    const target = value.trim() ? `/games?q=${encodeURIComponent(value.trim())}` : '/games';
    navigate(target, { replace: route.path === '/games' });
  };

  return (
    <div className="app-shell">
      <div className="bg-orbs" aria-hidden>
        <span className="orb orb-a" />
        <span className="orb orb-b" />
        <span className="orb orb-c" />
      </div>

      <header className="nav">
        <div className="nav-inner">
          <Link to="/" className="brand" aria-label="GOY BOY Startseite">
            <span className="brand-mark" aria-hidden>
              <span className="brand-eye" />
            </span>
            <span className="brand-text">
              GOY<span> BOY</span>
            </span>
          </Link>

          <nav className="nav-links" aria-label="Hauptnavigation">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`nav-link ${isActive(route.path, item.to) ? 'is-active' : ''}`}
                onMouseEnter={() => sfx.hover()}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="nav-tools">
            <div className="nav-search">
              <span aria-hidden>⌕</span>
              <input
                ref={searchRef}
                type="search"
                value={query}
                placeholder="Spiele suchen… ( / )"
                aria-label="Spiele suchen"
                onChange={(event) => submitSearch(event.target.value)}
              />
              {query ? (
                <button type="button" className="search-clear" onClick={() => submitSearch('')} aria-label="Suche leeren">
                  ✕
                </button>
              ) : null}
            </div>

            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                sfx.click();
                setSettingsOpen(true);
              }}
              aria-label="Einstellungen öffnen"
              title="Einstellungen"
            >
              ⚙
            </button>

            <Link to="/profile" className="nav-profile" aria-label="Profil öffnen" title="Profil">
              <span className="nav-avatar">{profile.avatar}</span>
              <span className="nav-level">Lv {levelOf(xp)}</span>
            </Link>

            <button
              type="button"
              className="icon-btn nav-burger"
              aria-label="Menü"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div className="mobile-menu">
            <div className="mobile-search">
              <input
                type="search"
                value={query}
                placeholder="Spiele suchen…"
                aria-label="Spiele suchen"
                onChange={(event) => submitSearch(event.target.value)}
              />
            </div>
            {NAV_ITEMS.map((item) => (
              <Link key={item.to} to={item.to} className="mobile-link" onClick={() => setMenuOpen(false)}>
                {item.label}
              </Link>
            ))}
            <Link to="/profile" className="mobile-link" onClick={() => setMenuOpen(false)}>
              Profil & Erfolge
            </Link>
            <button
              type="button"
              className="mobile-link as-button"
              onClick={() => {
                setMenuOpen(false);
                setSettingsOpen(true);
              }}
            >
              Einstellungen
            </button>
          </div>
        ) : null}
      </header>

      <main className="main">{children}</main>

      <footer className="footer">
        <div className="footer-inner">
          <div>
            <p className="footer-brand">
              GOY<span> BOY</span>
            </p>
            <p className="muted small">Click. Play. Have Fun. Spiele direkt im Browser.</p>
          </div>
          <div className="footer-links">
            <Link to="/games">Alle Spiele</Link>
            <Link to="/categories">Kategorien</Link>
            <Link to="/favorites">Favoriten</Link>
            <Link to="/profile">Profil</Link>
          </div>
          <p className="muted tiny">
            Keine Anmeldung, kein Server, keine Tracker. Alle Spielstände bleiben lokal in deinem Browser.
          </p>
        </div>
      </footer>

      <Toasts />
      {settingsOpen ? <SettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
