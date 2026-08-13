import sanitizeHtml from 'sanitize-html';

export function sanitizeRichText(htmlContent: string): string {
  if (!htmlContent || typeof htmlContent !== 'string') return '';

  return sanitizeHtml(htmlContent, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'b', 'i', 'strong', 'em', 'strike',
      'u', 'span', 'div', 'br', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr',
      'th', 'td', 'img', 'blockquote', 'hr'
    ],
    allowedAttributes: {
      'a': ['href', 'target', 'rel', 'title', 'class', 'style'],
      'img': ['src', 'alt', 'width', 'height', 'class', 'style'],
      '*': ['class', 'style', 'id', 'align']
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data'],
    allowedStyles: {
      '*': {
        'color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/],
        'background-color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/],
        'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
        'font-size': [/^\d+(px|em|rem|%)$/],
        'font-family': [/.*/],
        'font-weight': [/^\d+$/, /^bold$/],
        'margin': [/.*/],
        'padding': [/.*/]
      }
    },
    transformTags: {
      'a': sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' })
    }
  });
}

export function sanitizeString(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {}
  });
}
