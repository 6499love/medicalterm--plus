import React, { useState } from 'react';
import { useStore } from '../store';

const model = 'glm-4-flashx-250414';

export default function LiteratureModelSettings({disabled}: {disabled:boolean}) {
  const auth = useStore(s=>s.literatureAuth);
  const rememberKey = useStore(s=>s.rememberLiteratureKey);
  const setAuth = useStore(s=>s.setLiteratureAuth);
  const clearAuth = useStore(s=>s.clearLiteratureAuth);
  const [editing,setEditing] = useState(!auth);
  const [key,setKey] = useState('');
  const [remember,setRemember] = useState(rememberKey);

  function save(event:React.FormEvent) {
    event.preventDefault();
    if (disabled || !key.trim()) return;
    setAuth({provider:'glm',apiKey:key.trim(),model,userName:'Literature'},remember);
    setKey('');
    setEditing(false);
  }

  return <section className="lit-model-settings" aria-labelledby="lit-model-title">
    <h3 id="lit-model-title">文献翻译 API · 按量计费</h3>
    <p>文献翻译单独配置 Key，费用由你的智谱账号承担。普通翻译保留原来的配置。</p>
    <p className="lit-model-name">智谱 GLM · GLM-4-FlashX-250414</p>
    <p className="lit-caption">参考价：输入、输出各 0.10 元 / 百万 Token（2026-11-19 核对）。实际费用以平台账单为准。<a className="lit-link" href="https://docs.bigmodel.cn/cn/guide/start/pricing" target="_blank" rel="noreferrer">查看官方价格</a></p>
    <fieldset disabled={disabled}>
      {auth&&!editing ? <div className="lit-actions">
        <span>文献 Key 已保存</span>
        <button type="button" onClick={()=>{setRemember(rememberKey);setEditing(true);}}>更换文献 Key</button>
        <button type="button" onClick={()=>{clearAuth();setKey('');setRemember(false);setEditing(true);}}>移除文献 Key</button>
      </div> : <form onSubmit={save}>
        <label htmlFor="literature-api-key">智谱标准 API Key</label>
        <div className="lit-key-row">
          <input id="literature-api-key" type="password" autoComplete="off" spellCheck={false} value={key}
            onChange={event=>setKey(event.target.value)} aria-describedby="lit-key-help" required />
          <a className="lit-link" href="https://bigmodel.cn/usercenter/proj-mgmt/apikeys" target="_blank" rel="noreferrer">获取标准 API Key</a>
        </div>
        <p id="lit-key-help" className="lit-caption">填写可调用此模型的标准 Key 或历史兼容 Key。已有可用 Key 可直接使用；保存配置不会验证连接。</p>
        <label className="lit-remember"><input type="checkbox" checked={remember} onChange={event=>setRemember(event.target.checked)} />在此浏览器记住文献 Key</label>
        <div className="lit-actions">
          <button type="submit" disabled={!key.trim()}>保存文献配置</button>
          {auth&&<button type="button" onClick={()=>{setKey('');setEditing(false);}}>取消</button>}
        </div>
      </form>}
    </fieldset>
  </section>;
}
