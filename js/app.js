(function(){
  'use strict';

  function setText(id,value){ const el=document.getElementById(id); if(el) el.textContent=value ?? '0'; }
  function status(message,type){
    const el=document.getElementById('apiStatus'); if(!el) return;
    el.textContent=message; el.className='api-status ' + (type || '');
  }
  function prestasiStatus(message,type){
    const el=document.getElementById('prestasiStatus'); if(!el) return;
    el.textContent=message; el.className='prestasi-status ' + (type || '');
  }
  function esc(v){ return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
  function safeHref(v){ const s=String(v ?? '').trim(); return /^https?:\/\//i.test(s) ? s : ''; }
  function rows(data,name){ return Array.isArray(data && data[name]) ? data[name] : []; }
  function countRows(data,names){
    for(const name of names){ if(Array.isArray(data && data[name])) return data[name].length; }
    return 0;
  }

  function renderActivity(items){
    const list=document.getElementById('activityList'); if(!list) return;
    const agenda=items || [];
    if(!agenda.length){ list.innerHTML='<div class="empty">Belum ada agenda/aktivitas.</div>'; return; }
    list.innerHTML=agenda.slice(0,8).map(function(x){
      const title=x['Nama Kegiatan'] || x.Judul || x.judul || x.Nama || 'Kegiatan sekolah';
      const date=x.Tanggal || x.tanggal || '';
      const loc=x.Lokasi || x.lokasi || '';
      const desc=x.Keterangan || x.keterangan || x.Ringkasan || '';
      return '<div class="activity"><div class="dot"></div><div><b>'+esc(title)+'</b><p>'+esc([date,loc,desc].filter(Boolean).join(' • '))+'</p></div></div>';
    }).join('');
  }

  function renderAnnouncements(items){
    const list=document.getElementById('noticeList'); if(!list) return;
    const data=items || [];
    if(!data.length){ list.innerHTML='<div class="empty">Belum ada pengumuman.</div>'; return; }
    list.innerHTML=data.slice(0,8).map(function(x){
      const title=x.Judul || x.judul || 'Pengumuman';
      const body=x.Isi || x.isi || x.Ringkasan || x.Keterangan || '';
      const date=x.Tanggal || x.tanggal || '';
      return '<div class="notice"><div class="notice-icon">📢</div><div><b>'+esc(title)+'</b><p>'+esc([date,body].filter(Boolean).join(' • '))+'</p></div></div>';
    }).join('');
  }

  function renderPrestasi(items){
    const head=document.getElementById('prestasiHead');
    const body=document.getElementById('prestasiBody');
    if(!head || !body) return;

    items=Array.isArray(items) ? items : [];
    setText('prestasiCount', items.length + ' prestasi tercatat');
    setText('statPrestasi', items.length);

    if(!items.length){
      head.innerHTML='';
      body.innerHTML='<tr><td class="prestasi-empty" colspan="10">Sheet Prestasi berhasil dibaca, tetapi belum ada data setelah baris header.</td></tr>';
      return;
    }

    const headerSet=[];
    items.forEach(function(row){
      Object.keys(row || {}).forEach(function(h){ if(h && !headerSet.includes(h)) headerSet.push(h); });
    });
    const headers=headerSet.length ? headerSet : Object.keys(items[0]);
    head.innerHTML='<tr>'+headers.map(function(h){ return '<th>'+esc(h)+'</th>'; }).join('')+'</tr>';
    body.innerHTML=items.map(function(row){
      return '<tr>'+headers.map(function(h){ return '<td>'+esc(row[h])+'</td>'; }).join('')+'</tr>';
    }).join('');
  }

  async function loadPrestasi(){
    const btn=document.getElementById('btnRefreshPrestasi');
    if(btn){ btn.disabled=true; btn.textContent='↻ Memuat...'; }
    prestasiStatus('Mengambil langsung dari sheet Prestasi...','');
    setText('prestasiCount','Memuat data...');
    try{
      const result=await window.SMP_API.get('prestasi');
      const data=result.data || {};
      const items=Array.isArray(data.rows) ? data.rows : [];
      renderPrestasi(items);
      if(items.length){
        prestasiStatus('✓ Sheet Prestasi terhubung — '+items.length+' baris data ditemukan.','ok');
      }else{
        prestasiStatus('✓ Sheet Prestasi ditemukan, tetapi datanya masih kosong.','ok');
      }
      return items;
    }catch(err){
      console.error('SI PRESTASI:',err);
      setText('prestasiCount','Data gagal dimuat');
      const head=document.getElementById('prestasiHead');
      const body=document.getElementById('prestasiBody');
      if(head) head.innerHTML='';
      if(body) body.innerHTML='<tr><td class="prestasi-empty" colspan="10">'+esc(err.message || 'Gagal mengambil data Prestasi.')+'</td></tr>';
      prestasiStatus('✕ Gagal membaca sheet Prestasi: '+(err.message || 'Kesalahan API'),'err');
      return [];
    }finally{
      if(btn){ btn.disabled=false; btn.textContent='↻ Refresh Data'; }
    }
  }


  function suratStatus(message,type){
    const el=document.getElementById('suratStatus'); if(!el) return;
    el.textContent=message; el.className='surat-status ' + (type || '');
  }

  let suratRows=[];
  let suratJenisFilter='all';

  function jenisSurat(row){
    const j=String((row && (row.Jenis ?? row.jenis ?? row['Jenis Surat'] ?? row.jenis_surat)) || '').toLowerCase();
    if(j.includes('masuk')) return 'masuk';
    if(j.includes('keluar')) return 'keluar';
    return 'lain';
  }

  function renderSurat(items, totalCount){
    const head=document.getElementById('suratHead');
    const body=document.getElementById('suratBody');
    if(!head || !body) return;
    items=Array.isArray(items) ? items : [];
    const total=(typeof totalCount==='number') ? totalCount : items.length;
    const filtered=(suratJenisFilter!=='all');
    setText('suratCount', filtered ? (items.length+' dari '+total+' surat') : (items.length+' surat diproses'));
    setText('statSurat', total);
    setText('statSuratInfo', total ? 'Sedang diproses' : 'Belum ada surat diproses');
    if(!items.length){
      head.innerHTML='';
      body.innerHTML='<tr><td class="surat-empty" colspan="10">'+
        (filtered && total ? 'Tidak ada surat jenis ini yang sedang diproses.' : 'Belum ada surat dengan status Diproses.')+
        '</td></tr>';
      return;
    }
    const preferred=['Tanggal','Nomor','Jenis','Perihal','Status','Tgl_terima','Jenis_surat','Sifat_Surat','Ins_Pengirim','Ditujukan','URL'];
    const keys=[];
    preferred.forEach(function(h){ if(items.some(function(r){return Object.prototype.hasOwnProperty.call(r,h);})) keys.push(h); });
    items.forEach(function(row){ Object.keys(row||{}).forEach(function(h){ if(h && !keys.includes(h)) keys.push(h); }); });
    head.innerHTML='<tr>'+keys.map(function(h){return '<th>'+esc(h)+'</th>';}).join('')+'</tr>';
    body.innerHTML=items.map(function(row){
      return '<tr>'+keys.map(function(h){
        const val=row[h] ?? '';
        if(h.toLowerCase()==='status') return '<td><span class="status-pill">'+esc(val)+'</span></td>';
        if(h.toLowerCase()==='url'){
          const href=safeHref(val);
          return href ? '<td><a href="'+esc(href)+'" target="_blank" rel="noopener">Buka surat</a></td>' : '<td>'+esc(val)+'</td>';
        }
        return '<td>'+esc(val)+'</td>';
      }).join('')+'</tr>';
    }).join('');
  }

  function setSuratRows(items){
    suratRows=Array.isArray(items) ? items : [];
    applySuratFilter();
  }

  function applySuratFilter(){
    const list=(suratJenisFilter==='all') ? suratRows : suratRows.filter(function(r){ return jenisSurat(r)===suratJenisFilter; });
    renderSurat(list, suratRows.length);
  }

  async function loadSurat(){
    const btn=document.getElementById('btnRefreshSurat');
    if(btn){ btn.disabled=true; btn.textContent='↻ Memuat...'; }
    suratStatus('Mengambil langsung dari sheet Surat...','');
    setText('suratCount','Memuat data...');
    try{
      const result=await window.SMP_API.get('surat');
      const data=result.data || {};
      const items=Array.isArray(data.rows) ? data.rows : [];
      setSuratRows(items);
      suratStatus(items.length ? '✓ Sheet Surat terhubung — '+items.length+' surat sedang diproses.' : '✓ Sheet Surat ditemukan, tetapi belum ada surat berstatus Diproses.','ok');
      return items;
    }catch(err){
      console.error('SI SURAT:',err);
      setText('suratCount','Data gagal dimuat'); setText('statSurat','!');
      const head=document.getElementById('suratHead'), body=document.getElementById('suratBody');
      if(head) head.innerHTML='';
      if(body) body.innerHTML='<tr><td class="surat-empty" colspan="10">'+esc(err.message || 'Gagal mengambil data Surat.')+'</td></tr>';
      suratStatus('✕ Gagal membaca sheet Surat: '+(err.message || 'Kesalahan API'),'err');
      return [];
    }finally{
      if(btn){ btn.disabled=false; btn.textContent='↻ Refresh Data'; }
    }
  }

  const DASH_CACHE_KEY='SMP_CACHE_all';
  const DASH_CACHE_TTL=5*60*1000;

  function readDashCache(){
    try{
      const raw=sessionStorage.getItem(DASH_CACHE_KEY);
      if(!raw) return null;
      const obj=JSON.parse(raw);
      if(!obj || !obj.data || (Date.now()-(obj.t||0))>DASH_CACHE_TTL) return null;
      return obj.data;
    }catch(e){ return null; }
  }

  function writeDashCache(data){
    try{ sessionStorage.setItem(DASH_CACHE_KEY, JSON.stringify({t:Date.now(), data:data})); }catch(e){}
  }

  function paintDashboard(data, fromCache){
    renderActivity(rows(data,'Agenda'));
    renderAnnouncements(rows(data,'Pengumuman'));

    // Isi panel Prestasi & Surat dari payload yang sama (tanpa fetch ulang).
    const prestasi=rows(data,'Prestasi');
    renderPrestasi(prestasi);
    prestasiStatus(prestasi.length
      ? '✓ Sheet Prestasi terhubung — '+prestasi.length+' baris data ditemukan.'
      : '✓ Sheet Prestasi ditemukan, tetapi datanya masih kosong.','ok');

    const surat=rows(data,'Surat');
    setSuratRows(surat);
    suratStatus(surat.length
      ? '✓ Sheet Surat terhubung — '+surat.length+' surat sedang diproses.'
      : '✓ Sheet Surat ditemukan, tetapi belum ada surat berstatus Diproses.','ok');

    // Statistik siswa & guru (tidak punya panel/tombol refresh sendiri).
    const siswa=rows(data,'Siswa');
    setText('statPengguna',siswa.length);
    setText('statPenggunaInfo',siswa.length ? 'Siswa terdaftar' : 'Belum ada data siswa');

    const guru=rows(data,'Guru');
    setText('statguru',guru.length);
    setText('statguruInfo',guru.length ? 'Guru terdaftar' : 'Belum ada data Guru');

    if(fromCache) status('Menampilkan data tersimpan, memperbarui di latar belakang...','');
  }

  async function loadDashboard(){
    const cached=readDashCache();
    if(cached) paintDashboard(cached, true);
    try{
      status(cached ? 'Memperbarui data dashboard...' : 'Mengambil data dashboard dari Google Sheets...','ok');
      const result=await window.SMP_API.get('all');
      const data=result.data || {};
      writeDashCache(data);
      paintDashboard(data, false);

      status('Dashboard terhubung ke Google Sheets ✓','ok');
      setTimeout(function(){status('','');},3500);
    }catch(err){
      if(cached){
        status('Menampilkan data tersimpan (gagal memperbarui).','');
        return;
      }
      console.error(err);
      status(err.message || 'Gagal mengambil data dashboard dari API.','err');
      setText('statPrestasi','!'); setText('statSurat','!'); setText('statPengguna','!'); setText('statguru','!');
    }
  }

  document.addEventListener('DOMContentLoaded',function(){
    const search=document.querySelector('.search');
    if(search) search.addEventListener('input',function(e){
      const q=e.target.value.toLowerCase();
      document.querySelectorAll('.card').forEach(function(card){ card.style.display=card.innerText.toLowerCase().includes(q)?'block':'none'; });
    });
    document.querySelectorAll('.nav a').forEach(function(a){
      a.addEventListener('click',function(){ document.querySelectorAll('.nav a').forEach(function(x){x.classList.remove('active');}); a.classList.add('active'); });
    });
    // Panel-switching nav ditangani terpusat di script inline index.html.
    // Di sini hanya sembunyikan panel Prestasi/Surat saat pertama kali load.
    const prestasiPanel=document.getElementById('dataPrestasi');
    const suratPanel=document.getElementById('dataSurat');
    function hidePrestasi(){ if(prestasiPanel) prestasiPanel.style.display='none'; }
    function hideSurat(){ if(suratPanel) suratPanel.style.display='none'; }
    const btn=document.getElementById('btnRefreshPrestasi');
    if(btn) btn.addEventListener('click',loadPrestasi);
    const btnSurat=document.getElementById('btnRefreshSurat');
    if(btnSurat) btnSurat.addEventListener('click',loadSurat);
    document.querySelectorAll('.surat-filter-btn').forEach(function(b){
      b.addEventListener('click',function(){
        suratJenisFilter=b.getAttribute('data-jenis')||'all';
        document.querySelectorAll('.surat-filter-btn').forEach(function(x){ x.classList.toggle('active', x===b); });
        applySuratFilter();
      });
    });
    hidePrestasi(); hideSurat();
    loadDashboard();
  });
})();
