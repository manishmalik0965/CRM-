import { describe, it, expect } from 'vitest';
import { encryptText, decryptText, maskCardNumber } from '../../server/utils/encryption';

describe('Encryption Utilities', () => {
  it('should encrypt and decrypt text accurately', () => {
    const plainText = '4111222233334444';
    const encrypted = encryptText(plainText);
    expect(encrypted).not.toBe(plainText);
    expect(encrypted.split(':').length).toBe(3);

    const decrypted = decryptText(encrypted);
    expect(decrypted).toBe(plainText);
  });

  it('should handle empty or null values gracefully', () => {
    expect(encryptText('')).toBe('');
    expect(decryptText('')).toBe('');
  });

  it('should return unencrypted/legacy string as is on decrypt attempt', () => {
    const legacyString = 'plain_unencrypted_data';
    expect(decryptText(legacyString)).toBe(legacyString);
  });

  it('should mask credit card numbers to last 4 digits', () => {
    expect(maskCardNumber('4111222233334444')).toBe('**** **** **** 4444');
    expect(maskCardNumber('123')).toBe('****');
    expect(maskCardNumber('')).toBe('');
  });
});
