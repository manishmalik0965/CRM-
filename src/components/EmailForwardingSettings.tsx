import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Mail } from 'lucide-react';

interface EmailForwardingSettingsProps {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

export const EmailForwardingSettings: React.FC<EmailForwardingSettingsProps> = ({ value, onChange, disabled }) => {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <Label className="text-xs uppercase font-bold text-slate-500">BCC Email Forwarding</Label>
                <Badge variant="outline" className="text-[9px] h-4 px-1 uppercase font-bold text-blue-600 border-blue-200">Compliance</Badge>
            </div>
            <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <Input 
                    value={value} 
                    onChange={e => onChange(e.target.value)}
                    placeholder="bcc@youragency.com, tracking@agency.com" 
                    title="Every email sent by the system will have these emails in BCC field. Comma-separate for multiple recipients."
                    className="pl-9"
                    disabled={disabled}
                />
            </div>
            <p className="text-[10px] text-slate-500 italic">
                Automatically attach hidden recipients to every outgoing dispatch for archiving or monitoring. Use commas for multiple emails.
            </p>
        </div>
    );
};
