// PDF text runs often introduce spaces around DOI punctuation at line breaks.
export function normalizePdfLinks(text:string, annotatedUrls:readonly string[]=[]):string {
  // Match only the visible address; never substitute a different link target.
  for (const url of annotatedUrls) {
    if (url.length>2048 || !text.replace(/\s/g,'').includes(url)) continue;
    let offset=0;
    const positions:number[]=[];
    let compact='';
    for (const char of text) {
      if (char.trim()) { compact+=char; for(let i=0;i<char.length;i++)positions.push(offset+i); }
      offset+=char.length;
    }
    for(let i=compact.lastIndexOf(url);i>=0;){
      text=text.slice(0,positions[i])+url+text.slice(positions[i+url.length-1]+1);
      if (!i) break;
      i=compact.lastIndexOf(url,i-1);
    }
  }
  return text.replace(/https?\s*:\s*\/\s*\/\s*doi\s*\.\s*org\s*\/\s*10\s*\.\s*\d{4,9}\s*\/\s*[\w]+(?:\s*[-./_]\s*[\w]+)*/gi,
    link=>link.replace(/\s+/g,''));
}

export function protectPdfLinks(source:string) {
  const links:string[]=[];
  const text=normalizePdfLinks(source).replace(/(?:https?:\/\/|www\.)[^\s<>"，。；]+|\b10\.\d{4,9}\/[^\s<>"，。；]+/gi,match=>{
    const link=match.replace(/[.,;:!?]+$/,'');
    const token=`⟦LINK_${links.length}⟧`;
    links.push(link);
    return token+match.slice(link.length);
  });
  return {text,maskKnown(value:string):string {
    for (const [i,link] of links.entries()) value=value.replace(link,`⟦LINK_${i}⟧`);
    return value;
  },restore(value:string):string|undefined {
    if (!links.length) return value;
    if (links.some((_,i)=>value.split(`⟦LINK_${i}⟧`).length!==2)) return;
    return value.replace(/⟦LINK_(\d+)⟧/g,(token,i)=>links[Number(i)]??token);
  }};
}
