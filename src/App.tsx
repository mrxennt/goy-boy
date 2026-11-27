import type { ReactNode } from 'react';
import { Layout } from './components/Layout';
import { Link, useRoute } from './lib/router';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { Categories } from './pages/Categories';
import { Player } from './pages/Player';
import { Profile } from './pages/Profile';
import { Achievements } from './pages/Achievements';

export function App() {
  const route = useRoute();
  let page: ReactNode;

  if (route.path === '/') page = <Home />;
  else if (route.path === '/games') page = <Library mode="all" />;
  else if (route.path === '/favorites') page = <Library mode="favorites" />;
  else if (route.path === '/recent') page = <Library mode="recent" />;
  else if (route.path === '/categories') page = <Categories />;
  else if (route.path === '/profile') page = <Profile />;
  else if (route.path === '/achievements') page = <Achievements />;
  else if (route.path.startsWith('/game/')) page = <Player id={decodeURIComponent(route.path.slice(6))} />;
  else
    page = (
      <div className="page">
        <div className="empty-state">
          <span className="empty-icon" aria-hidden>
            🛸
          </span>
          <h2>Seite nicht gefunden</h2>
          <p className="muted">Diese Adresse führt nirgendwo hin – aber viele Spiele warten schon.</p>
          <Link to="/" className="btn btn-primary">
            Zur Startseite
          </Link>
        </div>
      </div>
    );

  return <Layout>{page}</Layout>;
}
