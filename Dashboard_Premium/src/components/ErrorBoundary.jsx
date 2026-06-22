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
        <div className="min-h-screen bg-[#09090b] text-white flex flex-col items-center justify-center p-6">
          <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-8 max-w-2xl w-full">
            <h1 className="text-2xl font-black text-red-500 mb-4 uppercase tracking-wider">Algo salió mal</h1>
            <p className="text-gray-300 mb-4 text-sm">
              La aplicación encontró un error inesperado. Por favor, toma una captura de pantalla de esto y envíasela al equipo técnico.
            </p>
            <div className="bg-black/50 p-4 rounded-lg overflow-x-auto">
              <pre className="text-red-400 text-xs font-mono">
                {this.state.error && this.state.error.toString()}
                <br />
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 px-6 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg transition-colors"
            >
              Recargar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
