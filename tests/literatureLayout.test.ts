import { describe, expect, it } from 'vitest';
import type { PdfBlock } from '../services/literature';
import { planLiteratureLayout, wrapLayoutText } from '../services/literatureLayout';

const body = (id:number,x:number,y:number,height:number,readingZone:PdfBlock['readingZone']='left'):PdfBlock =>
  ({id,x,y,width:190,height,fontSize:10,text:`Paragraph ${id}`,kind:'body',readingZone});
const measure = (text:string) => [...text].length*8;
const sheet = (blocks:PdfBlock[], images=[] as {x:number;y:number;width:number;height:number}[]) =>
  ({width:550,height:270,blocks,images});

describe('translated literature pagination',()=>{
  it('uses shared column space when a translation needs more rows than its source box',()=>{
    const page = sheet([body(0,40,35,12),body(1,40,50,85),body(2,290,35,20,'right')]);
    const layout = planLiteratureLayout(page,{0:'甲'.repeat(40),1:'乙'.repeat(40),2:'丙'.repeat(20)},measure);
    const first = layout.placed.get(0)!, second = layout.placed.get(1)!, third = layout.placed.get(2)!;
    expect(first.height).toBeGreaterThan(page.blocks[0].height);
    expect(second.y).toBeGreaterThan(first.y+first.height);
    expect(second.x+second.width).toBeLessThan(third.x);
    expect(layout.continuations).toEqual([]);
  });

  it('preserves reading order after an overflow and marks the first break',()=>{
    const footer = {...body(3,40,140,12,'wide'),kind:'metadata' as const,width:460,retainSource:true};
    const page = sheet([body(0,40,40,12),body(1,40,58,70),body(2,290,40,20,'right'),footer]);
    const layout = planLiteratureLayout(page,{0:'第一段',1:'较长的第二段'.repeat(60),2:'第三段'},measure);
    expect([...layout.placed.keys()]).toEqual([0]);
    expect(layout.continuations.map(n=>[n.id,n.kind])).toEqual([[1,'overflow'],[2,'overflow']]);
    expect(layout.continuations[0].anchor).toBeDefined();
    expect(layout.continuations[1].anchor).toBeUndefined();
    expect(layout.labels.filter(l=>l.marker).map(l=>l.lines)).toEqual([['见续页']]);
  });

  it('keeps a title badge and chart untouched while placing a gray-zone annotation beside the caption',()=>{
    const title = {...body(0,40,30,44,'wide'),width:470,fontSize:20};
    const caption = {...body(1,40,185,12,'wide'),text:'Figure caption',kind:'caption' as const,width:350};
    const note = {...body(2,280,150,8),text:'GREY ZONE',imageText:true,width:90};
    const images = [{x:480,y:28,width:40,height:32},{x:65,y:100,width:410,height:78}];
    const layout = planLiteratureLayout(sheet([title,caption,note],images),{0:'这是中文标题',1:'图一说明',2:'灰区'},measure);
    const noteLabel = layout.labels.find(label=>label.lines[0]==='GREY ZONE · 灰区')!;
    expect(layout.placed.has(0)).toBe(true);
    expect(noteLabel.rect.y).toBeGreaterThan(images[1].y+images[1].height);
    expect(layout.masks.some(r=>r.x+r.width>480 && r.y<60)).toBe(false);
    expect(layout.placed.has(2)).toBe(false);
  });

  it('keeps a retained or unresolved block outside the translation layer and preserves Latin terms at wraps',()=>{
    const reference = {...body(0,290,50,20,'right'),kind:'reference' as const,retainSource:true};
    const page = sheet([reference,body(1,40,50,20),{...body(2,40,90,20),imageText:true}]);
    const layout = planLiteratureLayout(page,{1:'【待核对：数字不符】 123'},measure);
    expect(layout.masks).toEqual([]);
    expect(layout.continuations.map(n=>n.kind)).toEqual(['review','pending']);
    expect(wrapLayoutText('保持 PPV 和 SVV',40,measure)).toEqual(['保持','PPV 和','SVV']);
    expect(wrapLayoutText('甲乙，丙。',16,measure)).toEqual(['甲','乙，','丙。']);
  });
});
