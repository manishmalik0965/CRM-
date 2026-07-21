import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Detects the credit card brand based on the card number using regex patterns.
 * Supports Visa, Mastercard, American Express, Discover, Diners Club, and JCB.
 * Returns 'Unknown' if the brand is not recognized or the input is empty.
 */
export function detectCardBrand(number: string): string {
  if (!number) return 'Unknown';
  const clean = number.toString().replace(/\D/g, ''); // Extract only digits
  if (/^4/.test(clean)) return 'Visa';
  if (/^(?:5[1-5]|2[2-7])/.test(clean)) return 'Mastercard';
  if (/^3[47]/.test(clean)) return 'American Express';
  if (/^6(?:011|5|4[4-9]|22)/.test(clean)) return 'Discover';
  if (/^(?:3(?:0[0-5]|[689]))/.test(clean)) return 'Diners Club';
  if (/^(?:352[89]|35[3-8][0-9])/.test(clean)) return 'JCB';
  return 'Unknown';
}

