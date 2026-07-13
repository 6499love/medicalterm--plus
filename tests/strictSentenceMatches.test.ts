import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTermSegments,
  findStrictReferenceMatches,
  findStrictSentenceMatches,
} from '../services/textProcessing';
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
  highlight_enabled: true,
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

const phraseTerm: Term = {
  ...emergencyStopTerm,
  id: 'phrase-term',
  chinese_term: '单手操作',
  english_term: 'one-handed operation',
  term_type: '词语',
};

const parameterTerm: Term = {
  ...emergencyStopTerm,
  id: 'parameter-term',
  chinese_term: '氧浓度',
  english_term: 'oxygen concentration',
  term_type: '参数',
};

const sloganTerm: Term = {
  ...sentenceTerm,
  id: 'slogan-term',
  chinese_term: '守护每一次呼吸',
  english_term: 'Protect every breath',
  term_type: '标语',
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

test('local matching includes terms, phrases, and parameters with distinct visual types', () => {
  const segments = buildTermSegments('急停开关支持单手操作，可设置氧浓度。', [
    emergencyStopTerm,
    phraseTerm,
    parameterTerm,
  ], { mode: 'source' });

  assert.deepEqual(
    segments.filter(segment => segment.matchedTerm).map(segment => ({
      id: segment.matchedTerm?.id,
      visualType: segment.visualType,
    })),
    [
      { id: emergencyStopTerm.id, visualType: 'term' },
      { id: phraseTerm.id, visualType: 'phrase' },
      { id: parameterTerm.id, visualType: 'parameter' },
    ]
  );
});

test('local matching skips a single Chinese character but keeps multi-character and English abbreviations', () => {
  const singleCharacterTerm = { ...emergencyStopTerm, id: 'single-character', chinese_term: '护' };
  const humidifierTerm = { ...emergencyStopTerm, id: 'humidifier', chinese_term: '呼吸湿化治疗仪' };
  const glycocalyxTerm = { ...emergencyStopTerm, id: 'glycocalyx', chinese_term: '糖萼' };
  const abbreviationTerm = { ...emergencyStopTerm, id: 'sdf', chinese_term: 'SDF', english_term: 'SDF' };
  const explicitlyAllowedSingleCharacter = { ...singleCharacterTerm, id: 'allowed-single-character', allow_single_character_match: true };

  const singleCharacterSegments = buildTermSegments('守护每一次呼吸', [singleCharacterTerm], { mode: 'source' });
  const regularSegments = buildTermSegments('呼吸湿化治疗仪、糖萼和SDF。', [humidifierTerm, glycocalyxTerm, abbreviationTerm], { mode: 'source' });

  assert.equal(singleCharacterSegments.some(segment => segment.matchedTerm?.id === singleCharacterTerm.id), false);
  assert.deepEqual(
    regularSegments.filter(segment => segment.matchedTerm).map(segment => segment.matchedTerm?.id),
    [humidifierTerm.id, glycocalyxTerm.id, abbreviationTerm.id]
  );
  assert.ok(buildTermSegments('守护每一次呼吸', [explicitlyAllowedSingleCharacter], { mode: 'source' })
    .some(segment => segment.matchedTerm?.id === explicitlyAllowedSingleCharacter.id));
});

test('highlight_enabled false disables every match type', () => {
  const disabledTerms = [
    { ...emergencyStopTerm, highlight_enabled: false },
    { ...phraseTerm, highlight_enabled: false },
    { ...parameterTerm, highlight_enabled: false },
    { ...sentenceTerm, highlight_enabled: false },
    { ...sloganTerm, highlight_enabled: false },
  ];

  assert.equal(buildTermSegments('急停开关 单手操作 氧浓度', disabledTerms, { mode: 'source' })
    .some(segment => segment.matchedTerm), false);
  assert.equal(findStrictReferenceMatches(`${sentenceTerm.chinese_term}。${sloganTerm.chinese_term}`, disabledTerms, { mode: 'source' }).length, 0);
});

test('missing highlight_enabled remains enabled for local and strict matching', () => {
  const localTerm = { ...emergencyStopTerm, highlight_enabled: undefined };
  const referenceTerm = { ...sentenceTerm, highlight_enabled: undefined };

  assert.ok(buildTermSegments('急停开关', [localTerm], { mode: 'source' })
    .some(segment => segment.matchedTerm?.id === localTerm.id));
  assert.equal(findStrictReferenceMatches(referenceTerm.chinese_term, [referenceTerm], { mode: 'source' }).length, 1);
});

test('local overlap prefers highlight_weight, then longer text, then source order', () => {
  const lowerWeightLonger = { ...emergencyStopTerm, id: 'lower-weight-longer', chinese_term: '舌下微循环成像系统', highlight_weight: 1 };
  const higherWeightShorter = { ...emergencyStopTerm, id: 'higher-weight-shorter', chinese_term: '微循环', highlight_weight: 2 };
  const equalWeightShort = { ...emergencyStopTerm, id: 'equal-weight-short', chinese_term: '舌下微循环', highlight_weight: 2 };
  const equalWeightLonger = { ...lowerWeightLonger, id: 'equal-weight-longer', highlight_weight: 2 };
  const equalTextFirst = { ...emergencyStopTerm, id: 'equal-text-first', chinese_term: '急停开关', highlight_weight: 2 };
  const equalTextSecond = { ...emergencyStopTerm, id: 'equal-text-second', chinese_term: '急停开关', highlight_weight: 2 };

  const weighted = buildTermSegments('舌下微循环成像系统', [lowerWeightLonger, higherWeightShorter], { mode: 'source' });
  assert.equal(weighted.find(segment => segment.matchedTerm)?.matchedTerm?.id, higherWeightShorter.id);

  const equalWeight = buildTermSegments('舌下微循环成像系统', [equalWeightLonger, equalWeightShort], { mode: 'source' });
  assert.equal(equalWeight.find(segment => segment.matchedTerm)?.matchedTerm?.id, equalWeightLonger.id);

  const sourceOrder = buildTermSegments('急停开关', [equalTextFirst, equalTextSecond], { mode: 'source' });
  assert.equal(sourceOrder.find(segment => segment.matchedTerm)?.matchedTerm?.id, equalTextFirst.id);
});

test('strict references include slogans but do not match partial slogans', () => {
  const full = findStrictReferenceMatches(sloganTerm.chinese_term, [sloganTerm], { mode: 'source' });
  const partial = findStrictReferenceMatches('每一次呼吸', [sloganTerm], { mode: 'source' });

  assert.equal(full.length, 1);
  assert.equal(full[0].referenceType, 'slogan');
  assert.equal(partial.length, 0);
});

test('strict reference matching normalizes whitespace, punctuation, width, and case', () => {
  const fullWidthSentence = { ...sentenceTerm, id: 'full-width-sentence', chinese_term: 'ＡＣ电源开启。', english_term: 'Connect THE ac power supply.' };

  assert.equal(findStrictReferenceMatches('AC 电源\n开启', [fullWidthSentence], { mode: 'source' }).length, 1);
  assert.equal(findStrictReferenceMatches('connect the AC power supply', [fullWidthSentence], { mode: 'translation' }).length, 1);
});

test('strict reference overlaps prefer the longer complete range', () => {
  const shortSentence = { ...sentenceTerm, id: 'short-sentence', chinese_term: '连接交流电源。' };
  const longSentence = { ...sentenceTerm, id: 'long-sentence', chinese_term: '连接交流电源，按照急停开关旋转按钮。' };
  const matches = findStrictReferenceMatches(longSentence.chinese_term, [shortSentence, longSentence], { mode: 'source' });

  assert.deepEqual(matches.map(match => match.term.id), [longSentence.id]);
});

test('strict reference ranges retain inner term, phrase, and parameter highlights', () => {
  const overlaySentence = {
    ...sentenceTerm,
    id: 'overlay-sentence',
    chinese_term: '急停开关支持单手操作，可设置氧浓度。',
    highlight_enabled: true,
  };
  const matches = findStrictReferenceMatches(overlaySentence.chinese_term, [overlaySentence], { mode: 'source' });
  const innerSegments = buildTermSegments(matches[0].text, [emergencyStopTerm, phraseTerm, parameterTerm], { mode: 'source' });

  assert.deepEqual(
    innerSegments.filter(segment => segment.matchedTerm).map(segment => segment.visualType),
    ['term', 'phrase', 'parameter']
  );
});

test('strict references match comma-connected sentence and slogan chains without including commas', () => {
  const sentenceB = { ...sentenceTerm, id: 'sentence-b', chinese_term: '请确认设备状态。', english_term: 'Please confirm the device status.', highlight_enabled: true };
  const sentenceC = { ...sentenceTerm, id: 'sentence-c', chinese_term: '然后开始治疗。', english_term: 'Then begin treatment.', highlight_enabled: true };
  const withoutFinalPunctuation = (value: string) => value.replace(/[。.!?！？]$/, '');

  const chineseComma = findStrictReferenceMatches(`${withoutFinalPunctuation(sentenceTerm.chinese_term)}，${sentenceB.chinese_term}`, [sentenceTerm, sentenceB], { mode: 'source' });
  const englishComma = findStrictReferenceMatches(`${withoutFinalPunctuation(sentenceTerm.chinese_term)}, ${sentenceB.chinese_term}`, [sentenceTerm, sentenceB], { mode: 'source' });
  const chain = findStrictReferenceMatches(`${withoutFinalPunctuation(sentenceTerm.chinese_term)}，${withoutFinalPunctuation(sentenceB.chinese_term)},${sentenceC.chinese_term}`, [sentenceTerm, sentenceB, sentenceC], { mode: 'source' });
  const mixed = findStrictReferenceMatches(`${withoutFinalPunctuation(sentenceTerm.chinese_term)}，${sloganTerm.chinese_term}`, [sentenceTerm, sloganTerm], { mode: 'source' });

  assert.equal(chineseComma.length, 2);
  assert.equal(englishComma.length, 2);
  assert.equal(chain.length, 3);
  assert.deepEqual(mixed.map(match => match.referenceType), ['sentence', 'slogan']);
  assert.ok(chineseComma.every(match => !match.text.endsWith('，')));
  assert.ok(englishComma.every(match => !match.text.endsWith(',')));
});

test('ordinary commas and extra text do not create strict reference matches', () => {
  const sentenceB = { ...sentenceTerm, id: 'sentence-b', chinese_term: '请确认设备状态。', english_term: 'Please confirm the device status.', highlight_enabled: true };
  const withoutFinalPunctuation = (value: string) => value.replace(/[。.!?！？]$/, '');

  assert.equal(findStrictReferenceMatches('连接交流电源，按照急停开关旋转按钮。', [sentenceTerm], { mode: 'source' }).length, 1);
  assert.equal(findStrictReferenceMatches(`${withoutFinalPunctuation(sentenceTerm.chinese_term)}，额外说明，${sentenceB.chinese_term}`, [sentenceTerm, sentenceB], { mode: 'source' }).length, 0);
});
