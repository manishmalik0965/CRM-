/**
 * Detects the credit card brand based on full or partial card number strings.
 * Supports Visa, Mastercard, American Express, and Discover, falling back to 'Unknown'.
 * Designed to be robust and handle spaces, dashes, and partial inputs.
 */
export function getCardBrand(number: string): 'Visa' | 'Mastercard' | 'American Express' | 'Discover' | 'Unknown' {
  if (!number) return 'Unknown';
  
  // Extract only digits
  const clean = number.toString().replace(/\D/g, '');
  if (clean.length === 0) return 'Unknown';

  // Visa: Starts with 4
  if (/^4/.test(clean)) return 'Visa';

  // Mastercard: Starts with 51-55 or 22-27
  if (/^(5[1-5]|2[2-7])/.test(clean)) return 'Mastercard';

  // American Express: Starts with 34 or 37
  if (/^3[47]/.test(clean)) return 'American Express';

  // Discover: Starts with 6011, 65, 644-649, or 622
  if (/^(6011|65|64[4-9]|622)/.test(clean)) return 'Discover';

  return 'Unknown';
}
