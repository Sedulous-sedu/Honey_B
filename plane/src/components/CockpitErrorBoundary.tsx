import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class CockpitErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Cockpit UI unhandled component error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            flex: 1,
            margin: '24px',
            padding: '24px',
            borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '2px solid #ef4444',
            color: '#FFFFFF',
            fontFamily: 'monospace',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '50vh',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '2rem' }}>⚠️</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fca5a5' }}>
            COCKPIT DISPLAY ADVISORY RECOVERY
          </div>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8', maxWidth: '600px' }}>
            The cockpit display encountered an unexpected render condition. Avionics failsafe protection engaged.
          </div>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              background: '#F5A623',
              color: '#0A1830',
              fontWeight: 'bold',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            ↻ RE-INITIALIZE COCKPIT DISPLAY
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
