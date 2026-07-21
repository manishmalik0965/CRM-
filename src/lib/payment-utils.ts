/**
 * Detects the credit card brand based on full or partial card number strings.
 * Supports Visa, Mastercard, American Express, Discover, Diners Club, JCB, Maestro, UnionPay, falling back to 'Unknown'.
 * Designed to be robust and handle spaces, dashes, and partial inputs.
 */
export function getCardBrand(number: string): 'Visa' | 'Mastercard' | 'American Express' | 'Discover' | 'Diners Club' | 'JCB' | 'Maestro' | 'UnionPay' | 'Unknown' {
  if (!number) return 'Unknown';
  
  // Extract only digits
  const clean = number.toString().replace(/\D/g, '');
  if (clean.length === 0) return 'Unknown';

  // Visa: Starts with 4
  if (/^4/.test(clean)) return 'Visa';

  // Mastercard: Starts with 51-55 or 2221-2720
  if (/^(5[1-5]|222[1-9]|22[3-9]|2[3-6]|27[0-1]|2720)/.test(clean)) return 'Mastercard';

  // American Express: Starts with 34 or 37
  if (/^3[47]/.test(clean)) return 'American Express';

  // Discover: Starts with 6011, 622126-622925, 644-649, or 65
  if (/^(6011|622(12[6-9]|1[3-9]|[2-8]|9[0-1]|92[0-5])|64[4-9]|65)/.test(clean)) return 'Discover';

  // Diners Club: Starts with 300-305, 36, or 38
  if (/^3(0[0-5]|[68])/.test(clean)) return 'Diners Club';

  // JCB: Starts with 3528-3589
  if (/^35(2[89]|[3-8])/.test(clean)) return 'JCB';

  // Maestro: Starts with 5018, 5020, 5038, 5893, 6304, 6759, 6761, 6762, 6763
  if (/^(5018|5020|5038|5893|6304|6759|6761|6762|6763)/.test(clean)) return 'Maestro';

  // UnionPay: Starts with 62
  if (/^62/.test(clean)) return 'UnionPay';

  return 'Unknown';
}
