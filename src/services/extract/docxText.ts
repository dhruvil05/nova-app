/**
 * Plain text from a DOCX's word/document.xml (spec 10.3): keep the text inside
 * <w:t> runs, turn tabs and line breaks into whitespace, and end each paragraph
 * (</w:p>) with a newline. Formatting, images and fields are dropped.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

export function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x')) return safeCodePoint(parseInt(entity.slice(2), 16), match);
    if (entity.startsWith('#')) return safeCodePoint(parseInt(entity.slice(1), 10), match);
    return NAMED_ENTITIES[entity] ?? match;
  });
}

function safeCodePoint(code: number, fallback: string): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

/**
 * One pass over the XML tokens. Text is only taken from inside <w:t>, so
 * deleted-revision text (<w:delText>) and field codes (<w:instrText>) are skipped.
 */
export function docxXmlToText(xml: string): string {
  const out: string[] = [];
  const tag = /<(\/?)([a-zA-Z0-9:]+)([^>]*?)(\/?)>|([^<]+)/g;
  let inText = false;
  let m: RegExpExecArray | null;

  while ((m = tag.exec(xml)) !== null) {
    const [, closing, name, , selfClosing, text] = m;
    if (text !== undefined) {
      if (inText) out.push(decodeXmlEntities(text));
      continue;
    }
    if (name === 'w:t') {
      inText = !closing && !selfClosing;
    } else if (name === 'w:tab' && !closing) {
      out.push('\t');
    } else if ((name === 'w:br' || name === 'w:cr') && !closing) {
      out.push('\n');
    } else if (name === 'w:p' && (closing || selfClosing)) {
      out.push('\n');
    } else if (name === 'w:tc' && closing) {
      // Separate table cells on the same row.
      out.push('\t');
    }
  }

  return out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
