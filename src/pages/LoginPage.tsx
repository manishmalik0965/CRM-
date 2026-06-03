import React, { useState } from 'react';
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
  
  // OTP States
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [mfaToken, setMfaToken] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password");
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
      toast.error(err.response?.data?.error || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode) return;

    try {
      const res = await api.post('/auth/verify-totp', { token: otpCode, mfaToken });
      localStorage.setItem('accessToken', res.data.accessToken);
      sessionStorage.setItem('mfa_verified', 'true');
      setUser(res.data.user);
      toast.success("Multifactor authentication verified!");
      navigate('/');
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Verification failed");
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans overflow-hidden relative">
      {/* Abstract Background Accents */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-600/10 rounded-full -mr-96 -mt-96 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-900/10 rounded-full -ml-72 -mb-72 blur-[100px] pointer-events-none" />
      
      <Card className="w-full max-w-[450px] bg-white dark:bg-slate-950 border-none shadow-2xl rounded-[2.5rem] overflow-hidden animate-in zoom-in-95 duration-700 relative z-10">
        <div className="p-12 space-y-10">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center shadow-xl shadow-blue-600/30 transform rotate-12 transition-transform hover:rotate-0 duration-500">
               <Plane className="w-8 h-8 text-white" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-black tracking-tight text-slate-800 dark:text-white uppercase">CRM Portal</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-[0.3em]">Carrier Management Interface</p>
            </div>
          </div>

          {!showOtp ? (
          <form onSubmit={handleAuth} className="space-y-6">
            <div className="space-y-4">
              <Input 
                type="text" 
                placeholder="Email Address or User ID" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 bg-slate-50 dark:bg-slate-900 border-none focus-visible:ring-1 focus-visible:ring-blue-500"
              />
              <Input 
                type="password" 
                placeholder="Password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 bg-slate-50 dark:bg-slate-900 border-none focus-visible:ring-1 focus-visible:ring-blue-500"
              />
            </div>

            <Button 
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-3 transition-all"
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
                onChange={(e) => setOtpCode(e.target.value)}
                required
                maxLength={6}
                className="h-14 font-mono text-center text-xl tracking-[0.5em] bg-slate-50 dark:bg-slate-900 border-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-2xl"
              />
            </div>

            <Button 
                type="submit"
                className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-3 transition-all"
            >
              Verify OTP
            </Button>
          </form>
          )}
        </div>
        
        <div className="bg-slate-50 dark:bg-slate-900 p-6 border-t border-slate-100 dark:border-slate-800 text-center">
            <p className="text-[9px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-[0.3em]">© 2026 SaaS • SECURE ENDPOINT</p>
        </div>
      </Card>
    </div>
  );
}
