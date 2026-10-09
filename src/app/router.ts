import { useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'game'; id: string } | { name: 'notFound'; path: string };

export function baseUrl(): string {
  return import.meta.env.BASE_URL || '/';
}

export function parseRoute(pathname: string, base: string): Route {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  let path = pathname.startsWith(normalizedBase) ? pathname.slice(normalizedBase.length) : pathname.replace(/^\//, '');
  path = path.replace(/\/+$/, '');
  if (path === '' || path === 'index.html') return { name: 'home' };
  const game = /^game\/([^/]+)$/.exec(path);
  if (game) return { name: 'game', id: decodeURIComponent(game[1]!) };
  return { name: 'notFound', path: pathname };
}

export function navigate(path: string): void {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname, baseUrl()));
  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname, baseUrl()));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return route;
}
