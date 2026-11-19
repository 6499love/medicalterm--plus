import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { getDocument, readLiteraturePage, readLiteraturePageStructure, type PDFDocumentProxy } from '../services/literaturePdf';
import { browserConnectionError, checkBrowserConnection, drawTranslatedLayout, exportBrowserPdf, literatureModelConfig, preserveSource, recognizePage, resultCounts, reviewBrowserTranslation, type BrowserPage } from '../services/browserLiterature';
import { prepareLiteratureTranslationBlocks, translateLiteratureBatches, LiteratureBatchError } from '../services/literatureTranslation';
import { translatePublicationLabel, type PdfBlock } from '../services/literature';
import type { TranslatedLayout } from '../services/literatureLayout';
import { drawLiteratureContinuation, prepareLiteratureContinuations, type ContinuationSheet } from '../services/literatureContinuation';
import { fetchSystemTerms } from '../services/search';
import LiteratureModelSettings from './LiteratureModelSettings';
import './literature.css';
import './browserLiterature.css';

const emptyTranslations: Record<number,string> = {};

function Continuation({sheet,page,number,index}: {sheet:ContinuationSheet; page:BrowserPage; number:number; index:number}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    if(canvas.current) drawLiteratureContinuation(canvas.current,sheet,page.width,page.height,number,index);
  },[sheet,page,number,index]);
  return <>
    <canvas ref={canvas} className="lit-layout-canvas" aria-hidden="true" />
    <div className="lit-sr-only">{sheet.notes.map(({id,label,text})=><p key={id}>{label}：{text}</p>)}</div>
  </>;
}

export default function BrowserLiterature() {
  const auth = useStore(s=>s.literatureAuth), terms = useStore(s=>s.userTerms);
  const pdf = useRef<PDFDocumentProxy|null>(null), alive = useRef(true), stop = useRef(false);
  const metadata = useRef(new Map<number,Omit<BrowserPage,'image'>>());
  const results = useRef<Record<number,Record<number,string>>>({});
  const [page,setPage]=useState<BrowserPage|null>(null), [number,setNumber]=useState(1);
  const [name,setName]=useState(''), [total,setTotal]=useState(0), [busy,setBusy]=useState('');
  const [error,setError]=useState(''), [revision,setRevision]=useState(0), [selected,setSelected]=useState<number|null>(null);
  const [ocr,setOcr]=useState(true);
  const [connection,setConnection]=useState('');
  const [view,setView]=useState<'layout'|'text'>('layout');
  const translatedCanvas=useRef<HTMLCanvasElement>(null);
  const [rendered,setRendered]=useState<{page:BrowserPage; translations:Record<number,string>; layout:TranslatedLayout; sheets:ContinuationSheet[]}|null>(null);
  const translated=results.current[number]||emptyTranslations;
  const preview=rendered?.page===page&&rendered.translations===translated?rendered:null;
  useEffect(()=>{
    const canvas=translatedCanvas.current;
    if (!page || !canvas || view!=='layout') return;
    let active=true;
    // Clear the previous page while the new image is being decoded.
    canvas.width=canvas.height=0;
    const image=new Image();
    image.src=page.image;
    void image.decode().then(()=>{
      if(!active)return;
      const layout=drawTranslatedLayout(canvas,page,image,translated);
      setRendered({page,translations:translated,layout,sheets:prepareLiteratureContinuations(layout.continuations,page.width,page.height)});
    }).catch(()=>{if(active)setRendered(null);});
    return ()=>{active=false;};
  },[page,translated,view]);
  useEffect(()=>{setConnection('');setError('');},[auth]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;stop.current=true;void pdf.current?.destroy();};},[]);
  const current=()=>alive.current&&!stop.current;
  async function read(n:number): Promise<BrowserPage> {
    const saved=metadata.current.get(n);
    const fresh=await readLiteraturePage(pdf.current!,n,saved);
    return saved ? {...fresh,...saved} : fresh;
  }
  async function blocksAt(n:number) {
    if (n<1 || n>total) return undefined;
    const saved=metadata.current.get(n);
    if (saved) return saved.blocks;
    const structure=await readLiteraturePageStructure(pdf.current!,n);
    metadata.current.set(n,structure);
    return structure.blocks;
  }
  function save(n:number,value:BrowserPage) {
    const {image,...data}=value; metadata.current.set(n,data);
    if(current()){setPage(value);setNumber(n);setSelected(null);}
  }
  async function open(file?:File) {
    if(!file||busy)return;
    if(file.size>20*1024*1024||!file.name.toLowerCase().endsWith('.pdf')){setError('请选择20 MB以内的PDF');return;}
    stop.current=false;setBusy('读取PDF…');setError('');setPage(null);setTotal(0);metadata.current.clear();results.current={};
    try{
      await pdf.current?.destroy();pdf.current=null;
      const task=getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});
      task.onPassword=()=>{void task.destroy();};
      const document=await task.promise;
      if(!current()){await document.destroy();return;}
      if(document.numPages>100){await document.destroy();throw new Error('请拆分为100页以内的PDF');}
      pdf.current=document;setName(file.name);setTotal(document.numPages);save(1,await read(1));
    }catch{if(alive.current)setError('无法读取PDF，请检查文件是否损坏、加密或超过100页。');}
    finally{if(alive.current)setBusy('');}
  }
  async function process(all:boolean) {
    if(!pdf.current||!auth?.apiKey||busy)return;
    const modelConfig=literatureModelConfig(auth);
    stop.current=false;setError('');setBusy('准备浏览器翻译…');
    try{
      setConnection('');
      if(modelConfig.browserDirect){
        setBusy('先检查模型能否从网页直连…');
        await checkBrowserConnection(auth);
        if(!current())return;
        setConnection('模型连接检查通过；全文翻译仍可能遇到限额或超时。');
      }
      const glossary=[...terms,...await fetchSystemTerms()];
      for(let n=all?1:number;n<=(all?total:number);n++){
        if(!current())break;
        setBusy(`读取第${n}/${total}页…`);let value=await read(n);
        if(ocr&&!value.ocrDone){
          value=await recognizePage(value,message=>{if(current())setBusy(`第${n}页 · ${message}`);});
        }
        if(!current())break;
        save(n,value);
        if(value.blocks.length>200||value.blocks.reduce((s,b)=>s+b.text.length,0)>24000)throw new Error('PAGE_TOO_DENSE');
        const local=Object.fromEntries(value.blocks.flatMap(b=>{
          const text=preserveSource(b)?`【有意保留原文】${b.text}`:translatePublicationLabel(b);
          return text?[[b.id,text]]:[];
        }));
        results.current[n]={...results.current[n],...local};
        setRevision(v=>v+1);
        const previous=await blocksAt(n-1);
        if(!current())break;
        const next=await blocksAt(n+1);
        if(!current())break;
        const prepared=prepareLiteratureTranslationBlocks(value.blocks,previous,next);
        const sources=new Map(prepared.map(block=>[block.id,block]));
        await translateLiteratureBatches(modelConfig,prepared,glossary,results.current[n],result=>{
          if(!current())return;
          results.current[n]=Object.fromEntries(Object.entries(result).map(([id,text])=>{
            if (results.current[n][Number(id)]===text) return [id,text];
            const source=sources.get(Number(id))!;
            const checked=reviewBrowserTranslation(source.text,text);
            return [id,source.continuesOnNextPage && !checked.startsWith('【待核对') ? `${checked}（接下页）` : checked];
          }));
          setRevision(v=>v+1);setBusy(`第${n}/${total}页 · 已处理${Object.keys(result).length}/${value.blocks.length}段`);
        },current);
        setRevision(v=>v+1);
      }
    }catch(cause){if(alive.current)setError(cause instanceof Error&&cause.message==='PAGE_TOO_DENSE'?'本页文字过密，请拆分或先关闭图片识别。':`${browserConnectionError(cause instanceof LiteratureBatchError?cause.original:cause,auth)} 已有结果保留。`);}
    finally{if(alive.current)setBusy('');}
  }
  async function change(n:number){if(busy)return;stop.current=false;setBusy('读取页面…');try{save(n,await read(n));}catch{setError('页面读取失败');}finally{if(alive.current)setBusy('');}}
  async function scan(){if(!page||busy||page.ocrDone)return;stop.current=false;setError('');setBusy('准备图片文字识别…');try{const value=await recognizePage(page,message=>{if(current())setBusy(message);});if(current())save(number,value);}catch{if(alive.current)setError('图片识别失败，可能是识别资源下载失败或内存不足。原文和已有译文保留，可关闭图片识别后翻译正文。');}finally{if(alive.current)setBusy('');}}
  async function exportPdf(){if(busy||!pdf.current)return;stop.current=false;setBusy('准备PDF…');try{await exportBrowserPdf(name,total,read,results.current,setBusy,current);}catch{setError('导出失败，可能内存不足，请使用较小的PDF重试。');}finally{if(alive.current)setBusy('');}}
  const counts=resultCounts(translated,page?.blocks);
  const translationFor=(block:PdfBlock)=>preserveSource(block)?'原文保留':translated[block.id]||'待核对：尚未翻译';
  const selectedBlock=page?.blocks.find(b=>b.id===selected);
  const selectedSheet=preview?.sheets.findIndex(sheet=>sheet.notes.some(note=>note.id===selected)) ?? -1;
  async function checkConnection(){if(!auth?.apiKey||busy)return;stop.current=false;setError('');setConnection('');setBusy('检查模型连接…');try{await checkBrowserConnection(auth);if(current())setConnection('模型连接检查通过；全文翻译仍可能遇到限额或超时。');}catch(cause){if(current())setError(browserConnectionError(cause,auth));}finally{if(alive.current)setBusy('');}}
  return <section className="literature" data-revision={revision}>
    <div className="lit-heading"><div><span className="lit-eyebrow">浏览器处理 · 试验版</span><h2>文献翻译</h2></div></div>
    <div className="lit-notice">PDF、图片识别和导出在浏览器处理。待译文字通过本站转发给智谱。首次 OCR 需要下载识别资源。关闭页面会清除本次结果。</div>
    <LiteratureModelSettings disabled={!!busy} />
    <label>选择PDF（最多20 MB / 100页）<input type="file" accept=".pdf,application/pdf" disabled={!!busy} onChange={e=>{void open(e.target.files?.[0]);e.target.value='';}} /></label>
    {auth?.apiKey&&<p className="lit-actions"><button disabled={!!busy} onClick={()=>void checkConnection()}>检查文献模型连接</button>检查会发送一句短文字，按模型用量计费。</p>}
    {connection&&<p role="status">{connection}</p>}
    <p><label><input type="checkbox" checked={ocr} disabled={!!busy} onChange={e=>setOcr(e.target.checked)} /> 识别图片里的英文（耗时较长）</label></p>
    {error&&<p role="alert" className="lit-error">{error}</p>}
    {busy&&<p role="status">{busy} <button onClick={()=>{stop.current=true;setBusy('正在停止，等待当前步骤结束…');}}>停止后续处理</button></p>}
    {page&&<>
      <div className="lit-toolbar"><strong>{name}</strong><button disabled={!!busy||number<=1} onClick={()=>void change(number-1)}>上一页</button><span>{number}/{total}</span><button disabled={!!busy||number>=total} onClick={()=>void change(number+1)}>下一页</button></div>
      <div className="lit-actions">
        <div className="lit-modes" role="group" aria-label="对照方式">
          <button type="button" aria-pressed={view==='layout'} onClick={()=>setView('layout')}>页面对照</button>
          <button type="button" aria-pressed={view==='text'} onClick={()=>setView('text')}>段落对照</button>
        </div>
        <button disabled={!!busy||page.ocrDone} onClick={()=>void scan()}>仅识别本页图片文字</button>
        <button className="lit-primary" disabled={!!busy||!auth?.apiKey} onClick={()=>void process(false)}>翻译当前页</button>
        <button disabled={!!busy||!auth?.apiKey} onClick={()=>void process(true)}>翻译全文 / 继续</button>
        <button disabled={!!busy} onClick={()=>void exportPdf()}>下载双语PDF</button>
      </div>
      <p className="lit-caption">{page.blocks.length} 个文字区域 · 已翻译 {counts.translated} · 保留原文 {counts.retained} · 待核对 {counts.review}。
        {view==='layout'&&!!preview?.sheets.length&&!!Object.keys(translated).length&&<> <a className="lit-link" href="#lit-continuation-1">查看续页（{preview.sheets.length}）</a>。</>}
        {page.ocrDone?` 图片识别完成，${page.ocrLowConfidence||0} 处低可信结果未采用。`:' 图表保留原貌，图片文字尚未识别。'}
        {!page.blocks.length&&' 本页没有提取到文字，请检查原页。'} 请核对医学内容与数字。</p>
      {view==='layout'?<>
        <div className="lit-spread">
          {(['原文','中文译页'] as const).map((label,i)=><div key={label}>
            <h3>{label}</h3>
            <div className="lit-paper" style={{aspectRatio:`${page.width}/${page.height}`}}>
              <img src={page.image} alt={`第${number}页${label}`} />
              {i===1&&<canvas ref={translatedCanvas} className="lit-layout-canvas" aria-hidden="true" />}
              {i===1&&!Object.keys(translated).length&&<div className="lit-wait">点击「翻译当前页」生成译文</div>}
              {page.blocks.map(b=>{
                const rect=i===0||preserveSource(b)?b:preview?.layout.placed.get(b.id) ?? preview?.layout.continuations.find(note=>note.id===b.id)?.anchor;
                return rect&&<button key={b.id} type="button" className={`lit-hit ${selected===b.id?'selected':''}`}
                aria-label={`${label}第${b.id+1}段`} onClick={()=>setSelected(b.id)}
                style={{left:`${rect.x/page.width*100}%`,top:`${rect.y/page.height*100}%`,width:`${rect.width/page.width*100}%`,height:`${rect.height/page.height*100}%`}} />;
              })}
            </div>
          </div>)}
        </div>
        {selectedBlock&&<div className="lit-detail lit-paragraphs" aria-live="polite">
          <h3>第 {selectedBlock.id+1} 段 {selectedSheet>=0&&<a className="lit-link" href={`#lit-continuation-${selectedSheet+1}`}>在续页查看</a>}</h3>
          <div><p><small>英文原文</small>{selectedBlock.text}</p><p><small>中文译文</small>{translationFor(selectedBlock)}</p></div>
        </div>}
        {!!Object.keys(translated).length&&preview?.sheets.map((sheet,index)=><div className="lit-spread lit-continuation" id={`lit-continuation-${index+1}`} key={index}>
          <div><h3>原文 · 第 {number} 页</h3><div className="lit-paper" style={{aspectRatio:`${page.width}/${page.height}`}}>
            <img src={page.image} alt={`原文第 ${number} 页（对照）`} loading="lazy" />
          </div></div>
          <div><h3>中文译页 · 续页 {index+1}</h3><div className="lit-paper" style={{aspectRatio:`${page.width}/${page.height}`}}>
            <Continuation sheet={sheet} page={page} number={number} index={index} />
          </div></div>
        </div>)}
      </>:<div className="lit-paragraphs">{page.blocks.map(b=><div key={b.id}>
        <p><small>第 {b.id+1} 段 · 英文原文</small>{b.text}</p><p><small>中文译文</small>{translationFor(b)}</p>
      </div>)}</div>}
    </>}
  </section>;
}
