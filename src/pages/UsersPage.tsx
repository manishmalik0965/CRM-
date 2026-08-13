// @ts-nocheck
import { useState, useEffect } from 'react';
import { useTenant } from '@/lib/tenant';
import { api } from '@/lib/api';
import { logAudit, AuditAction } from '@/lib/auditLogger';
import { 

  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Users as UsersIcon, Plus, UserX, UserCog, Key, Clock, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';


export default function UsersPage({ profile }: { profile: any }) {
  const { clientId } = useTenant();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const isSystemAdmin = profile?.email?.toLowerCase() === 'manishmalik0965@gmail.com';
  const isAdmin = profile?.role === 'Admin' || isSystemAdmin;
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [userId, setUserId] = useState('');
  const [userIdAvailable, setUserIdAvailable] = useState<boolean | null>(null);
  const [checkingUserId, setCheckingUserId] = useState(false);
  const [role, setRole] = useState('Agent');
  const [password, setPassword] = useState(''); // Only used for creating initially or conceptually
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!userId.trim()) {
      setUserIdAvailable(null);
      return;
    }
    const delayDebounce = setTimeout(async () => {
      setCheckingUserId(true);
      try {
        const res = await api.get('/settings/users/check-username', {
          params: { user_id: userId.trim(), exclude_id: editingId }
        });
        setUserIdAvailable(res.data.available);
      } catch (err) {
        setUserIdAvailable(false);
      } finally {
        setCheckingUserId(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [userId, editingId]);

  const filteredUsers = (users || []).filter((u: any) => {
    if (isSystemAdmin) return true;
    return u.email?.toLowerCase() !== 'manishmalik0965@gmail.com';
  });

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get('/settings/users');
        if (res.data.users) {
          setUsers(res.data.users);
        } else {
          setUsers([]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [profile]);

  const openEdit = (user: any) => {
    setEditingId(user.id);
    setEmail(user.email || '');
    setDisplayName(user.displayName || user.username || '');
    setRole(user.role || 'Agent');
    setUserId(user.userId || '');
    setUserIdAvailable(null);
    setPassword('');
    setIsDialogOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setEmail('');
    setDisplayName('');
    setRole('Agent');
    setUserId('');
    setUserIdAvailable(null);
    setPassword('');
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!email || !displayName || !userId.trim() || userIdAvailable === false) {
      toast.error("Please enter a valid, unique User ID and required details.");
      return;
    }
    
    try {
      if (editingId) {
        if (email === 'manishmalik0965@gmail.com' && role !== 'Admin') {
          toast.error("The primary system admin role cannot be downgraded.");
          return;
        }
        await api.put(`/settings/users/${editingId}`, {
          email,
          displayName,
          role,
          userId: userId.trim(),
          ...(password ? { temporaryPassword: password } : {})
        });
        await logAudit(AuditAction.USER_EDITED, `Staff user ${email} updated. New Role: ${role}`);
        toast.success("User updated successfully");
      } else {
        await api.post('/settings/users', {
          email,
          displayName,
          role,
          userId: userId.trim(),
          temporaryPassword: password
        });
        await logAudit(AuditAction.USER_CREATED, `New staff user ${email} provisioned with role: ${role}`);
        toast.success("User created successfully");
      }
      setIsDialogOpen(false);
      // Re-fetch users
      setLoading(true);
      const res = await api.get('/settings/users');
      setUsers(res.data.users);
      setLoading(false);
    } catch (err: any) {
       console.error(err);
       toast.error("Failed to save user: " + (err?.response?.data?.error || err.message));
    }
  };

  const handleDelete = async (id: string, userEmail: string) => {
    if (!isAdmin) {
      toast.error("Security violation: Only Admins can terminate accounts");
      return;
    }
    if (userEmail === 'manishmalik0965@gmail.com') {
      toast.error("Security violation: Primary system admin cannot be deleted");
      return;
    }
    try {
      await api.delete(`/settings/users/${id}`);
      await logAudit(AuditAction.USER_DELETED, `Staff user ${userEmail} account terminated and records archived`, id);
      toast.success("User deleted");
      
      setUsers(users.filter(u => u.id !== id));
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to delete user");
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-700">
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-slate-100 uppercase">User Administration</h1>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Manage CRM Access & Roles</p>
        </div>
        {isAdmin && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger
              render={(props) => (
                <Button
                  {...props}
                  onClick={(e) => {
                    openCreate();
                    props.onClick?.(e);
                  }}
                  className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-xl shadow-slate-900/20 px-8"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add New User
                </Button>
              )}
            />
            <DialogContent className="sm:max-w-[425px] rounded-3xl p-8 border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black uppercase tracking-tighter text-slate-900 dark:text-slate-100">{editingId ? 'Edit User' : 'Create User'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 pt-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Full Name</Label>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="John Doe" className="rounded-xl bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 transition-all" />
                </div>
                <div className="space-y-4">
                  <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">User ID (Username)</Label>
                  <div className="relative">
                    <Input 
                      value={userId} 
                      onChange={(e) => setUserId(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))} 
                      placeholder="johndoe" 
                      className="rounded-xl bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 transition-all pr-10 h-10" 
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                      {checkingUserId ? (
                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      ) : userIdAvailable === true ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : userIdAvailable === false ? (
                        <XCircle className="w-4 h-4 text-red-500" />
                      ) : null}
                    </div>
                  </div>
                  {userIdAvailable === false && (
                    <p className="text-[10px] font-medium text-red-500 mt-1">This User ID is already taken.</p>
                  )}
                  {userIdAvailable === true && (
                    <p className="text-[10px] font-medium text-emerald-500 mt-1">This User ID is available!</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email Address</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="john@example.com" className="rounded-xl bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 transition-all" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Role</Label>
                  <select 
                    disabled={editingId !== null && email === 'manishmalik0965@gmail.com'} 
                    value={role} 
                    onChange={(e) => setRole(e.target.value)} 
                    className="w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-900 dark:text-slate-100 p-2.5 text-sm outline-none focus:border-blue-500 disabled:opacity-50 cursor-pointer"
                  >
                    <option value="Agent" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Agent</option>
                    <option value="Manager" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Manager</option>
                    <option value="Admin" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Admin</option>
                    <option value="HOD" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">HOD</option>
                    <option value="WFM" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">WFM</option>
                  </select>
                </div>
                 <div className="space-y-2">
                   <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{editingId ? 'Reset Password (Optional)' : 'Password'}</Label>
                   <div className="relative">
                     <Input 
                       value={password} 
                       onChange={(e) => setPassword(e.target.value)} 
                       type={showPassword ? "text" : "password"} 
                       placeholder="••••••••" 
                       className="rounded-xl bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 transition-all pr-10" 
                     />
                     <button
                       type="button"
                       onClick={() => setShowPassword(!showPassword)}
                       className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors bg-transparent border-none focus:outline-none cursor-pointer"
                     >
                       {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                     </button>
                   </div>
                 </div>
                <Button disabled={checkingUserId || (!editingId && !userId.trim()) || userIdAvailable === false} onClick={handleSave} className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-6 rounded-t-none font-bold uppercase tracking-widest text-xs">
                  {editingId ? 'Update User' : 'Create User'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="border-0 shadow-2xl shadow-slate-200/50 dark:shadow-none rounded-[2rem] overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50 dark:bg-slate-800/50">
              <TableRow className="border-slate-100 hover:bg-transparent">
                <TableHead className="py-6 px-10 text-[10px] font-black tracking-[0.2em] uppercase text-slate-400">User Profile</TableHead>
                <TableHead className="text-[10px] font-black tracking-[0.2em] uppercase text-slate-400">Role</TableHead>
                <TableHead className="text-[10px] font-black tracking-[0.2em] uppercase text-slate-400">Last Active</TableHead>
                <TableHead className="text-right px-10 text-[10px] font-black tracking-[0.2em] uppercase text-slate-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-20 text-slate-400 font-medium text-sm">Loading users...</TableCell></TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-20 text-slate-400 font-medium text-sm">No users found</TableCell></TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id} className="border-slate-50 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/80 transition-colors group">
                    <TableCell className="py-5 px-10">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm">
                          {user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 tracking-tight">{user.displayName || 'Unknown'}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-slate-500">{user.email}</span>
                            {user.userId && (
                              <>
                                <span className="text-slate-300">•</span>
                                <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.2 rounded">@{user.userId}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-md border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-widest text-[9px] px-3 py-1">
                        {user.role || 'Staff'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span className="text-[11px] font-medium text-slate-500">
                          {user.lastLogin ? (user.lastLogin.toDate ? user.lastLogin.toDate().toLocaleString() : new Date(user.lastLogin).toLocaleString()) : 'Never'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right px-10">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(user)} className="w-9 h-9 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/50 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                          <UserCog className="w-4 h-4" />
                        </Button>
                        {isAdmin && user.email !== 'manishmalik0965@gmail.com' && (
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={(props) => (
                                <Button
                                  {...props}
                                  variant="ghost"
                                  size="icon"
                                  className="w-9 h-9 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/50 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                >
                                  <UserX className="w-4 h-4" />
                                </Button>
                              )}
                            />
                            <AlertDialogContent className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-2xl">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-xl font-black uppercase tracking-tighter">Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription className="text-slate-500 font-medium">
                                  This action cannot be undone. This will permanently delete {user.email}'s account
                                  and remove their data from the servers.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="rounded-xl border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 uppercase tracking-widest text-xs font-bold">Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(user.id, user.email)} className="rounded-xl bg-red-600 hover:bg-red-700 text-white uppercase tracking-widest text-xs font-bold">Delete User</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
