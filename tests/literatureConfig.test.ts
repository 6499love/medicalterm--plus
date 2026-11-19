import { afterEach, expect, it, vi } from 'vitest';
import type { AuthConfig } from '../types';

const main: AuthConfig = {provider:'glm',apiKey:'main-test-only',model:'glm-4-flash',userName:'User'};
const literature: AuthConfig = {provider:'glm',apiKey:'literature-test-only',model:'glm-4-flashx-250414',userName:'Literature'};

async function setup(saved?: object) {
  vi.resetModules();
  const data = new Map<string,string>();
  if (saved) data.set('mediterm-storage',JSON.stringify({state:saved,version:0}));
  const storage={
    getItem:(key:string)=>data.get(key) ?? null,
    setItem:(key:string,value:string)=>{data.set(key,value);},
    removeItem:(key:string)=>{data.delete(key);},
  };
  vi.stubGlobal('localStorage',storage);
  vi.stubGlobal('window',{localStorage:storage});
  const {useStore} = await import('../store');
  return {store:useStore,stored:()=>JSON.parse(data.get('mediterm-storage') || '{}').state};
}

afterEach(()=>vi.unstubAllGlobals());

it('preserves the existing main configuration without copying its key into literature',async()=>{
  const {store}=await setup({auth:main});
  expect(store.getState().auth).toEqual(main);
  expect(store.getState().literatureAuth).toBeNull();
});

it('saves and removes literature credentials without changing the main credentials',async()=>{
  const {store}=await setup({auth:main});
  store.getState().setLiteratureAuth(literature);
  expect(store.getState().auth).toEqual(main);
  expect(store.getState().literatureAuth).toEqual(literature);
  store.getState().clearLiteratureAuth();
  expect(store.getState().auth).toEqual(main);
  expect(store.getState().literatureAuth).toBeNull();
});

it('keeps a literature key out of browser storage unless the user chooses to remember it',async()=>{
  const {store,stored}=await setup({auth:main});
  store.getState().setLiteratureAuth(literature);
  expect(stored().auth).toEqual(main);
  expect(JSON.stringify(stored())).not.toContain(literature.apiKey);
  await store.persist.rehydrate();
  expect(store.getState().literatureAuth).toBeNull();
});

it('remembers literature credentials independently of the main remember-key preference',async()=>{
  const {store,stored}=await setup({auth:main});
  store.getState().updateSettings({rememberApiKey:false});
  store.getState().setLiteratureAuth(literature,true);
  expect(stored().auth).toBeUndefined();
  expect(stored().literatureAuth).toEqual(literature);
  await store.persist.rehydrate();
  expect(store.getState().literatureAuth).toEqual(literature);
  store.getState().logout();
  expect(store.getState().literatureAuth).toEqual(literature);
});

it('removes an earlier saved literature key when remembering is turned off',async()=>{
  const {store,stored}=await setup({auth:main,literatureAuth:literature,rememberLiteratureKey:true});
  expect(store.getState().literatureAuth).toEqual(literature);
  store.getState().setLiteratureAuth(literature,false);
  expect(JSON.stringify(stored())).not.toContain(literature.apiKey);
  expect(stored().auth).toEqual(main);
  await store.persist.rehydrate();
  expect(store.getState().literatureAuth).toBeNull();
});
