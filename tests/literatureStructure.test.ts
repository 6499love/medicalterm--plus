import { describe, expect, it } from 'vitest';
import { planLiteratureLayout } from '../services/literatureLayout';
import { borderedArtwork, structureLiteraturePage } from '../services/literatureStructure';

const line = (text: string, x: number, y: number, width = 234, fontSize = 9.8) =>
  ({text,x,y,width,height:fontSize*1.15,fontSize});

describe('browser literature reading zones', () => {
  it('reads the left column through to the right continuation before a full-width footer', () => {
    const blocks = structureLiteraturePage([
      line('Page-wide abstract',56.7,250,435),
      line('Right continuation',304.7,286),
      line('Left start',56.7,286),
      line('Right content',312.7,310,226),
      line('Left end, continued across the gutter',64.7,334,225),
      line('© Article license',180.5,675,355,7),
    ],595.276,790.866,[]);
    expect(blocks.map(b=>[b.readingZone,b.text])).toEqual([
      ['wide','Page-wide abstract'],['left','Left start'],['left','Left end, continued across the gutter'],
      ['right','Right continuation'],['right','Right content'],['wide','© Article license'],
    ]);
    expect(blocks.at(-1)?.kind).toBe('metadata');
  });

  it('keeps identifiers while allowing publication labels and explanatory footnotes to be translated', () => {
    const blocks = structureLiteraturePage([
      line('Critical Care',477,30,62,12.5),
      line('Michard https://doi.org/10.1186/s13054-023-04765-3',56.6,31,149,8),
      line('Page 2 of 3',500,52,40,8),
      line('MATTERS ARISING',62,88,118,13),
      line('Open Access',463,88,73,13),
      line('Meta-analysis of pulse pressure variation',57,115,405,24),
      line('Frederic Michard and Jean-Louis Teboul',57,151,200,11),
      line('This comment refers to the article available online at https://doi.org/10.1186/s13054-023-04706-0.',57,581,229,7.5),
      line('*Correspondence: Frederic Michard',57,604,90,7.5),
      line('1 MiCo, Vallamand, Switzerland',57,630,91,5.3),
      line('© The Author(s) 2023. This article is licensed under a Creative Commons license.',180,675,355,7),
      line('Received: 24 November 2023 Accepted: 28 November 2023',305,430,187,7.5),
    ],595.276,790.866,[]);
    expect(blocks.filter(b=>b.retainSource).map(b=>b.text)).toEqual([
      'Critical Care','Michard https://doi.org/10.1186/s13054-023-04765-3',
      'Frederic Michard and Jean-Louis Teboul','1 MiCo, Vallamand, Switzerland',
    ]);
    for (const start of ['MATTERS ARISING','Open Access','This comment','*Correspondence','© The Author(s)','Received:']) {
      expect(blocks.find(b=>b.text.startsWith(start))).toMatchObject({kind:'metadata'});
    }
    const topOfPage = structureLiteraturePage([line('Page 2 of 3',502,31,36,8)],595.276,790.866,[]);
    expect(topOfPage[0].kind).toBe('header');
    expect(topOfPage[0].retainSource).not.toBe(true);
  });

  it('keeps individually numbered references separate from neighboring prose and glosses', () => {
    const blocks = structureLiteraturePage([
      line('Left prose',56.7,429),line('Another left line',56.7,452),
      line('References',304.7,476,36,7.5),
      line('1.',305.7,485,5,7.5),line('A First reference',319.7,485,211,7.5),
      line('continuation of the first reference',319.7,494,218,7.5),
      line('Abbreviations',56.7,498,45,7.5),
      line('PPV',56.7,507,11,7.5),line('Pulse pressure variation',80.4,507,70,7.5),
      line('2.',305.7,512,5,7.5),line('B Second reference',319.7,512,213,7.5),
      line('SVV',56.7,516,11,7.5),line('Stroke volume variation',80.4,516,71,7.5),
    ],595.276,790.866,[]);
    expect(blocks.filter(b=>b.kind==='reference').map(b=>[b.readingZone,b.text,b.retainSource===true])).toEqual([
      ['right','References',false],['right','1. A First reference continuation of the first reference',true],
      ['right','2. B Second reference',true],
    ]);
    expect(blocks.find(b=>b.text.startsWith('Abbreviations'))?.text)
      .toBe('Abbreviations\nPPV: Pulse pressure variation\nSVV: Stroke volume variation');
  });

  it('preserves dense native paths and labels without swallowing the figure caption', () => {
    const figureCaption = line('Figure 2 The confidence intervals.',63,420,410,8);
    const label = line('STUDY ID',100,120,30,5);
    const paths = Array.from({length:48}, (_,i) => ({x:55,y:89+i*6.7,width:480,height:1}));
    const images = borderedArtwork([label,figureCaption],paths,595);
    expect(images).toHaveLength(1);
    expect(images[0].y+images[0].height).toBeLessThan(figureCaption.y);
    expect(structureLiteraturePage([label,figureCaption],595,794,images).map(b=>[b.kind,b.text,b.retainSource===true]))
      .toEqual([['figure','STUDY ID',true],['caption',figureCaption.text,false]]);
    expect(borderedArtwork([figureCaption],paths.slice(0,3),595)).toEqual([]);
  });

  it('keeps the searchable text layer of a scanned page eligible for translation', () => {
    const background = {x:0,y:0,width:595,height:794};
    const prose = line('This paragraph is searchable text on a scan.',60,180);
    const blocks = structureLiteraturePage([prose],595,794,[background]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({kind:'body',text:prose.text});
    expect(blocks[0].retainSource).not.toBe(true);

    const translation = '扫描页上这段文字可以搜索。';
    const layout = planLiteratureLayout({width:595,height:794,images:[background],blocks},
      {[blocks[0].id]:translation}, text => text.length * 8);
    expect(layout.masks).toEqual([]);
    expect(layout.continuations).toEqual([expect.objectContaining({text:translation})]);
  });
});
