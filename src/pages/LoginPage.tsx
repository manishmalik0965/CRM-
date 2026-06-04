import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plane } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  
  // OTP States
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [mfaToken, setMfaToken] = useState('');

  // Brand States
  const [branding, setBranding] = useState({
    organizationName: 'CRM Portal',
    primaryColor: '#2563eb',
    logoUrl: ''
  });

  useEffect(() => {
    async function loadPublicBranding() {
      try {
        const { data } = await api.get('/settings/public');
        if (data) {
          setBranding({
            organizationName: data.organizationName || 'CRM Portal',
            primaryColor: data.primaryColor || '#2563eb',
            logoUrl: data.logoUrl || ''
          });
        }
      } catch (err) {
        console.error("Failed to load public branding:", err);
      }
    }
    loadPublicBranding();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!email || !password) {
      setAuthError("Please enter email and password");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      
      if (res.data.requireMFA) {
        setMfaToken(res.data.mfaToken);
        setShowOtp(true);
        toast.info("Please enter your Authenticator code.");
      } else {
        localStorage.setItem('accessToken', res.data.accessToken);
        sessionStorage.setItem('mfa_verified', 'true');
        setUser(res.data.user);
        toast.success("Logged in successfully!");
        navigate('/');
      }
    } catch (err: any) {
      console.error("Auth failed", err);
      const errMsg = err.response?.data?.error || err.message || "Authentication failed";
      setAuthError(errMsg);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!otpCode) return;

    try {
      const res = await api.post('/auth/verify-totp', { token: otpCode, mfaToken });
      localStorage.setItem('accessToken', res.data.accessToken);
      sessionStorage.setItem('mfa_verified', 'true');
      setUser(res.data.user);
      toast.success("Multifactor authentication verified!");
      navigate('/');
    } catch (e: any) {
      console.error("OTP verification failed", e);
      const errMsg = e.response?.data?.error || e.message || "Verification failed";
      setAuthError(errMsg);
      toast.error(errMsg);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans overflow-hidden relative">
      {/* Abstract Background Accents */}
      <div 
        className="absolute top-0 right-0 w-[800px] h-[800px] rounded-full -mr-96 -mt-96 blur-[120px] pointer-events-none opacity-30"
        style={{ backgroundColor: branding.primaryColor }}
      />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-slate-950/40 rounded-full -ml-72 -mb-72 blur-[100px] pointer-events-none" />
      
      <Card className="w-full max-w-[450px] bg-white dark:bg-slate-950 border-none shadow-2xl rounded-[2.5rem] overflow-hidden animate-in zoom-in-95 duration-700 relative z-10">
        <div className="p-12 space-y-8">
          <div className="flex flex-col items-center text-center space-y-4">
            {branding.logoUrl ? (
              <div className="w-24 h-24 rounded-2xl bg-white flex items-center justify-center p-2 shadow-md">
                <img src={branding.logoUrl} alt="Branded Logo" className="max-w-full max-h-full object-contain" />
              </div>
            ) : (
              <div 
                className="w-16 h-16 rounded-3xl flex items-center justify-center shadow-lg transform rotate-12 transition-transform hover:rotate-0 duration-500 text-white"
                style={{ backgroundColor: branding.primaryColor }}
              >
                 <Plane className="w-8 h-8" />
              </div>
            )}
            <div className="space-y-1">
              <h1 className="text-2xl font-black tracking-tight text-slate-800 dark:text-white uppercase">
                {branding.organizationName}
              </h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-[0.3em]">Carrier Management Interface</p>
            </div>
          </div>

          {authError && (
            <div id="login-error-alert" className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200/50 dark:border-red-900/40 text-red-700 dark:text-red-400 text-xs flex items-start gap-3 animate-in fade-in slide-in-from-top-1 duration-300">
              <span className="text-base shrink-0 select-none">⚠️</span>
              <div className="flex-1">
                <p className="font-bold uppercase tracking-wider mb-0.5 text-[10px]">Access Denied</p>
                <p className="font-medium">{authError}</p>
              </div>
            </div>
          )}

          {!showOtp ? (
          <form onSubmit={handleAuth} className="space-y-6">
            <div className="space-y-4">
              <Input 
                type="text" 
                placeholder="Email Address or User ID" 
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setAuthError(null);
                }}
                required
                className="h-12 bg-slate-50 dark:bg-slate-900 border-none focus-visible:ring-1 focus-visible:ring-blue-500"
              />
              <Input 
                type="password" 
                placeholder="Password" 
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setAuthError(null);
                }}
                required
                className="h-12 bg-slate-50 dark:bg-slate-900 border-none focus-visible:ring-1 focus-visible:ring-blue-500"
              />
            </div>

            <Button 
                type="submit"
                disabled={loading}
                className="w-full h-14 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-3 transition-all cursor-pointer hover:brightness-110"
                style={{ backgroundColor: branding.primaryColor }}
            >
              Secure Authentication
            </Button>
          </form>
          ) : (
          <form onSubmit={handleVerifyOTP} className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="space-y-4 text-center">
              <p className="text-sm font-medium text-slate-500">
                Enter the code from your Google Authenticator app.
              </p>
              <Input 
                type="text" 
                placeholder="Enter 6-digit code" 
                value={otpCode}
                onChange={(e) => {
                  setOtpCode(e.target.value);
                  setAuthError(null);
                }}
                required
                maxLength={6}
                className="h-14 font-mono text-center text-xl tracking-[0.5em] bg-slate-50 dark:bg-slate-900 border-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-2xl"
              />
            </div>

            <Button 
                type="submit"
                className="w-full h-14 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-3 transition-all cursor-pointer hover:brightness-110"
                style={{ backgroundColor: branding.primaryColor }}
            >
              Verify OTP
            </Button>
          </form>
          )}
        </div>
        
        <div className="bg-slate-50 dark:bg-slate-900 p-6 border-t border-slate-100 dark:border-slate-800 text-center">
            <p className="text-[9px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-[0.3em]">
              © 2026 {branding.organizationName} • SECURE ENDPOINT
            </p>
        </div>
      </Card>
    </div>
  );
}
