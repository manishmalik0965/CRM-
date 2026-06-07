// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Power, Globe, Edit, ShieldAlert, BarChart3, Mail, Key, Trash2, Users, Download, CheckCircle2, XCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminUserId, setAdminUserId] = useState('');
  const [adminUserIdAvailable, setAdminUserIdAvailable] = useState<boolean | null>(null);
  const [checkingAdminUserId, setCheckingAdminUserId] = useState(false);
  const [newName, setNewName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('active');

  const [domain, setDomain] = useState('');

  // Edit Client dialog states
  const [editingClient, setEditingClient] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editDomain, setEditDomain] = useState('');
  const [editAdminEmail, setEditAdminEmail] = useState('');
  const [editAdminUserId, setEditAdminUserId] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Password reset dialog states
  const [resettingClient, setResettingClient] = useState<any | null>(null);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (!adminUserId.trim()) {
      setAdminUserIdAvailable(null);
      return;
    }
    const delayDebounce = setTimeout(async () => {
      setCheckingAdminUserId(true);
      try {
        const res = await api.get('/settings/users/check-username', {
          params: { user_id: adminUserId.trim() }
        });
        setAdminUserIdAvailable(res.data.available);
      } catch (err) {
        setAdminUserIdAvailable(false);
      } finally {
        setCheckingAdminUserId(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [adminUserId]);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      setLoading(true);
      const res = await api.get('/settings/clients');
      setClients(res.data.clients.map((c: any) => ({
         id: c.id,
         name: c.name,
         domain: c.domain,
         isActive: c.isActive === 1 || c.isActive === true || c.is_active === 1 || c.is_active === true,
         bookingCount: c.bookingCount || 0,
         userCount: c.userCount || 0,
         adminEmail: c.adminEmail || '',
         adminUserId: c.adminUserId || '',
         createdAt: c.createdAt || null
      })));
    } catch (err: any) {
      toast.error('Failed to load clients: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (client: any) => {
    setEditingClient(client);
    setEditName(client.name || '');
    setEditDomain(client.domain || '');
    setEditAdminEmail(client.adminEmail || '');
    setEditAdminUserId(client.adminUserId || '');
  };

  const handleUpdateClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    if (!editName || !editDomain || !editAdminEmail || !editAdminUserId) {
      return toast.error('All fields are required.');
    }
    setIsUpdating(true);
    try {
      await api.put(`/settings/clients/${editingClient.id}`, {
        name: editName,
        domain: editDomain,
        adminEmail: editAdminEmail,
        adminUserId: editAdminUserId
      });
      toast.success('Tenant account updated successfully.');
      setEditingClient(null);
      loadClients();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Failed to update tenant');
    } finally {
      setIsUpdating(false);
    }
  };

  const openResetPasswordModal = (client: any) => {
    setResettingClient(client);
    setNewResetPassword('');
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingClient) return;
    if (!newResetPassword.trim() || newResetPassword.length < 4) {
      return toast.error('Password must be at least 4 characters long.');
    }
    setIsResetting(true);
    try {
      await api.post(`/settings/clients/${resettingClient.id}/reset-password`, {
        newPassword: newResetPassword
      });
      toast.success(`Password for ${resettingClient.name} admin has been reset!`);
      setResettingClient(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Failed to reset password');
    } finally {
      setIsResetting(false);
    }
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail || !newName || !adminPassword || !domain || !adminUserId.trim()) return toast.error('Name, domain, admin User ID, email and password are required');
    if (adminUserIdAvailable === false) return toast.error('The Admin User ID is already taken');
    
    setCreating(true);
    try {
      await api.post('/settings/clients', {
        name: newName,
        adminEmail,
        adminUserId: adminUserId.trim(),
        domain,
        adminPassword
      });
      toast.success('Client created');
      setNewName('');
      setAdminEmail('');
      setAdminUserId('');
      setAdminUserIdAvailable(null);
      setDomain('');
      setAdminPassword('');
      setCompany('');
      setPhone('');
      setNotes('');
      loadClients();
    } catch(err: any) {
      const errMsg = err.response?.data?.error || err.message || 'Failed to add client';
      toast.error(errMsg);
    } finally {
      setCreating(false);
    }
  };

  const toggleKillSwitch = async (id: string, active: boolean) => {
    try {
      await api.put('/settings/clients/' + id, { isActive: !active });
      setClients(clients.map((c: any) => c.id === id ? { ...c, isActive: !active } : c));
      toast.success(active ? 'Tenant disabled' : 'Tenant restored');
    } catch(err: any) {
      toast.error('Failed to toggle status');
    }
  };

  const handleDeleteClient = async () => {
    if (!clientToDelete) return;
    setIsDeleting(true);
    try {
      await api.delete('/settings/clients/' + clientToDelete);
      setClients(clients.filter((c: any) => c.id !== clientToDelete));
      toast.success('Tenant deleted successfully');
    } catch(err: any) {
      toast.error('Failed to delete tenant');
    } finally {
      setIsDeleting(false);
      setClientToDelete(null);
    }
  };

  const handlePasswordReset = async (email: string) => {
    // noop
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
         <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">Tenant Management</h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-1">Super Admin Domain Controller</p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-2 border-slate-200 dark:border-slate-800 rounded-3xl shadow-none dark:bg-slate-900 col-span-1 lg:col-span-1">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800 p-6">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Add New Tenant</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleAddClient} className="flex flex-col gap-4">
               <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Company Name</label>
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Acme Travel" className="h-12 bg-slate-50 dark:bg-slate-800 border-none rounded-xl" />
               </div>
               <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Custom Domain</label>
                  <Input value={domain} onChange={e => setDomain(e.target.value)} placeholder="e.g. portal.acme.com" className="h-12 bg-slate-50 dark:bg-slate-800 border-none rounded-xl" />
               </div>
               <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Company Entity</label>
                  <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Acme Inc" className="h-12 bg-slate-50 dark:bg-slate-800 border-none rounded-xl" />
               </div>
               <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contact Phone</label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 234 567 8900" className="h-12 bg-slate-50 dark:bg-slate-800 border-none rounded-xl" />
               </div>
               <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Admin User ID (Username)</label>
                  <div className="relative">
                     <Input 
                       value={adminUserId} 
                       onChange={e => setAdminUserId(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))} 
                       placeholder="e.g. acme_admin" 
                       className="h-12 bg-slate-50 dark:bg-slate-800 border-none rounded-xl pr-10" 
                     />
                     <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                       {checkingAdminUserId ? (
                         <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                       ) : adminUserIdAvailable === true ? (
                         <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                       ) : adminUserIdAvailable === false ? (
                         <XCircle className="w-4 h-4 text-red-500" />
                       ) : null}
                     </div>
                  </div>
                  {adminUserIdAvailable === false && (
                     <p className="text-[10px] font-medium text-red-500 mt-1">This User ID is already taken.</p>
                  )}
                  {adminUserIdAvailable === true && (
                     <p className="text-[10px] font-medium text-emerald-500 mt-1">This User ID is available!</p>
                  )}
               </div>
               <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Admin Email</label>
                  <Input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@acmetravel.com" className="h-12 bg-slate-50 dark:bg-slate-800 border-none rounded-xl" />
               </div>
               <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Admin Password</label>
                  <Input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Temporary password" className="h-12 bg-slate-50 dark:bg-slate-800 border-none rounded-xl" />
               </div>
               <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</label>
                  <select value={status} onChange={e => setStatus(e.target.value)} className="w-full h-12 bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-3 outline-none text-sm">
                     <option value="active">Active</option>
                     <option value="suspended">Suspended</option>
                     <option value="pending">Pending</option>
                  </select>
               </div>
               <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Notes (Optional)</label>
                  <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes..." className="h-12 bg-slate-50 dark:bg-slate-800 border-none rounded-xl" />
               </div>
               <Button disabled={creating || checkingAdminUserId || !adminUserId.trim() || adminUserIdAvailable === false} type="submit" className="mt-2 h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase tracking-widest text-[10px]">{creating ? 'Provisioning...' : 'Deploy SaaS'}</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-2 border-slate-200 dark:border-slate-800 rounded-3xl shadow-none dark:bg-slate-900 col-span-1 lg:col-span-2">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800 p-6">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
              <BarChart3 className="w-5 h-5 text-blue-500" />
              Tenant Operations Volume (Bookings)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 h-[300px]">
             {clients.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={clients} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} />
                   <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} />
                   <Tooltip 
                      cursor={{fill: 'transparent'}}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                      labelStyle={{ fontWeight: 900, marginBottom: '4px', textTransform: 'uppercase', fontSize: '10px' }}
                   />
                   <Bar dataKey="bookingCount" name="Bookings" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={40} />
                 </BarChart>
               </ResponsiveContainer>
             ) : (
                <div className="h-full flex items-center justify-center text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Not enough data for analytics
                </div>
             )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
         <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 pl-2">Active Tenants</h2>
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clients.map(client => (
               <Card key={client.id} className={`border-2 ${client.isActive ? 'border-emerald-500/20' : 'border-red-500/50 bg-red-50 dark:bg-red-900/10'} rounded-3xl shadow-none dark:bg-slate-900 overflow-hidden transition-all`}>
                  <div className="p-6 space-y-6">
                     <div className="flex items-start justify-between">
                        <div>
                           <h3 className="font-black text-xl text-slate-900 dark:text-white uppercase tracking-tight">{client.name}</h3>
                           <div className="flex items-center gap-4 mt-2">
                              <div className="flex items-center gap-1.5 text-slate-500">
                                 <Users className="w-3.5 h-3.5" />
                                 <span className="text-[10px] font-bold tracking-wider">{client.userCount} Users</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-slate-500">
                                 <BarChart3 className="w-3.5 h-3.5" />
                                 <span className="text-[10px] font-bold tracking-wider">{client.bookingCount} Bookings</span>
                              </div>
                           </div>
                           <div className="flex items-center gap-1.5 text-slate-500 mt-1.5">
                              <Key className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-bold tracking-wider">{client.id}</span>
                           </div>
                           <div className="flex items-center gap-1.5 text-slate-500 mt-0.5">
                              <Mail className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-bold tracking-wider">{client.adminEmail}</span>
                           </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${client.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                           {client.isActive ? 'LIVE' : 'SUSPENDED'}
                        </div>
                     </div>
                     
                         <div className="flex flex-col gap-2 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                            <Button 
                               onClick={() => {
                                  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${client.name} Portal</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body,html{margin:0;padding:0;height:100%;overflow:hidden;background:#0f172a;}</style>
</head>
<body>
  <script>
    const urlParams = window.location.search;
    const baseIframeUrl = "${window.location.origin}/?tenant=${client.id}";
    let finalUrl = baseIframeUrl;
    if (urlParams) {
      const cleanedParams = urlParams.startsWith('?') ? urlParams.substring(1) : urlParams;
      finalUrl += "&" + cleanedParams;
    }
    const iframe = document.createElement('iframe');
    iframe.src = finalUrl;
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    iframe.setAttribute("allow", "camera; microphone; geolocation");
    iframe.setAttribute("allowfullscreen", "true");
    document.body.appendChild(iframe);
  </script>
</body>
</html>`;
                                  const blob = new Blob([htmlContent], { type: 'text/html' });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `index.html`;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  URL.revokeObjectURL(url);
                               }}
                               variant="outline"
                               className="w-full h-10 rounded-xl text-[10px] font-black uppercase tracking-widest gap-2 bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100"
                            >
                               <Download className="w-4 h-4" />
                               Download Bridge (index.html)
                            </Button>
                         <div className="flex items-center gap-3 mt-1">
                           <Button 
                              onClick={() => toggleKillSwitch(client.id, client.isActive)}
                              variant={client.isActive ? 'outline' : 'default'}
                              className={`flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest gap-2 ${client.isActive ? 'border-red-200 text-red-600 hover:bg-red-50' : 'bg-emerald-600 text-white hover:bg-emerald-700 border-none'}`}
                           >
                              <Power className="w-4 h-4" />
                              {client.isActive ? 'Kill Switch' : 'Restore'}
                           </Button>
                           <Button 
                              onClick={() => {
                                 const token = localStorage.getItem('accessToken') || '';
                                 const rawDomain = client.domain || '';
                                 const cleanedDomain = rawDomain.replace(/^(https?:\/\/)?(www\.)?/, '');
                                 const targetUrl = cleanedDomain 
                                   ? `${window.location.protocol}//${cleanedDomain}/?superadmin_token=${token}` 
                                   : `/?tenant=${client.id}&superadmin_token=${token}`;
                                 window.open(targetUrl, '_blank');
                               }}
                              variant="default"
                              className="flex-1 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest gap-2"
                           >
                              <Globe className="w-4 h-4" />
                              View Tenant
                           </Button>
                        </div>
                        <div className="flex items-center gap-3">
                           <Button 
                              onClick={() => openEditModal(client)}
                              variant="outline"
                              className="flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest gap-2 border-slate-200"
                           >
                              <Edit className="w-4 h-4 text-slate-500" />
                              Edit Info
                           </Button>
                           <Button 
                              onClick={() => openResetPasswordModal(client)}
                              variant="outline"
                              className="flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest gap-2 border-slate-200 text-amber-600 hover:bg-amber-50"
                           >
                              <Key className="w-4 h-4" />
                              Reset Pass
                           </Button>
                        </div>
                        <div className="flex items-center gap-3">
                           <Button 
                              onClick={() => setClientToDelete(client.id)}
                              variant="outline"
                              className="w-full h-10 rounded-xl text-[10px] font-black uppercase tracking-widest gap-2 border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                           >
                              <Trash2 className="w-4 h-4" />
                              Delete Tenant
                           </Button>
                        </div>
                     </div>
                  </div>
               </Card>
            ))}
            {clients.length === 0 && (
               <div className="col-span-3 text-center py-20 text-slate-400 font-bold uppercase tracking-widest text-xs">
                  No tenants deployed yet.
               </div>
            )}
         </div>
      </div>

      <AlertDialog open={!!clientToDelete} onOpenChange={(open) => !open && !isDeleting && setClientToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the tenant
              and wipe out all associated data (bookings, passengers, users, configurations,
              and audit logs).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              disabled={isDeleting} 
              onClick={(e) => { e.preventDefault(); handleDeleteClient(); }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? 'Deleting...' : 'Delete Tenant'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Client Information Modal */}
      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl space-y-6">
            <div className="space-y-1">
              <h3 className="font-black text-xl text-slate-900 dark:text-white uppercase tracking-tight">Edit Tenant Profile</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Update domain, brand & admin identity</p>
            </div>
            
            <form onSubmit={handleUpdateClientSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tenant Name</label>
                <Input 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="rounded-xl h-11 border-2"
                  placeholder="e.g. SKYWAY TRAVELS"
                  required
                />
              </div>
              
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Domain / URL Mapping</label>
                <Input 
                  value={editDomain}
                  onChange={(e) => setEditDomain(e.target.value)}
                  className="rounded-xl h-11 border-2"
                  placeholder="e.g. portal.skyway.com"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Admin Login Email</label>
                <Input 
                  value={editAdminEmail}
                  type="email"
                  onChange={(e) => setEditAdminEmail(e.target.value)}
                  className="rounded-xl h-11 border-2"
                  placeholder="e.g. admin@skyway.com"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Admin User ID</label>
                <Input 
                  value={editAdminUserId}
                  onChange={(e) => setEditAdminUserId(e.target.value)}
                  className="rounded-xl h-11 border-2"
                  placeholder="e.g. skywayadmin"
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  type="button" 
                  onClick={() => setEditingClient(null)} 
                  variant="outline" 
                  className="flex-1 rounded-xl h-11 text-[10px] font-black uppercase tracking-widest border-2"
                  disabled={isUpdating}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1 rounded-xl h-11 text-[10px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={isUpdating}
                >
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {resettingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl space-y-6">
            <div className="space-y-1">
              <h3 className="font-black text-xl text-slate-900 dark:text-white uppercase tracking-tight">Reset Password</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Provide temporary password for: {resettingClient.name}</p>
            </div>
            
            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">New Password</label>
                <Input 
                  type="password"
                  value={newResetPassword}
                  onChange={(e) => setNewResetPassword(e.target.value)}
                  className="rounded-xl h-11 border-2"
                  placeholder="Minimum 4 characters"
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  type="button" 
                  onClick={() => setResettingClient(null)} 
                  variant="outline" 
                  className="flex-1 rounded-xl h-11 text-[10px] font-black uppercase tracking-widest border-2"
                  disabled={isResetting}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1 rounded-xl h-11 text-[10px] font-black uppercase tracking-widest bg-red-600 hover:bg-red-700 text-white"
                  disabled={isResetting}
                >
                  {isResetting ? 'Resetting...' : 'Change Password'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
