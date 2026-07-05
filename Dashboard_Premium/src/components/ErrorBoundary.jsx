import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh bg-[#09090b] text-white flex flex-col items-center justify-center p-4 sm:p-6">
          <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-6 sm:p-8 max-w-2xl w-full">
            <h1 className="text-2xl font-black text-red-500 mb-4 uppercase tracking-wider">Algo salió mal</h1>
            <p className="text-gray-300 mb-4 text-sm">
              La aplicación encontró un error inesperado. Intenta recargar la página; si el problema continúa, avisa al equipo del club.
            </p>
            <details className="bg-black/50 rounded-lg">
              <summary className="min-h-11 flex items-center px-4 text-gray-400 text-xs font-bold uppercase tracking-wider cursor-pointer select-none">
                Detalles técnicos
              </summary>
              <div className="px-4 pb-4 overflow-x-auto">
                <pre className="text-red-400 text-xs font-mono">
                  {this.state.error && this.state.error.toString()}
                  <br />
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </pre>
              </div>
            </details>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => window.location.reload()}
                className="min-h-11 px-6 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg transition-colors"
              >
                Recargar página
              </button>
              <button
                onClick={() => { window.location.href = '/'; }}
                className="min-h-11 px-6 py-2 bg-white/10 hover:bg-white/20 border border-white/10 text-white font-bold rounded-lg transition-colors"
              >
                Volver al inicio
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
