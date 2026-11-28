import React from 'react';
import { Check, ExternalLink, KeyRound } from 'lucide-react';
import './apiFields.css';

export function ProviderOption({active, children, onClick}: {
  active:boolean; children:React.ReactNode; onClick:()=>void;
}) {
  return <button type="button" className="api-provider" aria-pressed={active} onClick={onClick}>
    {children}{active && <Check size={15} aria-hidden="true" />}
  </button>;
}

export function ApiKeyField({id,label,url,linkText,value,onChange,hint,disabled,inputRef,invalid}: {
  id:string; label:string; url:string; linkText:string; value:string; onChange:(key:string)=>void;
  hint:string; disabled?:boolean; inputRef?:React.Ref<HTMLInputElement>; invalid?:boolean;
}) {
  return <div className="api-field">
    <div className="api-field-title"><label htmlFor={id}>{label}</label>
      <a href={url} target="_blank" rel="noreferrer">{linkText}<ExternalLink size={13} /></a></div>
    <div className="api-input"><KeyRound size={16} aria-hidden="true" />
      <input ref={inputRef} id={id} type="password" autoComplete="off" spellCheck={false}
        placeholder="sk-…" value={value} onChange={event=>onChange(event.target.value)}
        aria-describedby={id+'-hint'} aria-invalid={invalid} disabled={disabled} required /></div>
    <small id={id+'-hint'}>{hint}</small>
  </div>;
}

export function RememberKey({checked,onChange,label,description}: {
  checked:boolean; onChange:(checked:boolean)=>void; label:string; description:string;
}) {
  return <label className="api-remember"><input type="checkbox" checked={checked}
    onChange={event=>onChange(event.target.checked)} /><span>{label}<small>{description}</small></span></label>;
}
