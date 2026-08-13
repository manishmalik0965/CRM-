import { describe, it, expect } from 'vitest';
import { sanitizeRichText, sanitizeString } from '../../server/utils/sanitizer';

describe('Sanitizer Utilities', () => {
  it('should strip dangerous script tags and inline handlers', () => {
    const maliciousHtml = '<p>Hello <script>alert("XSS")</script><img src="x" onerror="alert(1)"/> world</p>';
    const sanitized = sanitizeRichText(maliciousHtml);
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('onerror');
    expect(sanitized).toContain('<p>Hello <img src="x" /> world</p>');
  });

  it('should preserve safe HTML tags and formatting', () => {
    const safeHtml = '<h1>Title</h1><p>This is <strong>bold</strong> and <em>italic</em>.</p>';
    const sanitized = sanitizeRichText(safeHtml);
    expect(sanitized).toContain('<h1>Title</h1>');
    expect(sanitized).toContain('<strong>bold</strong>');
  });

  it('should strip all HTML tags and scripts when using sanitizeString', () => {
    const html = '<div><b>Text</b><script>bad()</script></div>';
    const plain = sanitizeString(html);
    expect(plain).toBe('Text');
  });
});
