import React from 'react';
import { CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IconProps {
  className?: string;
}

// Minimalist, high-quality, scalable custom SVG brand icons

export const VisaIcon: React.FC<IconProps> = ({ className }) => (
  <svg 
    viewBox="0 0 24 24" 
    className={cn("w-6 h-6 select-none", className)}
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="24" height="16" rx="2" y="4" fill="#1A1F71" />
    <path 
      d="M5 9H6.2L7 13.5L7.8 9H9L7.5 15H6.3L5 9Z" 
      fill="#F7B600" 
    />
    <path 
      d="M10 9H11.2L11.8 15H10.6L10 9Z" 
      fill="#FFFFFF" 
    />
    <path 
      d="M14.5 9.5C14.1 9.2 13.5 9 12.9 9C12 9 11.5 9.4 11.5 10C11.5 11 13 11 13 11.5C13 11.8 12.5 12 12.1 12C11.4 12 11 11.8 11 11.8L10.8 12.8C10.8 12.8 11.4 13 12.2 13C13.2 13 14 12.5 14 11.8C14 10.8 12.5 10.7 12.5 10.2C12.5 10 12.8 9.9 13.2 9.9C13.7 9.9 14.1 10.1 14.1 10.1L14.5 9.5Z" 
      fill="#FFFFFF" 
    />
    <path 
      d="M18.5 9L17.5 15H16.3L15.3 9H16.5L17 12.8L17.5 9H18.5Z" 
      fill="#F7B600" 
    />
  </svg>
);

export const MastercardIcon: React.FC<IconProps> = ({ className }) => (
  <svg 
    viewBox="0 0 24 24" 
    className={cn("w-6 h-6 select-none", className)}
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="24" height="16" rx="2" y="4" fill="#111111" />
    <circle cx="10" cy="12" r="4.5" fill="#EB001B" />
    <circle cx="14" cy="12" r="4.5" fill="#FF5F00" opacity="0.9" />
    <path 
      d="M12 9.5C12.6 10.2 13 11 13 12C13 13 12.6 13.8 12 14.5C11.4 13.8 11 13 11 12C11 11 11.4 10.2 12 9.5Z" 
      fill="#FF5F00" 
    />
  </svg>
);

export const AmexIcon: React.FC<IconProps> = ({ className }) => (
  <svg 
    viewBox="0 0 24 24" 
    className={cn("w-6 h-6 select-none", className)}
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="24" height="16" rx="2" y="4" fill="#0170B9" />
    <text 
      x="12" 
      y="15" 
      fill="#FFFFFF" 
      fontSize="7" 
      fontWeight="900" 
      fontFamily="sans-serif" 
      textAnchor="middle"
      letterSpacing="0.05em"
    >
      AMEX
    </text>
  </svg>
);

export const DiscoverIcon: React.FC<IconProps> = ({ className }) => (
  <svg 
    viewBox="0 0 24 24" 
    className={cn("w-6 h-6 select-none", className)}
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="24" height="16" rx="2" y="4" fill="#1F232B" />
    <text 
      x="10" 
      y="14.5" 
      fill="#FFFFFF" 
      fontSize="5.5" 
      fontWeight="bold" 
      fontFamily="sans-serif" 
      textAnchor="middle"
    >
      DISCOVER
    </text>
    <circle cx="17" cy="12" r="2.5" fill="#F9A01B" />
  </svg>
);

export const GenericCardIcon: React.FC<IconProps> = ({ className }) => (
  <div className={cn("w-6 h-4 bg-slate-200 dark:bg-slate-700 rounded flex items-center justify-center border border-slate-300 dark:border-slate-600", className)}>
    <CreditCard className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
  </div>
);

/**
 * Returns a high-fidelity visual icon React node for a given brand name.
 */
export function getCardBrandIcon(brand: string, className?: string): React.ReactNode {
  const norm = (brand || '').trim().toLowerCase();
  
  if (norm.includes('visa')) {
    return <VisaIcon className={className} />;
  }
  if (norm.includes('mastercard') || norm.includes('master')) {
    return <MastercardIcon className={className} />;
  }
  if (norm.includes('american express') || norm.includes('amex')) {
    return <AmexIcon className={className} />;
  }
  if (norm.includes('discover')) {
    return <DiscoverIcon className={className} />;
  }
  return <GenericCardIcon className={className} />;
}

/**
 * Renders a highly-polished, responsive badge component with the brand logo and name.
 */
export const CardBrandBadge: React.FC<{ brand: string; className?: string; hideText?: boolean }> = ({ 
  brand, 
  className,
  hideText = false
}) => {
  const brandName = (brand || '').trim();
  const normalizedBrand = brandName.toLowerCase();
  const isKnown = ['visa', 'mastercard', 'master', 'american express', 'amex', 'discover'].some(b => normalizedBrand.includes(b));
  
  let displayName = brandName;
  if (normalizedBrand.includes('amex') || normalizedBrand.includes('american express')) {
    displayName = 'AMEX';
  } else if (normalizedBrand.includes('visa')) {
    displayName = 'Visa';
  } else if (normalizedBrand.includes('mastercard') || normalizedBrand.includes('master')) {
    displayName = 'Mastercard';
  } else if (normalizedBrand.includes('discover')) {
    displayName = 'Discover';
  } else if (displayName.toLowerCase() === 'unknown' || !displayName) {
    displayName = 'CARD';
  }

  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm transition-all", className)}>
      {getCardBrandIcon(brand, "w-5 h-5")}
      {!hideText && (
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">
          {displayName}
        </span>
      )}
    </div>
  );
};
