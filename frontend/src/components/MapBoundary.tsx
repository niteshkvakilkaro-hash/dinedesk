import { Component, type ReactNode } from 'react';

/** If the map can't load (offline, blocked), show the fallback and keep the rest of the screen working. */
export class MapBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
