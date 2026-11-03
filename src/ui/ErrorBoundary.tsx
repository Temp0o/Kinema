import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Rendered instead of the children after an error. */
  fallback: (error: Error, reset: () => void) => ReactNode;
  /** When this value changes the boundary tries to render its children again. */
  resetKey?: unknown;
  children: ReactNode;
  onError?: (error: Error) => void;
}

/**
 * Keeps one broken subtree (a malformed node, a faulty panel) from blanking the whole editor.
 * The design document is never touched, so after fixing/undoing the cause the view recovers.
 */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[kinema] render error', error, info.componentStack);
    this.props.onError?.(error);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  reset = () => this.setState({ error: null });

  render() {
    return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children;
  }
}
