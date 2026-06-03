// @ts-nocheck
import { useState, useEffect } from 'react';
import { useTenant } from '@/lib/tenant';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { UserCog, Shield, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import { generateSecret, verify, generateURI } from 'otplib';



export default function ProfilePage({ profile }: { profile: any }) {
  const { clientId } = useTenant();
  const { setUser } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.username || profile?.displayName || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [newPassword, setNewPassword] = useState('');
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || '');
  const [loading, setLoading] = useState(false);
  
  const [mfaSecret, setMfaSecret] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [isMfaEnabled, setIsMfaEnabled] = useState(profile?.mfaEnabled || false);
  const [showMfaSetup, setShowMfaSetup] = useState(false);

  useEffect(() => {
    // refresh profile data to get latest MFA state
    const fetchProfile = async () => {
      // Handled via context
    };
    fetchProfile();
  }, [profile, clientId]);

  const handleUpdate = async () => {
    try {
      setLoading(true);
      const userId = profile?.id || profile?.uid;
      await api.put('/settings/users/' + userId, { 
         email: profile.email, 
         role: profile.role, 
         displayName, 
         photoURL,
         phone,
         temporaryPassword: newPassword !== '' ? newPassword : undefined 
      });
      
      const meRes = await api.get('/auth/me');
      setUser(meRes.data.user);
      
      toast.success('Profile updated');
      setNewPassword('');
    } catch(e) {
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupMfa = async () => {
    try {
      setLoading(true);
      const res = await api.post('/auth/setup-totp');
      setMfaSecret(res.data.secret);
      setQrCodeUrl(res.data.qrCode);
      setShowMfaSetup(true);
    } catch (err: any) {
      toast.error('Failed to setup MFA');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyMfa = async () => {
    try {
      setLoading(true);
      await api.post('/auth/enable-totp', { token: verifyCode });
      setIsMfaEnabled(true);
      setShowMfaSetup(false);
      toast.success('MFA enabled successfully');
    } catch (err: any) {
      toast.error('Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleDisableMfa = async () => {
    try {
      setLoading(true);
      await api.post('/auth/mfa/disable');
      setIsMfaEnabled(false);
      toast.success('MFA disabled');
    } catch (err: any) {
      toast.error('Failed to disable MFA');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-10 animate-in fade-in duration-700 space-y-6">
      <div className="mb-8 space-y-1">
        <h1 className="text-3xl font-black tracking-tighter uppercase text-slate-900 dark:text-white">My Profile</h1>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Update your account settings</p>
      </div>

      <Card className="border-none shadow-2xl rounded-3xl overflow-hidden">
        <CardHeader className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 pb-6">
          <CardTitle className="uppercase tracking-widest font-black text-sm flex items-center gap-2">
            <UserCog className="w-4 h-4 text-blue-600" />
            Account Details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8 space-y-6">
          <div className="space-y-4">
            <div className="space-y-4">
              <Label className="text-[10px] uppercase font-black tracking-widest text-slate-400">Profile Picture</Label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-slate-100 overflow-hidden border border-slate-200 flex items-center justify-center">
                  {photoURL ? (
                    <img src={photoURL} className="w-full h-full object-cover" alt="Profile" />
                  ) : (
                    <UserCog className="w-8 h-8 text-slate-300" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <Input 
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = async (event) => {
                          const base64 = event.target?.result as string;
                          try {
                            const res = await fetch('/api/upload-snapshot', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ base64 })
                            });
                            if (res.ok) {
                              const { url, relativeUrl } = await res.json();
                              const finalUrl = relativeUrl || url;
                              setPhotoURL(finalUrl);
                              toast.success('Picture uploaded successfully');
                            } else {
                              setPhotoURL(base64);
                            }
                          } catch (err) {
                            setPhotoURL(base64);
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  <p className="text-[10px] text-slate-500">Upload a PNG or JPG.</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black tracking-widest text-slate-400">Email Address (Read-only)</Label>
              <Input value={profile?.email || ''} readOnly disabled className="bg-slate-50 opacity-50" />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black tracking-widest text-slate-400">Display Name</Label>
              <Input 
                value={displayName} 
                onChange={e => setDisplayName(e.target.value)} 
                placeholder="Enter your name" 
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black tracking-widest text-slate-400">Contact Number</Label>
              <Input 
                value={phone} 
                onChange={e => setPhone(e.target.value)} 
                placeholder="Enter your phone number" 
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black tracking-widest text-slate-400">New Password</Label>
              <Input 
                type="password"
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)} 
                placeholder="Leave blank to keep unchanged" 
              />
              <p className="text-[10px] text-slate-500">Requires recent sign-in to change password due to security policy.</p>
            </div>
            
            <Button onClick={handleUpdate} disabled={loading} className="w-full mt-4 rounded-xl py-6 tracking-widest font-bold uppercase text-xs">
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-2xl rounded-3xl overflow-hidden mt-6">
        <CardHeader className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 pb-6">
          <CardTitle className="uppercase tracking-widest font-black text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600" />
            Two-Factor Authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Google Authenticator App</p>
              <p className="text-xs text-slate-500 mt-1">Secure your account with TOTP based two-factor authentication.</p>
            </div>
            {!isMfaEnabled ? (
              <Button onClick={handleSetupMfa} className="rounded-xl tracking-widest font-bold uppercase text-xs">
                Setup MFA
              </Button>
            ) : (
              <Button onClick={handleDisableMfa} variant="destructive" className="rounded-xl tracking-widest font-bold uppercase text-xs">
                Disable MFA
              </Button>
            )}
          </div>

          {showMfaSetup && !isMfaEnabled && (
            <div className="mt-8 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col items-center text-center space-y-4">
               <QrCode className="w-12 h-12 text-slate-400" />
               <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800 dark:text-slate-200">Scan QR Code</h3>
               <p className="text-xs text-slate-500 max-w-sm">Open the Google Authenticator app on your device and scan the QR code below to link your account.</p>
               
               {qrCodeUrl && (
                 <div className="bg-white p-4 rounded-xl shadow-sm">
                   <img src={qrCodeUrl} alt="MFA QR Code" className="w-48 h-48 object-contain" />
                 </div>
               )}
               
               <div className="w-full max-w-xs space-y-3 pt-4">
                 <Label className="text-[10px] uppercase font-black tracking-widest text-slate-400 text-left block">Verification Code</Label>
                 <Input 
                   type="text"
                   value={verifyCode}
                   onChange={e => setVerifyCode(e.target.value)}
                   placeholder="000000"
                   className="text-center tracking-[0.5em] font-mono text-xl h-12 rounded-xl"
                   maxLength={6}
                 />
                 <Button onClick={handleVerifyMfa} className="w-full rounded-xl tracking-widest font-bold uppercase text-xs h-12 mt-2">
                   Verify & Enable
                 </Button>
               </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
