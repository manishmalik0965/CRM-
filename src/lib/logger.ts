// Centralized client-side logging utility
import { api } from './api';

let isLogging = false;

export const logToServer = async (payload: {
  message: string;
  stack?: string;
  url?: string;
  method?: string;
  status?: number;
  responseText?: string;
  type: 'runtime' | 'api';
  error?: any;
}) => {
  if (isLogging) return;
  // If we are logging a failed /logs request, avoid infinite recursion
  if (payload.url && payload.url.includes('/logs')) return;
  
  isLogging = true;
  try {
    const token = localStorage.getItem('accessToken');
    const tenantId = localStorage.getItem('tenantId');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (tenantId) {
      headers['X-Tenant-ID'] = tenantId;
    }

    // Use standard window.fetch to avoid interceptor recursion entirely
    await fetch('/api/logs', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...payload,
        userAgent: navigator.userAgent,
      }),
    });
  } catch (err) {
    console.error('Failed to dispatch client log to /api/logs:', err);
  } finally {
    isLogging = false;
  }
};

export const initializeErrorLogging = () => {
  if (typeof window === 'undefined') return;

  // Track global uncaught errors
  window.addEventListener('error', (event) => {
    // Exclude service worker errors or chrome extension logs
    if (event.filename && event.filename.includes('sw.js')) return;

    logToServer({
      message: event.message || 'Unknown runtime error',
      stack: event.error?.stack || '',
      url: window.location.href,
      type: 'runtime',
      error: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      }
    });
  });

  // Track unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : '';

    logToServer({
      message: `Unhandled promise rejection: ${message}`,
      stack,
      url: window.location.href,
      type: 'runtime',
      error: reason && typeof reason === 'object' ? {
        message: reason.message,
        name: reason.name,
        code: reason.code
      } : { value: String(reason) }
    });
  });
};
