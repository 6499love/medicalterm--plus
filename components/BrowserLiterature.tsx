import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { getDocument, readLiteraturePage, type PDFDocumentProxy } from '../services/literaturePdf';
import { browserConnectionError, checkBrowserConnection, exportBrowserPdf, literatureModelConfig, numbersMatch, preserveSource, recognizePage, resultCounts, type BrowserPage } from '../services/browserLiterature';
import { translateLiteratureBatches, LiteratureBatchError } from '../services/literatureTranslation';
import type { PageRoute } from '../types';
import { fetchSystemTerms } from '../services/search';
import './literature.css';

export default function BrowserLiterature({ onNavigate }: { onNavigate: (route: PageRoute) => void }) {
  const auth = useStore(s=>s.auth), terms = useStore(s=>s.userTerms);
  const pdf = useRef<PDFDocumentProxy|null>(null), alive = useRef(true), stop = useRef(false);
  const metadata = useRef(new Map<number,Omit<BrowserPage,'image'>>());
  const results = useRef<Record<number,Record<number,string>>>({});
  const [page,setPage]=useState<BrowserPage|null>(null), [number,setNumber]=useState(1);
  const [name,setName]=useState(''), [total,setTotal]=useState(0), [busy,setBusy]=useState('');
  const [error,setError]=useState(''), [revision,setRevision]=useState(0), [selected,setSelected]=useState<number|null>(null);
  const [ocr,setOcr]=useState(true);
  const [connection,setConnection]=useState('');
  useEffect(()=>setConnection(''),[auth]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;stop.current=true;void pdf.current?.destroy();};},[]);
  const current=()=>alive.current&&!stop.current;
  async function read(n:number): Promise<BrowserPage> {
    const fresh=await readLiteraturePage(pdf.current!,n), saved=metadata.current.get(n);
    return saved ? {...fresh,...saved} : fresh;
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
        const retained=Object.fromEntries(value.blocks.filter(b=>preserveSource(b.text)).map(b=>[b.id,`【有意保留原文】${b.text}`]));
        results.current[n]={...retained,...results.current[n]};
        await translateLiteratureBatches(modelConfig,value.blocks,glossary,results.current[n],result=>{
          if(!current())return;
          results.current[n]=Object.fromEntries(Object.entries(result).map(([id,text])=>{
            const source=value.blocks.find(b=>b.id===Number(id))!.text;
            return [id,numbersMatch(source,text)?text:`【待核对：译文数字不一致，保留原文】${source}`];
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
  const translated=results.current[number]||{};
  const counts=resultCounts(translated);
  async function checkConnection(){if(!auth?.apiKey||busy)return;stop.current=false;setError('');setConnection('');setBusy('检查模型连接…');try{await checkBrowserConnection(auth);if(current())setConnection('模型连接检查通过；全文翻译仍可能遇到限额或超时。');}catch(cause){if(current())setError(browserConnectionError(cause,auth));}finally{if(alive.current)setBusy('');}}
  return <section className="literature" data-revision={revision}>
    <div className="lit-heading"><div><span className="lit-eyebrow">浏览器处理 · 试验版</span><h2>文献翻译</h2><p>原图完整保留，中文按编号对照。</p></div></div>
    <div className="lit-notice">PDF、图片识别和导出在浏览器处理。默认智谱通过本站转发待译文字，其他配置由浏览器连接模型。模型可能产生调用费用。首次OCR需要下载识别资源。关闭页面会清除本次结果。</div>
    <label>选择PDF（最多20 MB / 100页）<input type="file" accept=".pdf,application/pdf" disabled={!!busy} onChange={e=>{void open(e.target.files?.[0]);e.target.value='';}} /></label>
    {!auth?.apiKey&&<p><button onClick={()=>onNavigate('settings')}>前往设置填写模型Key</button></p>}
    {auth?.apiKey&&<p><button disabled={!!busy} onClick={()=>void checkConnection()}>检查模型连接</button> · 当前服务：{auth.provider}。检查会发送一句短文字，可能使用模型额度。</p>}
    {connection&&<p role="status">{connection}</p>}
    <p><label><input type="checkbox" checked={ocr} disabled={!!busy} onChange={e=>setOcr(e.target.checked)} /> 识别图片里的英文（耗时较长）</label></p>
    {error&&<p role="alert" className="lit-error">{error}</p>}
    {busy&&<p role="status">{busy} <button onClick={()=>{stop.current=true;setBusy('正在停止，等待当前步骤结束…');}}>停止后续处理</button></p>}
    {page&&<>
      <div className="lit-toolbar"><strong>{name}</strong><button disabled={!!busy||number<=1} onClick={()=>void change(number-1)}>上一页</button><span>{number}/{total}</span><button disabled={!!busy||number>=total} onClick={()=>void change(number+1)}>下一页</button></div>
      <div className="lit-actions"><button disabled={!!busy||page.ocrDone} onClick={()=>void scan()}>仅识别本页图片文字</button><button disabled={!!busy||!auth?.apiKey} onClick={()=>void process(false)}>翻译当前页</button><button disabled={!!busy||!auth?.apiKey} onClick={()=>void process(true)}>翻译全文 / 继续</button><button disabled={!!busy} onClick={()=>void exportPdf()}>下载双语PDF</button></div>
      <p className="lit-caption">{page.blocks.length}个文字区域 · 已翻译{counts.translated}个 · 有意保留{counts.retained}个 · 待核对{counts.review}个。{page.ocrDone?`图片识别完成；${page.ocrLowConfidence||0}处低可信结果未采用。`:'图片文字尚未识别。'} OCR可能漏字；数字检查不能代替医学内容校对。PDF导出为图片式对照页，未翻译部分会标明。</p>
      <div className="lit-spread"><div><h3>原文 · 点编号定位对照</h3><div className="lit-paper" style={{aspectRatio:`${page.width}/${page.height}`}}><img src={page.image} alt={`第${number}页原文`} />{page.blocks.map(b=><button key={b.id} className={`lit-hit ${selected===b.id?'selected':''}`} aria-label={`查看段落${b.id+1}`} onClick={()=>{setSelected(b.id);document.getElementById(`browser-block-${b.id}`)?.scrollIntoView({block:'nearest',behavior:'smooth'});}} style={{left:`${b.x/page.width*100}%`,top:`${b.y/page.height*100}%`,width:`${b.width/page.width*100}%`,height:`${b.height/page.height*100}%`}} />)}</div></div>
      <div style={{maxHeight:'80vh',overflowY:'auto'}}><h3>中文对照 · 请复核</h3>{page.blocks.map(b=><article id={`browser-block-${b.id}`} key={b.id} style={{padding:12,marginBottom:8,background:selected===b.id?'#e0edff':'white',borderRadius:8}}><strong>#{b.id+1}</strong><p>{translated[b.id]||(preserveSource(b.text)?'有意保留原文':'尚未翻译')}</p><details><summary>原文</summary><p>{b.text}</p></details></article>)}</div></div>
    </>}
  </section>;
}
