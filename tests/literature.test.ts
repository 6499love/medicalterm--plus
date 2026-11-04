import { describe, expect, it } from 'vitest';
import { groupPdfLines, parseLiteratureResponse, literatureErrorMessage } from '../services/literature';

const line = (text: string, x: number, y: number) => ({ text, x, y, width: 180, height: 12, fontSize: 10 });

describe('literature PDF translation boundaries', () => {
  it('distinguishes an accepted response with invalid JSON from authentication failure', () => {
    const blocks = groupPdfLines([line('One', 40, 100)]);
    try { parseLiteratureResponse('Not JSON', blocks); }
    catch (error) { expect(literatureErrorMessage(error)).toContain('不是有效的 JSON'); }
    expect(literatureErrorMessage(new Error('GLM API Error (401): private response'))).toContain('401');
    expect(literatureErrorMessage(new Error('GLM API Error (401): private response'))).not.toContain('private response');
  });
  it('reports missing blocks separately and never prints raw provider or document content', () => {
    const blocks = groupPdfLines([line('One', 40, 100)]);
    expect(() => parseLiteratureResponse('[]', blocks)).toThrow('段落数量');
    expect(literatureErrorMessage(new Error('Failed to fetch'))).toContain('跨域');
    expect(literatureErrorMessage(new Error('QUOTA_EXCEEDED'))).toContain('调用达到限制');
    expect(literatureErrorMessage(new Error('secret material'))).not.toContain('secret material');
  });
  it('keeps two columns separate while joining lines within each column', () => {
    const blocks = groupPdfLines([line('Left one', 40, 100), line('Right one', 320, 100), line('Left two', 40, 114), line('Right two', 320, 114)]);
    expect(blocks.map(block => block.text)).toEqual(['Left one Left two', 'Right one Right two']);
  });
  it('keeps paragraphs separated by a large vertical gap', () => {
    expect(groupPdfLines([line('First paragraph', 40, 100), line('Second paragraph', 40, 150)])).toHaveLength(2);
  });
  it('maps reordered model results by ID, not array position', () => {
    const blocks = groupPdfLines([line('One', 40, 100), line('Two', 40, 150)]);
    expect(parseLiteratureResponse('```json\n[{"id":1,"translation":"二"},{"id":0,"translation":"一"}]\n```', blocks)).toEqual({ 0: '一', 1: '二' });
  });
  it('rejects missing, duplicated and invented paragraph IDs', () => {
    const blocks = groupPdfLines([line('One', 40, 100), line('Two', 40, 150)]);
    for (const response of ['[{"id":0,"translation":"一"}]', '[{"id":0,"translation":"一"},{"id":0,"translation":"二"}]', '[{"id":0,"translation":"一"},{"id":9,"translation":"二"}]']) {
      expect(() => parseLiteratureResponse(response, blocks)).toThrow();
    }
  });
});
