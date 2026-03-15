import { Component } from "preact";
import type { ComponentChildren } from "preact";

interface ErrorBoundaryProps {
  children: ComponentChildren;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div class="error-boundary">
          <strong>Something went wrong</strong>
          <pre class="error-boundary__message">{this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
