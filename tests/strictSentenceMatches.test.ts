import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTermSegments, findStrictSentenceMatches } from '../services/textProcessing';
import type { Term } from '../types';

const sentenceTerm: Term = {
  id: 'sentence_1',
  chinese_term: '连接交流电源，按照急停开关旋转按钮。',
  english_term: 'Connect the AC power supply, then turn the emergency stop switch knob.',
  pinyin_full: '',
  pinyin_first: '',
  category: '',
  note: '',
  usage_scenario: '',
  root_analysis: '',
  mistranslation_warning: [],
  related_terms: [],
  source: 'system',
  term_type: '句子',
  highlight_enabled: false,
};

const emergencyStopTerm: Term = {
  id: 'term_1',
  chinese_term: '急停开关',
  english_term: 'Emergency Stop Switch',
  pinyin_full: '',
  pinyin_first: '',
  category: '',
  note: '',
  usage_scenario: '',
  root_analysis: '',
  mistranslation_warning: [],
  related_terms: [],
  source: 'system',
  term_type: '术语',
  highlight_enabled: true,
};

test('findStrictSentenceMatches matches exact sentence text', () => {
  const matches = findStrictSentenceMatches(sentenceTerm.chinese_term, [sentenceTerm], { mode: 'source' });

  assert.equal(matches.length, 1);
  assert.equal(matches[0].text, sentenceTerm.chinese_term);
});

test('findStrictSentenceMatches ignores Chinese and English punctuation differences', () => {
  const matches = findStrictSentenceMatches('连接交流电源, 按照急停开关旋转按钮', [sentenceTerm], { mode: 'source' });

  assert.equal(matches.length, 1);
});

test('findStrictSentenceMatches ignores extra spaces and newlines', () => {
  const matches = findStrictSentenceMatches('连接交流电源，\n 按照 急停开关 旋转按钮。', [sentenceTerm], { mode: 'source' });

  assert.equal(matches.length, 1);
});

test('findStrictSentenceMatches ignores full-width and half-width differences', () => {
  const fullWidthTerm = { ...sentenceTerm, id: 'fullwidth', chinese_term: 'ＡＣ电源开启。' };
  const matches = findStrictSentenceMatches('AC电源开启', [fullWidthTerm], { mode: 'source' });

  assert.equal(matches.length, 1);
});

test('findStrictSentenceMatches ignores English case differences', () => {
  const matches = findStrictSentenceMatches(
    'connect the ac power supply, then turn the emergency stop switch knob.',
    [sentenceTerm],
    { mode: 'translation' }
  );

  assert.equal(matches.length, 1);
});

test('findStrictSentenceMatches does not match when an actual Chinese character is deleted', () => {
  const matches = findStrictSentenceMatches('连接交流电源，按照急停开关旋转钮。', [sentenceTerm], { mode: 'source' });

  assert.equal(matches.length, 0);
});

test('findStrictSentenceMatches does not match when a word is replaced', () => {
  const matches = findStrictSentenceMatches('连接交流电源，按照启动开关旋转按钮。', [sentenceTerm], { mode: 'source' });

  assert.equal(matches.length, 0);
});

test('findStrictSentenceMatches only marks the matched sentence inside a longer paragraph', () => {
  const text = `前置说明。${sentenceTerm.chinese_term}后续说明。`;
  const matches = findStrictSentenceMatches(text, [sentenceTerm], { mode: 'source' });

  assert.equal(matches.length, 1);
  assert.equal(matches[0].text, sentenceTerm.chinese_term);
});

test('strict sentence match coexists with inner term highlighting', () => {
  const matches = findStrictSentenceMatches(sentenceTerm.chinese_term, [sentenceTerm], { mode: 'source' });
  const innerSegments = buildTermSegments(matches[0].text, [sentenceTerm, emergencyStopTerm], { mode: 'source' });

  assert.equal(matches.length, 1);
  assert.ok(innerSegments.some(segment => segment.matchedTerm?.id === emergencyStopTerm.id));
  assert.ok(!innerSegments.some(segment => segment.matchedTerm?.id === sentenceTerm.id));
});

test('term highlighting is unchanged when no sentence match exists', () => {
  const matches = findStrictSentenceMatches('这里有急停开关。', [sentenceTerm], { mode: 'source' });
  const segments = buildTermSegments('这里有急停开关。', [emergencyStopTerm], { mode: 'source' });

  assert.equal(matches.length, 0);
  assert.ok(segments.some(segment => segment.matchedTerm?.id === emergencyStopTerm.id));
});
