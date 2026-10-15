import { decodeXmlEntities, docxXmlToText } from '../docxText';

const doc = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`;

describe('docxXmlToText', () => {
  it('joins runs and ends paragraphs with newlines', () => {
    const xml = doc(
      '<w:p><w:r><w:t>Dear </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Sir</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t xml:space="preserve">I would like </w:t><w:t>leave.</w:t></w:r></w:p>',
    );
    expect(docxXmlToText(xml)).toBe('Dear Sir\nI would like leave.');
  });

  it('handles tabs, line breaks, empty paragraphs and entities', () => {
    const xml = doc(
      '<w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t><w:br/><w:t>C &amp; D &lt;3 &#x20B9;5</w:t></w:r></w:p>' +
        '<w:p/><w:p/><w:p/><w:p><w:r><w:t>End</w:t></w:r></w:p>',
    );
    expect(docxXmlToText(xml)).toBe('A\tB\nC & D <3 ₹5\n\nEnd');
  });

  it('skips deleted revisions and field codes', () => {
    const xml = doc(
      '<w:p><w:r><w:delText>old</w:delText></w:r><w:r><w:instrText>PAGE</w:instrText></w:r><w:r><w:t>new</w:t></w:r></w:p>',
    );
    expect(docxXmlToText(xml)).toBe('new');
  });

  it('keeps Hindi and Gujarati text intact', () => {
    expect(docxXmlToText(doc('<w:p><w:r><w:t>नमस्ते</w:t></w:r></w:p><w:p><w:r><w:t>કેમ છો</w:t></w:r></w:p>'))).toBe(
      'नमस्ते\nકેમ છો',
    );
  });

  it('separates table cells', () => {
    const xml = doc(
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Ravi</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    );
    expect(docxXmlToText(xml)).toContain('Name');
    expect(docxXmlToText(xml)).toContain('Ravi');
  });
});

describe('decodeXmlEntities', () => {
  it('leaves unknown or invalid entities alone', () => {
    expect(decodeXmlEntities('&nbsp; &#99999999;')).toBe('&nbsp; &#99999999;');
  });
});
