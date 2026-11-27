import { useSyncExternalStore, type AnchorHTMLAttributes, type ReactNode } from 'react';

type Route = { path: string; query: URLSearchParams; search: string };

const NAV_EVENT = 'goyboy:navigate';

/** `/goy-boy/` in the GitHub Pages build, `/` during development. */
const BASE = import.meta.env.BASE_URL || '/';

function subscribe(cb: () => void) {
  window.addEventListener('popstate', cb);
  window.addEventListener(NAV_EVENT, cb);
  return () => {
    window.removeEventListener('popstate', cb);
    window.removeEventListener(NAV_EVENT, cb);
  };
}

/**
 * Routes live in the hash (`/#/game/snake`) because a static host such as
 * GitHub Pages cannot rewrite `/game/snake` back to index.html. Plain paths
 * are still understood, which keeps the dev server and old links working.
 */
function snapshot() {
  const hash = window.location.hash;
  if (hash.startsWith('#/')) return hash.slice(1);

  let path = window.location.pathname;
  if (BASE !== '/' && path.startsWith(BASE)) path = `/${path.slice(BASE.length)}`;
  if (!path.startsWith('/')) path = `/${path}`;
  return `${path}${window.location.search}`;
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  const target = to.startsWith('/') ? to : `/${to}`;
  if (target === snapshot()) return;

  const url = `${BASE}#${target}`;
  if (options.replace) window.history.replaceState({}, '', url);
  else window.history.pushState({}, '', url);
  window.dispatchEvent(new Event(NAV_EVENT));
  if (!options.replace) window.scrollTo({ top: 0, behavior: 'auto' });
}

export function useRoute(): Route {
  const key = useSyncExternalStore(subscribe, snapshot);
  const [path, search = ''] = key.split('?');
  return { path: path || '/', search, query: new URLSearchParams(search) };
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; children: ReactNode };

export function Link({ to, children, onClick, ...rest }: LinkProps) {
  return (
    <a
      href={`${BASE}#${to}`}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function isActive(path: string, to: string) {
  if (to === '/') return path === '/';
  const base = to.split('?')[0];
  if (base === '/games') return path === '/' || path === '/games';
  return path === base || path.startsWith(`${base}/`);
}
