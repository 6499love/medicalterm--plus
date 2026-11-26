import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { AuthConfig } from '../types';

const models = {
  glm: {
    name: '智谱', provider: 'glm', model: 'glm-4-flashx-250414',
    keys: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
    pricing: 'https://docs.bigmodel.cn/cn/guide/start/pricing',
  },
  deepseek: {
    name: 'DeepSeek', provider: 'openai-compatible', model: 'deepseek-flash',
    baseUrl: 'https://api.deepseek.com',
    keys: 'https://platform.deepseek.com/api_keys',
    pricing: 'https://api-docs.deepseek.com/quick_start/pricing',
  },
} as const;
type Platform = keyof typeof models;

interface Props {
  disabled: boolean;
  open: boolean;
  onOpenChange: (open:boolean)=>void;
  onSave: (config:AuthConfig,remember:boolean)=>Promise<boolean>;
}

export default function LiteratureModelSettings({disabled,open,onOpenChange,onSave}: Props) {
  const auth = useStore(s=>s.literatureAuth);
  const rememberKey = useStore(s=>s.rememberLiteratureKey);
  const clearAuth = useStore(s=>s.clearLiteratureAuth);
  const savedPlatform = auth?.baseUrl === models.deepseek.baseUrl ? 'deepseek' : 'glm';
  const [platform,setPlatform] = useState<Platform>(savedPlatform);
  const selected = models[open ? platform : savedPlatform];
  const [key,setKey] = useState('');
  const [remember,setRemember] = useState(rememberKey);
  const [error,setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(()=>{if(open&&!disabled)input.current?.focus();},[open,disabled]);

  async function save(event:React.FormEvent) {
    event.preventDefault();
    if (disabled || !key.trim()) return;
    setError('');
    try {
      if(await onSave({provider:selected.provider,model:selected.model,...('baseUrl' in selected ? {baseUrl:selected.baseUrl} : {}),apiKey:key.trim(),userName:'Literature'},remember))setKey('');
    } catch(cause) {setError(cause instanceof Error?cause.message:'连接检查失败，请重试。');}
  }

  return <section className="lit-model-settings" aria-labelledby="lit-model-title">
    <div className="lit-key-summary">
      <h3 id="lit-model-title">文献 Key <span className={auth?'lit-key-ready':'lit-key-missing'}>{auth ? models[savedPlatform].name + ' 已配置' : '未配置'}</span></h3>
      <button type="button" disabled={disabled} aria-expanded={open} aria-controls="lit-key-form"
        onClick={()=>{setPlatform(savedPlatform);setKey('');setRemember(rememberKey);setError('');onOpenChange(!open);}}>{open?'收起':auth?'修改':'配置 Key'}</button>
    </div>
    <p className="lit-cost-notice">按模型用量计费，费用由你的{selected.name}账号承担。</p>
    <fieldset disabled={disabled}>
      {open&&<form id="lit-key-form" onSubmit={save}>
        <label htmlFor="literature-platform">翻译模型</label>
        <select id="literature-platform" value={platform} onChange={event=>{
          setPlatform(event.target.value as Platform);
          setKey('');
          setError('');
        }}>
          <option value="glm">智谱 GLM FlashX</option>
          <option value="deepseek">DeepSeek Flash</option>
        </select>
        <label htmlFor="literature-api-key">{selected.name}{platform === 'glm' ? '标准' : ''} API Key</label>
        <div className="lit-key-row">
          <input ref={input} id="literature-api-key" type="password" autoComplete="off" spellCheck={false} value={key}
            onChange={event=>setKey(event.target.value)} aria-describedby="lit-key-help" aria-invalid={!!error} required />
          <a className="lit-link" href={selected.keys} target="_blank" rel="noreferrer">获取 API Key</a>
        </div>
        <p id="lit-key-help" className="lit-caption">已有适用 Key 可直接填写。文献 Key 与普通翻译配置独立。</p>
        {error&&<p role="alert" className="lit-error">{error}</p>}
        <label className="lit-remember"><input type="checkbox" checked={remember} onChange={event=>setRemember(event.target.checked)} />在此浏览器记住文献 Key</label>
        <div className="lit-actions">
          <button className="lit-primary" type="submit" disabled={!key.trim()}>保存并检查连接</button>
          <button type="button" onClick={()=>{setKey('');setRemember(rememberKey);setError('');onOpenChange(false);}}>取消</button>
          {auth&&<button className="lit-remove-key" type="button" onClick={()=>{clearAuth();setKey('');setRemember(false);setError('');}}>移除文献 Key</button>}
        </div>
        <p className="lit-caption">检查会发送一句短文字，按用量计费。通过后自动收起配置。</p>
      </form>}
    </fieldset>
    <details className="lit-model-info">
      <summary>价格与使用说明</summary>
      <p>{selected.model}。费用以平台账单为准。<a className="lit-link" href={selected.pricing} target="_blank" rel="noreferrer">官方价格</a></p>
      <p>PDF 读取、识图和导出在浏览器完成。{selected === models.deepseek ? '浏览器将待译文字直接发送给 DeepSeek。' : '待译文字通过本站发送给智谱。'}Key 默认只用于当前页面会话，勾选记住后才本地保存。</p>
    </details>
  </section>;
}
