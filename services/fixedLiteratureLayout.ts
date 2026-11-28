import { wrapLayoutText, type LayoutRect } from './literatureLayout';
import type { LiteraturePage } from './literaturePdf';

export type FixedLayout = {placed:Map<number,LayoutRect>; canExpand:Set<number>};

function palette(pixels:Uint8ClampedArray) {
  const counts=new Map<number,number>();
  let ink=0,accent=0,background=0xffffff,inkCount=0,accentCount=0,bgCount=0;
  for(let i=0;i<pixels.length;i+=4){
    const [r,g,b]=[pixels[i],pixels[i+1],pixels[i+2]];
    const color=(r<<16)|(g<<8)|b;
    const count=(counts.get(color)??0)+1;
    counts.set(color,count);
    if(count>bgCount){background=color;bgCount=count;}
    if(Math.max(r,g,b)<150 && count>inkCount){ink=color;inkCount=count;}
    if(b>r+48 && b>g+25 && count>accentCount){accent=color;accentCount=count;}
  }
  const css=(color:number)=>'#'+color.toString(16).padStart(6,'0');
  return {paper:css(background),ink:css(inkCount?ink:accent),accent:css(accentCount?accent:ink)};
}

export function drawFixedPage(ctx:CanvasRenderingContext2D,page:LiteraturePage,values:Record<number,string>,
  sx:number,sy:number,expanded:readonly number[]):FixedLayout {
  const placed=new Map<number,LayoutRect>(),canExpand=new Set<number>();
  ctx.save();ctx.scale(sx,sy);ctx.textBaseline='top';
  for(const b of page.blocks){
    const text=values[b.id];
    placed.set(b.id,b);
    if(!text || text.startsWith('【有意保留原文】') || b.width<=0 || b.height<=0)continue;
    const sourceSize=Math.max(1,b.fontSize);
    const family=b.serif?'"Noto Serif CJK SC",SimSun,serif':'"Microsoft YaHei",sans-serif';
    const font=(size:number)=>`${size}px ${family}`;
    const linesAt=(size:number)=>{
      ctx.font=font(size);
      return wrapLayoutText(text,b.width,t=>ctx.measureText(t).width);
    };
    const rows=linesAt(sourceSize);
    const needed=rows.length*sourceSize*1.1;
    const below=[...page.blocks.filter(other=>other!==b),...page.images]
      .filter(r=>r.x<b.x+b.width && r.x+r.width>b.x && r.y+r.height>b.y+b.height+.1);
    const limit=Math.min(page.height,...below.map(r=>Math.max(b.y+b.height,r.y-1)));
    if(needed>b.height && needed<=limit-b.y)canExpand.add(b.id);
    const height=expanded.includes(b.id)&&canExpand.has(b.id)?needed:b.height;
    const box={x:b.x,y:b.y,width:b.width,height};
    placed.set(b.id,box);
    let size=sourceSize,lines=rows;
    while(lines.length*size*1.1>height && size>.2){size*=.9;lines=linesAt(size);}
    const colors=palette(ctx.getImageData(Math.floor(b.x*sx),Math.floor(b.y*sy),
      Math.max(1,Math.ceil(b.width*sx)),Math.max(1,Math.ceil(b.height*sy))).data);
    ctx.save();ctx.beginPath();ctx.rect(b.x,b.y,b.width,height);ctx.clip();
    ctx.fillStyle=colors.paper;ctx.fillRect(b.x,b.y,b.width,height);
    ctx.font=font(size);
    // Determine the colour before wrapping so long URLs stay coloured on the next line.
    const compact=text.replace(/\s/g,'');
    const colored=[...compact.matchAll(/https?:\/\/[^\u3000-\u9fff\s]+|\b10\.\d{4,9}\/[^\u3000-\u9fff\s]+|\[[\d,，–-]+\]/gi)];
    let offset=0;
    lines.forEach((line,i)=>{
      let x=b.x;
      for(const char of line){
        const marked=colored.some(m=>offset>=m.index! && offset<m.index!+m[0].length);
        ctx.fillStyle=marked?colors.accent:colors.ink;
        ctx.fillText(char,x,b.y+i*size*1.1);
        x+=ctx.measureText(char).width;
        if(char.trim())offset++;
      }
    });
    ctx.restore();
  }
  ctx.restore();
  return {placed,canExpand};
}
