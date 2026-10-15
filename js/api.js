(function(){
  'use strict';

  const cfg = window.SMP_JAYA_CONFIG || {};
  const API_URL = String(cfg.API_URL || '').trim();

  function ensureUrl(){
    if(!API_URL || API_URL.includes('GANTI_DENGAN_URL')){
      throw new Error('API_URL belum diisi di js/config.js.');
    }
    return API_URL;
  }

  async function get(action, params){
    const url = new URL(ensureUrl());
    url.searchParams.set('action', action);
    Object.keys(params || {}).forEach(function(key){
      const value = params[key];
      if(value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });
    const response = await fetch(url.toString(), { method:'GET', redirect:'follow', cache:'no-store' });
    const text = await response.text();
    return parseResponse(text, response);
  }

  async function post(action, data){
    const url = ensureUrl();
    const body = new URLSearchParams();
    body.set('action', action);
    Object.keys(data || {}).forEach(function(key){
      const value = data[key];
      if(value !== undefined && value !== null){
        body.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
    });
    const response = await fetch(url, {
      method:'POST',
      body: body,
      redirect:'follow',
      cache:'no-store'
    });
    const text = await response.text();
    return parseResponse(text, response);
  }

  function parseResponse(text, response){
    const clean = String(text || '').replace(/^\uFEFF/, '').trim();
    let json;
    try{ json = JSON.parse(clean); }
    catch(err){
      const preview = clean.slice(0,220);
      throw new Error('Respons API bukan JSON. Periksa URL Web App, deployment Google Apps Script, dan akses Anyone. Respons: ' + preview);
    }
    if(!response.ok) throw new Error('HTTP ' + response.status);
    if(json && json.ok === false) throw new Error(json.message || 'API mengembalikan kesalahan.');
    return json;
  }

  window.SMP_API = { get:get, post:post };
})();
