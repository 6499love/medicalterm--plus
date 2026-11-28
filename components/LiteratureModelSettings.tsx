import { ApiKeyField, ProviderOption, RememberKey } from './ApiFields';
import { KeyRound, Save } from 'lucide-react';
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
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    if (!open) {
      dialog.current?.close();
      setKey('');
      return;
    }
    setPlatform(savedPlatform);
    setRemember(rememberKey);
    setError('');
    dialog.current?.showModal();
    input.current?.focus();
  },[open,savedPlatform,rememberKey]);

  async function save(event:React.FormEvent) {
    event.preventDefault();
    if (disabled || !key.trim()) return;
    setError('');
    try {
      if(await onSave({provider:selected.provider,model:selected.model,...('baseUrl' in selected ? {baseUrl:selected.baseUrl} : {}),apiKey:key.trim(),userName:'Literature'},remember))setKey('');
    } catch(cause) {setError(cause instanceof Error?cause.message:'连接检查失败，请重试。');}
  }

  return <>
    <button type="button" className="lit-api-trigger" disabled={disabled} aria-haspopup="dialog"
      aria-controls="lit-key-dialog" onClick={()=>onOpenChange(true)}>
      <KeyRound size={15}/>{auth ? models[savedPlatform].name+' · 已配置' : '配置文献 API'}
    </button>
    <dialog ref={dialog} id="lit-key-dialog" className="lit-model-settings" aria-labelledby="lit-model-title"
      onCancel={event=>{event.preventDefault();if(!disabled)onOpenChange(false);}}>
      <h3 id="lit-model-title">文献翻译 API 配置</h3>
    <fieldset disabled={disabled}>
      {open&&<form id="lit-key-form" onSubmit={save}>
        <fieldset><legend>翻译模型</legend><div className="lit-provider-options">
          {(Object.keys(models) as Platform[]).map(id=><ProviderOption key={id} active={platform===id}
            onClick={()=>{if(id!==platform){setPlatform(id);setKey('');setError('');}}}>
            {id==='glm'?'智谱 GLM FlashX':'DeepSeek Flash'}</ProviderOption>)}
        </div></fieldset>
        <ApiKeyField id="literature-api-key" label={selected.name+' API Key'} url={selected.keys}
          linkText="获取 API Key" value={key} onChange={setKey} inputRef={input} invalid={!!error}
          hint={'此 Key 用于文献翻译，费用由你的'+selected.name+'账号承担。'} />
        {error&&<p role="alert" className="lit-error">{error}</p>}
        <RememberKey checked={remember} onChange={setRemember} label="在此浏览器记住文献 Key"
          description="默认仅在当前会话使用。普通翻译有独立的 API 配置。" />
        <button className="api-save" type="submit" disabled={!key.trim() || disabled}><Save size={16} />{disabled?'正在检查连接…':'保存并检查连接'}</button>
        <div className="lit-actions">
          <button type="button" onClick={()=>{setKey('');setRemember(rememberKey);setError('');onOpenChange(false);}}>取消</button>
          {auth&&<button className="lit-remove-key" type="button" onClick={()=>{clearAuth();setKey('');setRemember(false);setError('');}}>移除文献 Key</button>}
        </div>
        <p className="lit-caption">检查会发送一句短文字，按用量计费。通过后自动收起配置。</p>
      </form>}
    </fieldset>
    {open&&<details className="lit-model-info">
      <summary>价格与使用说明</summary>
      <p>{selected.model}。费用以平台账单为准。<a className="lit-link" href={selected.pricing} target="_blank" rel="noreferrer">官方价格</a></p>
      <p>PDF 读取、识图和导出在浏览器完成。{selected === models.deepseek ? '浏览器将待译文字直接发送给 DeepSeek。' : '待译文字通过本站发送给智谱。'}Key 默认只用于当前页面会话，勾选记住后才本地保存。</p>
    </details>}
    </dialog>
  </>;
}
