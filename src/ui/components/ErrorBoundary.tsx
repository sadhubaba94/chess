import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode; homeHref: string }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Kingside crashed:', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="page-message" role="alert">
        <h1>Something went wrong</h1>
        <p>
          The page hit an unexpected error: <code>{this.state.error.message}</code>
        </p>
        <p>Your games are saved after every move, so reloading is safe.</p>
        <div className="page-message__actions">
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            Reload page
          </button>
          <a className="btn btn--ghost" href={this.props.homeHref}>
            Go to home page
          </a>
        </div>
      </main>
    );
  }
}
