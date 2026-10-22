// Cofre local: guarda os dados no aparelho (IndexedDB), cifrados com AES-GCM.
// A chave é gerada no próprio aparelho e não pode ser exportada pelo navegador.
(function () {
  'use strict';
  const NOME = 'ism-pecuaria', VERSAO = 1;
  let dbp = null, chave = null;

  function abrir() {
    if (dbp) return dbp;
    dbp = new Promise((ok, erro) => {
      const r = indexedDB.open(NOME, VERSAO);
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => erro(r.error);
    });
    return dbp;
  }
  async function bruto(modo, fn) {
    const d = await abrir();
    return new Promise((ok, erro) => {
      const t = d.transaction('kv', modo), s = t.objectStore('kv');
      const r = fn(s);
      t.oncomplete = () => ok(r && r.result);
      t.onerror = () => erro(t.error);
      t.onabort = () => erro(t.error);
    });
  }
  const lerBruto = k => bruto('readonly', s => s.get(k));
  const gravarBruto = (k, v) => bruto('readwrite', s => s.put(v, k));
  const apagarBruto = k => bruto('readwrite', s => s.delete(k));

  async function obterChave() {
    if (chave) return chave;
    let k = await lerBruto('__chave');
    if (!k) {
      k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await gravarBruto('__chave', k);
    }
    return (chave = k);
  }
  const enc = new TextEncoder(), dec = new TextDecoder();

  async function gravar(k, valor) {
    const c = await obterChave(), iv = crypto.getRandomValues(new Uint8Array(12));
    const dado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, c, enc.encode(JSON.stringify(valor)));
    await gravarBruto(k, { iv, dado });
  }
  async function ler(k) {
    const r = await lerBruto(k);
    if (!r) return null;
    try {
      const c = await obterChave();
      return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: r.iv }, c, r.dado)));
    } catch (e) { return null; }
  }
  async function chaves(prefixo) {
    const ks = await bruto('readonly', s => s.getAllKeys());
    return (ks || []).filter(k => typeof k === 'string' && k.startsWith(prefixo));
  }
  async function limparTudo() {
    const ks = await bruto('readonly', s => s.getAllKeys());
    for (const k of ks || []) if (k !== '__chave') await apagarBruto(k);
  }

  // Senha para entrar sem internet: guarda só um "resumo" (PBKDF2), nunca a senha
  async function resumoSenha(senha, sal) {
    sal = sal || crypto.getRandomValues(new Uint8Array(16));
    const base = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: 210000 }, base, 256);
    return { sal: Array.from(sal), hash: Array.from(new Uint8Array(bits)) };
  }
  async function conferirSenha(senha, guardado) {
    if (!guardado) return false;
    const r = await resumoSenha(senha, new Uint8Array(guardado.sal));
    return r.hash.length === guardado.hash.length && r.hash.every((b, i) => b === guardado.hash[i]);
  }

  window.Cofre = { ler, gravar, apagar: apagarBruto, chaves, limparTudo, resumoSenha, conferirSenha };
})();
