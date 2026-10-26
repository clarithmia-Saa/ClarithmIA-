import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode; label?: string };
type State = { hasError: boolean };

/**
 * Impede que um erro de renderização em uma aba derrube o app inteiro
 * (tela preta). O componente é remontado ao trocar de aba porque o pai usa `key`.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ClarithmIA] Erro ao renderizar a aba:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="panel" role="alert" style={{ margin: '40px auto', maxWidth: 520, textAlign: 'center', padding: 32 }}>
        <h2 style={{ color: '#8de7d2', margin: '0 0 8px' }}>{this.props.label ?? 'Esta área'} não pôde ser carregada</h2>
        <p className="muted" style={{ margin: '0 0 20px' }}>Ocorreu um erro inesperado. Os demais módulos continuam funcionando.</p>
        <button className="button button-dark" onClick={() => this.setState({ hasError: false })}>Tentar novamente</button>
      </div>
    );
  }
}
