export function parseMarkdownDescription(content) {
  let description = '';
  if (content.startsWith('---')) {
    const endIdx = content.indexOf('---', 3);
    if (endIdx > -1) {
      const fm = content.substring(3, endIdx);
      const descMatch = fm.match(/description:\s*(.+)/);
      if (descMatch) {
        return descMatch[1].trim().replace(/^['"]|['"]$/g, '');
      }
      content = content.substring(endIdx + 3).trim();
    }
  }

  const paragraphs = content.split('\n\n');
  const firstP = paragraphs.find(p => p.trim() && !p.startsWith('#') && !p.startsWith('!') && !p.startsWith('<') && !p.startsWith('-'));
  if (firstP) {
    description = firstP.replace(/\n/g, ' ').trim().slice(0, 200);
  }
  return description;
}
