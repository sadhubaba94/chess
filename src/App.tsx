import { useRoute, baseUrl } from './app/router';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { SettingsProvider } from './ui/hooks/settings';
import { GamePage } from './ui/pages/GamePage';
import { HomePage } from './ui/pages/HomePage';

function Routes() {
  const route = useRoute();
  if (route.name === 'game') return <GamePage key={route.id} id={route.id} />;
  if (route.name === 'home') return <HomePage />;
  return (
    <main className="page-message">
      <h1>Page not found</h1>
      <p>There is nothing at this address.</p>
      <div className="page-message__actions">
        <a className="btn btn--primary" href={baseUrl()}>
          Go to home page
        </a>
      </div>
    </main>
  );
}

export function App() {
  return (
    <ErrorBoundary homeHref={baseUrl()}>
      <SettingsProvider>
        <Routes />
      </SettingsProvider>
    </ErrorBoundary>
  );
}
