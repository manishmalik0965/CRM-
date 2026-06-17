// @ts-nocheck
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw, Home, Terminal, Copy, Check } from 'lucide-react';
import { Button } from './ui/button';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { 
      hasError: true, 
      error, 
      errorInfo: null,
      copied: false
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error bound by CRM system:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false
    });
    window.location.href = '/';
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleCopyTrace = () => {
    if (!this.state.error) return;
    const diagnosticText = `CRM Error Trace:
Error: ${this.state.error.message}
Stack: ${this.state.error.stack}
Component Stack: ${this.state.errorInfo?.componentStack || 'N/A'}`;
    
    navigator.clipboard.writeText(diagnosticText);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 3000);
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div id="error-boundary-screen" className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans selection:bg-red-500/30 selection:text-red-200">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(239,68,68,0.06),transparent_50%)] pointer-events-none" />
          
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-[2rem] shadow-2xl shadow-red-950/10 p-8 md:p-12 relative overflow-hidden">
            {/* Top decorative hazard lines */}
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-red-500/10 via-red-500 to-red-500/10" />

            <div className="flex flex-col items-center text-center gap-6">
              <div className="w-16 h-16 bg-red-950/40 text-red-500 border border-red-900/50 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/5 animate-pulse">
                <AlertOctagon className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-black tracking-[0.25em] text-red-400 uppercase">System Exception Logged</span>
                <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight">Portal Interface Halted</h1>
                <p className="text-slate-400 text-sm max-w-md mx-auto">
                  A high-priority client rendering exception has been trapped. To safeguard ongoing transactions, the portal session was paused.
                </p>
              </div>

              {/* Exception Detail */}
              {this.state.error && (
                <div className="w-full bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 text-left font-mono text-xs">
                  <div className="flex items-center justify-between gap-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                    <span className="flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5 text-slate-400" /> Trace Diagnostic</span>
                    <button 
                      onClick={this.handleCopyTrace}
                      className="flex items-center gap-1 hover:text-slate-300 transition-colors uppercase cursor-pointer"
                    >
                      {this.state.copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-500">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Trace</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="text-red-400 font-bold overflow-x-auto whitespace-pre-wrap max-h-24 select-all scrollbar-thin">
                    {this.state.error.toString()}
                  </div>
                  {this.state.errorInfo && (
                    <div className="mt-2 text-slate-500 max-h-20 overflow-y-auto whitespace-pre-wrap text-[10px] border-t border-slate-900 pt-2 font-mono scrollbar-thin">
                      {this.state.errorInfo.componentStack}
                    </div>
                  )}
                </div>
              )}

              {/* Recovery Controls */}
              <div className="w-full grid sm:grid-cols-2 gap-4 pt-4">
                <Button 
                  onClick={this.handleReload}
                  variant="outline"
                  className="rounded-xl h-12 text-xs font-bold uppercase tracking-widest border-slate-800 bg-slate-900/50 hover:bg-slate-800 text-slate-300 hover:text-white"
                >
                  <RotateCcw className="w-4 h-4 mr-2" /> Reload Interface
                </Button>
                <Button 
                  onClick={this.handleReset}
                  className="rounded-xl h-12 text-xs font-black uppercase tracking-widest bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-lg shadow-red-950/50 border-0"
                >
                  <Home className="w-4 h-4 mr-2" /> Return Home
                </Button>
              </div>

              <div className="pt-2 text-[9px] text-slate-500 font-bold tracking-[0.15em] uppercase">
                Secure Auth CRM • Error Containment Protocol v2.55
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
