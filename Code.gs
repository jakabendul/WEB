/**
 * SMP Jaya / SMPN 1 Sukatani - Google Apps Script API
 * Fitur:
 * - Website publik dari Google Sheets
 * - Login Guru Piket
 * - Session 6 jam
 * - Absensi siswa wajib per kelas
 * - Absensi guru
 *
 * SETUP:
 * 1. Isi SPREADSHEET_ID.
 * 2. Jalankan setupSheets().
 * 3. Jalankan setGuruPiket().
 * 4. Deploy > New deployment > Web app.
 *    Execute as: Me
 *    Who has access: Anyone
 */
const SPREADSHEET_ID = '1_ielM7bVn27tDIcXolwbXCUdin3lV6tM3M7WiSgD6UQ';
const PUBLIC_SHEETS = ['Profil','Guru','Siswa','Berita','Pengumuman','Agenda','Galeri','Dokumen','Absensi_Siswa','Absensi_Guru','Prestasi','Surat','Materi','Siberkah'];
const SESSION_TTL = 21600; // 6 jam

function getSS_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID.startsWith('GANTI_')) {
    throw new Error('SPREADSHEET_ID belum diatur di Code.gs');
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = clean_(p.action || 'all');
    let data;

    switch (action) {
      case 'all':
        data = getAllPublic_();
        break;
      case 'sheet':
        data = getSheetPublic_(p.sheet || '');
        break;
      case 'prestasi':
        data = getPrestasi_();
        break;
      case 'surat':
        data = getSurat_();
        break;
      case 'siberkah':
        data = getSiberkah_();
        break;
      case 'siswa':
        data = getSiswa_();
        break;
      case 'ping':
        data = { status: 'ok', time: new Date().toISOString() };
        break;
      case 'classes':
        data = getClasses_(p.token);
        break;
      case 'students':
        data = getStudentsForClass_(p.token, p.kelas || '');
        break;
      case 'teachers':
        data = getTeachers_();
        break;
      case 'guru':
        data = getTeachers_();
        break;
      case 'attendance':
        data = getAttendance_(p.token, p.type || 'siswa', p.tanggal || '', p.kelas || '');
        break;
      case 'attendanceSummary':
        data = getAttendanceSummary_(p.token, p.bulan || '', p.kelas || '');
        break;
      default:
        throw new Error('Action GET tidak dikenal: ' + action);
    }

    return json_({ ok: true, data });
  } catch (err) {
    return json_({ ok: false, message: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    const body = parseBody_(e);
    const action = clean_(body.action || '');

    switch (action) {
      case 'loginPiket':
        return json_({ ok: true, data: loginPiket_(body.username, body.password) });

      case 'loginTU':
        return json_({ ok: true, data: loginTU_(body.username, body.password) });

      case 'logoutPiket':
        logoutPiket_(body.token);
        return json_({ ok: true, data: { message: 'Logout berhasil.' } });

      case 'saveStudentAttendance':
        return json_({ ok: true, data: saveStudentAttendance_(body) });

      case 'saveTeacherAttendance':
        return json_({ ok: true, data: saveTeacherAttendance_(body) });

      default:
        throw new Error('Action POST tidak dikenal: ' + action);
    }
  } catch (err) {
    return json_({ ok: false, message: String(err.message || err) });
  }
}



function serverPost(action, payload) {
  action = String(action || '').trim();
  payload = payload || {};

  if (!action) {
    throw new Error('Parameter "action" untuk POST wajib diisi.');
  }

  switch (action) {
    case 'loginPiket':
      return loginPiket_(payload.username, payload.password);
    case 'loginTU':
      return loginTU_(payload.username, payload.password);
    case 'logoutPiket':
      logoutPiket_(payload.token);
      return { message: 'Logout berhasil.' };
    case 'saveStudentAttendance':
      return saveStudentAttendance_(payload);
    
    // --- TAMBAHAN BARU: ROUTE UPDATE ABSENSI ---
    case 'updateStudentAttendance':
      return updateStudentAttendance_(payload);

    default:
      throw new Error('Permintaan POST tidak dikenal: "' + action + '"');
  }
}

function parseBody_(e) {
  if (!e) return {};

  // 1) Jika frontend mengirim application/json.
  const raw = e.postData && e.postData.contents ? e.postData.contents : '';
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return normalizePostBody_(parsed);
      }
    } catch (_) {
      // Lanjut ke fallback form-urlencoded.
    }
  }

  // 2) api.js mengirim URLSearchParams/form-urlencoded.
  // Pada mode ini e.parameter berisi records sebagai STRING JSON.
  const params = e.parameter || {};
  return normalizePostBody_(params);
}

/**
 * Mengubah field JSON string dari form POST kembali menjadi
 * Array/Object agar dapat diproses oleh fungsi penyimpanan.
 */
function normalizePostBody_(body) {
  const out = {};
  const jsonFields = [
    'records',
    'siswa',
    'students',
    'data',
    'daftarSiswa',
    'student'
  ];

  Object.keys(body || {}).forEach(function(key) {
    let value = body[key];

    if (jsonFields.indexOf(key) !== -1 && typeof value === 'string') {
      const s = value.trim();

      if (s) {
        try {
          value = JSON.parse(s);
        } catch (_) {
          // Jika bukan JSON valid, pertahankan nilai aslinya.
        }
      }
    }

    out[key] = value;
  });

  return out;
}

function clean_(v) {
  return String(v == null ? '' : v).trim();
}

function hash_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value)
  );
  return bytes.map(function (b) {
    const x = b < 0 ? b + 256 : b;
    const h = x.toString(16);
    return h.length === 1 ? '0' + h : h;
  }).join('');
}

function getPiketCredentials_() {
  const p = PropertiesService.getScriptProperties();
  const username = p.getProperty('PIKET_USERNAME');
  const hash = p.getProperty('PIKET_PASSWORD_HASH');

  if (!username || !hash) {
    throw new Error('Akun guru piket belum dibuat. Jalankan setGuruPiket().');
  }

  return { username, hash };
}

function setGuruPiket() {
  const ui = SpreadsheetApp.getUi();

  const u = ui.prompt(
    'SMP Jaya - Akun Guru Piket',
    'Masukkan username guru piket:',
    ui.ButtonSet.OK_CANCEL
  );
  if (u.getSelectedButton() !== ui.Button.OK) return;

  const p = ui.prompt(
    'SMP Jaya - Akun Guru Piket',
    'Masukkan password guru piket:',
    ui.ButtonSet.OK_CANCEL
  );
  if (p.getSelectedButton() !== ui.Button.OK) return;

  const username = clean_(u.getResponseText());
  const password = p.getResponseText();

  if (username.length < 3 || password.length < 6) {
    throw new Error('Username minimal 3 karakter dan password minimal 6 karakter.');
  }

  PropertiesService.getScriptProperties().setProperties({
    PIKET_USERNAME: username,
    PIKET_PASSWORD_HASH: hash_(password)
  });

  ui.alert('Akun guru piket berhasil dibuat.');
}

function loginPiket_(username, password) {
  const c = getPiketCredentials_();

  if (
    clean_(username) !== c.username ||
    hash_(password || '') !== c.hash
  ) {
    throw new Error('Username atau password guru piket salah.');
  }

  const token = Utilities.getUuid() + '-' + Utilities.getUuid();

  CacheService.getScriptCache().put(
    'SESSION_' + token,
    JSON.stringify({
      username: c.username,
      role: 'piket',
      loginAt: new Date().toISOString()
    }),
    SESSION_TTL
  );

  return {
    token,
    username: c.username,
    role: 'piket',
    expiresIn: SESSION_TTL
  };
}

function requireSession_(token) {
  if (!token) {
    throw new Error('Silakan login sebagai guru piket terlebih dahulu.');
  }

  const raw = CacheService.getScriptCache().get('SESSION_' + token);

  if (!raw) {
    throw new Error('Sesi login sudah berakhir. Silakan login kembali.');
  }

  return JSON.parse(raw);
}

function requireRole_(token, role) {
  const session = requireSession_(token);
  if (String(session.role || '') !== String(role)) {
    throw new Error('Akses ditolak. Login sebagai ' + role + ' diperlukan.');
  }
  return session;
}

function logoutPiket_(token) {
  if (token) {
    CacheService.getScriptCache().remove('SESSION_' + token);
  }
}

function getTUCredentials_() {
  const p = PropertiesService.getScriptProperties();
  const username = p.getProperty('TU_USERNAME');
  const hash = p.getProperty('TU_PASSWORD_HASH');

  if (!username || !hash) {
    throw new Error('Akun Tata Usaha belum dibuat. Jalankan setTataUsaha().');
  }

  return { username, hash };
}

function setTataUsaha() {
  const ui = SpreadsheetApp.getUi();

  const u = ui.prompt(
    'SMP Jaya - Akun Tata Usaha',
    'Masukkan username Tata Usaha (untuk absensi guru / SI DURU):',
    ui.ButtonSet.OK_CANCEL
  );
  if (u.getSelectedButton() !== ui.Button.OK) return;

  const p = ui.prompt(
    'SMP Jaya - Akun Tata Usaha',
    'Masukkan password Tata Usaha:',
    ui.ButtonSet.OK_CANCEL
  );
  if (p.getSelectedButton() !== ui.Button.OK) return;

  const username = clean_(u.getResponseText());
  const password = p.getResponseText();

  if (username.length < 3 || password.length < 6) {
    throw new Error('Username minimal 3 karakter dan password minimal 6 karakter.');
  }

  PropertiesService.getScriptProperties().setProperties({
    TU_USERNAME: username,
    TU_PASSWORD_HASH: hash_(password)
  });

  ui.alert('Akun Tata Usaha berhasil dibuat.');
}

function loginTU_(username, password) {
  const c = getTUCredentials_();

  if (
    clean_(username) !== c.username ||
    hash_(password || '') !== c.hash
  ) {
    throw new Error('Username atau password Tata Usaha salah.');
  }

  const token = Utilities.getUuid() + '-' + Utilities.getUuid();

  CacheService.getScriptCache().put(
    'SESSION_' + token,
    JSON.stringify({
      username: c.username,
      role: 'tu',
      loginAt: new Date().toISOString()
    }),
    SESSION_TTL
  );

  return {
    token,
    username: c.username,
    role: 'tu',
    expiresIn: SESSION_TTL
  };
}

function getAllPublic_() {
  const out = {};
  PUBLIC_SHEETS.forEach(function (name) {
    out[name] = readSheet_(name);
  });
  // Samakan dengan endpoint individual agar angka dashboard konsisten
  // (Surat hanya yang diproses; Siswa & Guru tanpa yang nonaktif).
  out.Surat = getSurat_().rows;
  out.Siswa = getSiswa_().rows;
  out.Guru = getTeachers_().rows;
  return out;
}

function getSheetPublic_(name) {
  if (!PUBLIC_SHEETS.includes(name)) {
    throw new Error('Sheet tidak diizinkan untuk API publik.');
  }
  return readSheet_(name);
}

function getPrestasi_() {
  const ss = getSS_();
  const sh = ss.getSheetByName('Prestasi');

  if (!sh) {
    throw new Error("Sheet 'Prestasi' tidak ditemukan di Spreadsheet. Pastikan nama tab persis 'Prestasi'.");
  }

  const rows = readSheet_('Prestasi');
  return {
    sheet: 'Prestasi',
    count: rows.length,
    rows: rows,
    message: rows.length
      ? 'Data Prestasi berhasil ditemukan.'
      : 'Sheet Prestasi ditemukan, tetapi belum memiliki data setelah baris header.'
  };
}

function getSurat_() {
  const ss = getSS_();
  const sh = ss.getSheetByName('Surat');

  if (!sh) {
    throw new Error("Sheet 'Surat' tidak ditemukan di Spreadsheet. Pastikan nama tab persis 'Surat'.");
  }

  const rows = readSheet_('Surat');
  const processed = rows.filter(function(row) {
    const status = clean_(row.Status || row.status || '').toLowerCase();
    return ['diproses','sedang diproses','proses','diproses oleh petugas','processing'].includes(status);
  });

  return {
    sheet: 'Surat',
    count: processed.length,
    total: rows.length,
    rows: processed,
    message: processed.length
      ? 'Data surat yang sedang diproses berhasil ditemukan.'
      : 'Sheet Surat ditemukan, tetapi belum ada surat berstatus Diproses.'
  };
}

function getSiberkah_() {
  const ss = getSS_();
  const sh = ss.getSheetByName('Siberkah');

  if (!sh) {
    throw new Error("Sheet 'Siberkah' tidak ditemukan di Spreadsheet. Pastikan nama tab persis 'Siberkah' (case-sensitive).");
  }

  const rows = readSheet_('Siberkah');
  return {
    sheet: 'Siberkah',
    count: rows.length,
    rows: rows,
    message: rows.length
      ? 'Data SIBERKAH berhasil ditemukan.'
      : 'Sheet SIBERKAH ditemukan, tetapi belum memiliki data setelah baris header.'
  };
}

function getSiswa_() {
  const ss = getSS_();
  const sh = ss.getSheetByName('Siswa');

  if (!sh) {
    throw new Error("Sheet 'Siswa' tidak ditemukan di Spreadsheet. Pastikan nama tab persis 'Siswa'.");
  }

  const rows = readSheet_('Siswa').filter(function (s) {
    return clean_(s.Status || 'Aktif').toLowerCase() !== 'nonaktif';
  });
  return {
    sheet: 'Siswa',
    count: rows.length,
    rows: rows,
    message: rows.length
      ? 'Data siswa aktif berhasil ditemukan.'
      : 'Sheet Siswa ditemukan, tetapi belum ada siswa aktif setelah baris header.'
  };
}

function getClasses_(token) {
  requireSession_(token);

  const classes = [...new Set(
    readSheet_('Siswa')
      .filter(function (s) {
        return clean_(s.Status || 'Aktif').toLowerCase() !== 'nonaktif';
      })
      .map(function (s) {
        return clean_(s.Kelas);
      })
      .filter(Boolean)
  )];

  return classes.sort(function (a, b) {
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

function getStudentsForClass_(token, kelas) {
  requireSession_(token);

  kelas = clean_(kelas);
  if (!kelas) throw new Error('Kelas wajib dipilih.');

  return readSheet_('Siswa').filter(function (s) {
    return clean_(s.Kelas) === kelas &&
      clean_(s.Status || 'Aktif').toLowerCase() !== 'nonaktif';
  });
}

function getTeachers_() {
  const ss = getSS_();
  const sh = ss.getSheetByName('Guru');

  if (!sh) {
    throw new Error("Sheet 'Guru' tidak ditemukan. Pastikan nama tab persis 'Guru'.");
  }

  const values = sh.getDataRange().getDisplayValues();

  if (!values.length) {
    return {
      sheet: 'Guru',
      count: 0,
      total: 0,
      rows: [],
      message: "Sheet 'Guru' ditemukan tetapi belum memiliki header."
    };
  }

  const headers = values[0].map(function(h) {
    return String(h || '').trim();
  });

  if (!headers.some(Boolean)) {
    throw new Error("Sheet 'Guru' ditemukan, tetapi baris header kosong.");
  }

  const rows = readSheet_('Guru').filter(function(g) {
    const status = clean_(g.Status || g.status || 'Aktif').toLowerCase();
    return status !== 'nonaktif';
  });

  return {
    sheet: 'Guru',
    count: rows.length,
    total: Math.max(values.length - 1, 0),
    headers: headers.filter(Boolean),
    rows: rows,
    message: rows.length
      ? 'Data Guru berhasil ditemukan.'
      : 'Sheet Guru berhasil dibaca, tetapi belum ada data guru aktif.'
  };
}

function getAttendance_(token, type, tanggal, kelas) {
  requireSession_(token);

  type = String(type).toLowerCase();
  if (!['siswa', 'guru'].includes(type)) {
    throw new Error('Jenis absensi tidak valid.');
  }

  if (type === 'guru') {
    requireRole_(token, 'tu');
  }

  const sheetName = type === 'siswa' ? 'Absensi_Siswa' : 'Absensi_Guru';
  let rows = readSheet_(sheetName);


  if (tanggal) {  
    const targetTanggal = normalizeDate_(tanggal);  
	rows = rows.filter(function (r) {    
	  return normalizeDate_(r.Tanggal) === targetTanggal;  // keduanya dinormalisasi  
	  });
  }

  if (type === 'siswa' && kelas) {
    rows = rows.filter(function (r) {
      return clean_(r.Kelas) === clean_(kelas);
    });
  }

  return rows;
}


function getAttendanceSummary_(token, bulan, kelas) {
  requireSession_(token);

  const targetMonth = clean_(bulan) || Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || 'Asia/Jakarta',
    'yyyy-MM'
  );
  const targetClass = clean_(kelas);

  if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
    throw new Error('Format bulan harus YYYY-MM.');
  }

  let rows = readSheet_('Absensi_Siswa');

  rows = rows.filter(function(r) {
    const tgl = normalizeDate_(r.Tanggal);
    return tgl.indexOf(targetMonth + '-') === 0 &&
           (!targetClass || clean_(r.Kelas) === targetClass);
  });

  const counts = { Hadir:0, Sakit:0, Izin:0, Alpa:0 };
  const classCounts = {};

  rows.forEach(function(r) {
    const raw = clean_(r.Status).toLowerCase();
    let status = 'Hadir';

    if (raw === 'sakit' || raw === 's') status = 'Sakit';
    else if (raw === 'izin' || raw === 'ijin' || raw === 'i') status = 'Izin';
    else if (raw === 'alpa' || raw === 'alpha' || raw === 'a') status = 'Alpa';

    counts[status]++;

    const kls = clean_(r.Kelas) || '-';
    if (!classCounts[kls]) classCounts[kls] = {Hadir:0,Sakit:0,Izin:0,Alpa:0};
    classCounts[kls][status]++;
  });

  const total = counts.Hadir + counts.Sakit + counts.Izin + counts.Alpa;

  const classes = Object.keys(classCounts).sort().map(function(kls) {
    const c = classCounts[kls];
    return {
      kelas:kls, Hadir:c.Hadir, Sakit:c.Sakit, Izin:c.Izin, Alpa:c.Alpa,
      total:c.Hadir+c.Sakit+c.Izin+c.Alpa
    };
  });

  return {
    bulan: targetMonth,
    kelas: targetClass || 'Semua Kelas',
    total: total,
    counts: counts,
    persentase: {
      Hadir: total ? Number((counts.Hadir/total*100).toFixed(1)) : 0,
      Sakit: total ? Number((counts.Sakit/total*100).toFixed(1)) : 0,
      Izin: total ? Number((counts.Izin/total*100).toFixed(1)) : 0,
      Alpa: total ? Number((counts.Alpa/total*100).toFixed(1)) : 0
    },
    classes: classes
  };
}

// ==========================================
// FUNGSI UNTUK MENGAMBIL DATA ABSENSI (GET)
// ==========================================
function getStudentAttendance_(body) {
  requireSession_(body.token);

  const kelas = clean_(body.kelas || body.Kelas);
  const tanggal = normalizeDate_(body.tanggal || body.Tanggal);

  if (!kelas || !tanggal) {
    throw new Error('Kelas dan tanggal wajib diisi.');
  }

  const sh = getSS_().getSheetByName('Absensi_Siswa');
  if (!sh) return { success: true, data: {} };

  const raw = sh.getDataRange().getDisplayValues();
  if (raw.length <= 1) return { success: true, data: {} };

  const headers = raw[0].map(function(h) { return String(h || '').trim(); });
  const idxTanggal = headers.indexOf('Tanggal');
  const idxNis = headers.indexOf('NIS');
  const idxKelas = headers.indexOf('Kelas');
  const idxStatus = headers.indexOf('Status');
  const idxKet = headers.indexOf('Keterangan');

  const attendanceMap = {};

  for (let i = 1; i < raw.length; i++) {
    const rowTanggal = normalizeDate_(raw[i][idxTanggal]);
    const rowKelas = clean_(raw[i][idxKelas]);
    const rowNis = clean_(raw[i][idxNis]);

    if (rowTanggal === tanggal && rowKelas === kelas && rowNis) {
      attendanceMap[rowNis] = {
        status: clean_(raw[i][idxStatus]) || 'Hadir',
        keterangan: clean_(raw[i][idxKet]) || ''
      };
    }
  }

  return {
    success: true,
    data: attendanceMap
  };
}

function saveStudentAttendance_(body) {
  const session = requireSession_(body.token);

  const kelas = clean_(body.kelas || body.Kelas);
  const tanggal = normalizeDate_(body.tanggal || body.Tanggal);

  if (!kelas || !tanggal) {
    throw new Error('Kelas dan tanggal wajib diisi.');
  }

  // Kompatibel dengan beberapa nama field dari frontend:
  // records, siswa, students, data, atau daftarSiswa.
  let records = [];
  const candidates = [body.records, body.siswa, body.students, body.data, body.daftarSiswa];
  for (let i = 0; i < candidates.length; i++) {
    if (Array.isArray(candidates[i])) {
      records = candidates[i];
      break;
    }
  }

  // Jika frontend mengirim satu objek siswa, ubah menjadi array.
  if (!records.length && body.student && typeof body.student === 'object') {
    records = [body.student];
  }

  if (!Array.isArray(records) || !records.length) {
    throw new Error('Tidak ada siswa untuk disimpan. Pastikan daftar siswa untuk kelas ' + kelas + ' sudah dimuat.');
  }

  const sh = getSS_().getSheetByName('Absensi_Siswa');
  if (!sh) throw new Error('Sheet Absensi_Siswa belum tersedia. Jalankan setupSheets().');

  const now = new Date();

  // Bangun indeks dari sheet agar data tanggal + NIS + kelas
  // yang sudah ada diperbarui, bukan dibuat ganda.
  const raw = sh.getDataRange().getDisplayValues();
  const headers = raw.length ? raw[0].map(function(h){ return String(h || '').trim(); }) : [];

  const idxTanggal = headers.indexOf('Tanggal');
  const idxNis = headers.indexOf('NIS');
  const idxNama = headers.indexOf('Nama');
  const idxKelas = headers.indexOf('Kelas');
  const idxStatus = headers.indexOf('Status');
  const idxKet = headers.indexOf('Keterangan');
  const idxPetugas = headers.indexOf('Petugas');
  const idxWaktu = headers.indexOf('Waktu Input');

  if (idxTanggal < 0 || idxNis < 0 || idxNama < 0 || idxKelas < 0 || idxStatus < 0) {
    throw new Error('Header sheet Absensi_Siswa belum sesuai. Jalankan setupSheets() lalu pastikan header Tanggal, NIS, Nama, Kelas, Status tersedia.');
  }

  const rowIndex = {};
  if (raw.length > 1) {
    for (let i = 1; i < raw.length; i++) {
      const nis = clean_(raw[i][idxNis]);
      const kls = clean_(raw[i][idxKelas]);
      if (!nis || !kls) continue;

      const key = normalizeDate_(raw[i][idxTanggal]) + '|' + nis + '|' + kls;
      rowIndex[key] = i + 1;
    }
  }

  const appendRows = [];
  let updated = 0;
  let validRecords = 0;
  const seen = {};

  records.forEach(function(r) {
    if (!r || typeof r !== 'object') return;

    const nis = clean_(r.nis || r.NIS || r.nisn || r.NISN);
    const nama = clean_(r.nama || r.Nama || r.name || r.namaSiswa);

    // Dynamic status check: Gunakan nilai jika ada, jika kosong set ke 'Hadir'
    let inputStatus = clean_(r.status || r.Status || r.kehadiran || r.Kehadiran);
    const status = inputStatus ? inputStatus : 'Hadir';
    
    const keterangan = clean_(r.keterangan || r.Keterangan || r.catatan || r.Catatan);

    // Siswa harus memiliki minimal NIS atau Nama.
    if (!nis && !nama) return;

    validRecords++;

    const key = tanggal + '|' + nis + '|' + kelas;
    if (seen[key]) return;
    seen[key] = true;

    const values = [tanggal, nis, nama, kelas, status, keterangan, session.username, now];
    const rowNumber = rowIndex[key];

    if (rowNumber) {
      sh.getRange(rowNumber, 1, 1, 8).setValues([values]);
      updated++;
    } else {
      appendRows.push(values);
    }
  });

  if (!validRecords) {
    throw new Error('Daftar siswa diterima, tetapi tidak ada data NIS/Nama yang valid untuk kelas ' + kelas + '.');
  }

  if (appendRows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, appendRows.length, 8).setValues(appendRows);
  }

  return {
    message: 'Absensi ' + validRecords + ' siswa kelas ' + kelas + ' berhasil disimpan.',
    jumlah: validRecords,
    ditambahkan: appendRows.length,
    diperbarui: updated
  };
}

/**
 * Memperbarui (update) baris data absensi spesifik berdasarkan Tanggal, NIS, dan Kelas.
 */
function updateStudentAttendance_(payload) {
  const session = requireSession_(payload.token);

  const tanggal = normalizeDate_(payload.tanggal);
  const nis = clean_(payload.nis || payload.NIS);
  const kelas = clean_(payload.kelas || payload.Kelas);
  const status = normalizeStatus_(payload.status || payload.Status);
  const keterangan = clean_(payload.keterangan || payload.Keterangan);

  if (!tanggal) throw new Error('Tanggal absensi wajib diisi.');
  if (!nis) throw new Error('NIS siswa wajib diisi.');
  if (!kelas) throw new Error('Kelas wajib dipilih.');

  const ss = getSS_();
  const sh = ss.getSheetByName('Absensi_Siswa');

  if (!sh) {
    throw new Error('Sheet Absensi_Siswa belum ditemukan. Jalankan setupSheets().');
  }

  const values = sh.getDataRange().getDisplayValues();
  if (values.length < 2) {
    throw new Error('Belum ada data absensi di spreadsheet.');
  }

  // Cari baris yang cocok berdasarkan Tanggal, NIS, dan Kelas
  let targetRowIndex = -1;
  const targetKey = tanggal + '|' + nis + '|' + kelas;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const key = normalizeDate_(row[0]) + '|' + clean_(row[1]) + '|' + clean_(row[3]);

    if (key === targetKey) {
      targetRowIndex = i + 1; // Konversi indeks array ke nomor baris di Spreadsheet (1-based index)
      break;
    }
  }

  if (targetRowIndex === -1) {
    throw new Error(
      'Data absensi untuk siswa NIS (' + nis + ') pada kelas ' + kelas + ' tanggal ' + tanggal + ' tidak ditemukan.'
    );
  }

  // Ambil nama siswa lama atau nama baru dari payload
  const namaSiswa = clean_(payload.nama || payload.Nama) || clean_(values[targetRowIndex - 1][2]);

  // Susun data terbarukan
  const updatedRowData = [
    tanggal,
    nis,
    namaSiswa,
    kelas,
    status,
    keterangan,
    session.username,
    new Date() // Waktu perbaruan
  ];

  // Perbarui baris di Spreadsheet
  sh.getRange(targetRowIndex, 1, 1, updatedRowData.length).setValues([updatedRowData]);

  return {
    status: 'success',
    message: 'Data absensi siswa NIS ' + nis + ' berhasil diperbarui.',
    barisDiperbarui: targetRowIndex,
    data: {
      tanggal: tanggal,
      nis: nis,
      nama: namaSiswa,
      kelas: kelas,
      status: status,
      keterangan: keterangan,
      petugas: session.username
    }
  };
}

function saveTeacherAttendance_(body) {
  requireRole_(body.token, 'tu');

  const tanggal = clean_(body.tanggal);

  if (!tanggal) {
    throw new Error('Tanggal wajib diisi.');
  }

  const records = Array.isArray(body.records) ? body.records : [];

  if (!records.length) {
    throw new Error('Tidak ada guru untuk disimpan.');
  }

  const sh = getSS_().getSheetByName('Absensi_Guru');

  if (!sh) {
    throw new Error('Sheet Absensi_Guru belum tersedia. Jalankan setupSheets().');
  }

  const session = requireSession_(body.token);
  const now = new Date();
  const normTanggal = normalizeDate_(tanggal);

  // Indeks baris lama agar simpan ulang = update, bukan duplikat.
  const values = sh.getDataRange().getDisplayValues();
  const rowIndexByNip = {};
  const rowIndexByNama = {};
  for (let i = 1; i < values.length; i++) {
    const rowTanggal = normalizeDate_(values[i][0]);
    if (rowTanggal !== normTanggal) continue;
    const nip = clean_(values[i][1]);
    const nama = clean_(values[i][2]).toLowerCase();
    if (nip && rowIndexByNip[nip] === undefined) rowIndexByNip[nip] = i + 1;
    if (nama && rowIndexByNama[nama] === undefined) rowIndexByNama[nama] = i + 1;
  }

  const appendRows = [];
  let updated = 0;

  records.forEach(function (r) {
    const nip = clean_(r.nip);
    const nama = clean_(r.nama);
    const status = clean_(r.status) || 'Hadir';
    const keterangan = clean_(r.keterangan);

    if (!nip && !nama) return;

    const rowValues = [
      tanggal,
      nip,
      nama,
      status,
      keterangan,
      session.username,
      now
    ];

    const targetRow =
      (nip && rowIndexByNip[nip]) ||
      (nama && rowIndexByNama[nama.toLowerCase()]) ||
      0;

    if (targetRow) {
      sh.getRange(targetRow, 1, 1, 7).setValues([rowValues]);
      updated++;
    } else {
      appendRows.push(rowValues);
      if (nip) rowIndexByNip[nip] = -1;
      if (nama) rowIndexByNama[nama.toLowerCase()] = -1;
    }
  });

  if (appendRows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, appendRows.length, 7)
      .setValues(appendRows);
  }

  const total = updated + appendRows.length;

  return {
    message: 'Absensi ' + total + ' guru berhasil disimpan (' +
      updated + ' diperbarui, ' + appendRows.length + ' ditambah).',
    jumlah: total,
    diperbarui: updated,
    ditambahkan: appendRows.length
  };
}

function normalizeDate_(value) {
  const s = clean_(value);
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd');
}

function readSheet_(name) {
  const sh = getSS_().getSheetByName(name);
  if (!sh) {
    throw new Error("Sheet '" + name + "' tidak ditemukan. Pastikan nama tab persis '" + name + "'.");
  }

  const values = sh.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = values.shift().map(function (h) {
    return String(h).trim();
  });

  return values
    .filter(function (row) {
      return row.some(function (v) {
        return String(v).trim() !== '';
      });
    })
    .map(function (row) {
      const obj = {};
      headers.forEach(function (h, i) {
        if (h) obj[h] = row[i] || '';
      });
      return obj;
    });
}

function setupSheets() {
  const ss = getSS_();

  const schemas = {
    Profil: [
      'NamaSekolah','Tagline','NPSN','KepalaSekolah','Alamat','Email',
      'Telepon','Website','Deskripsi','Visi','Misi','Hero'
    ],
    Guru: ['Nama','NIP','Jabatan','Mapel','Foto','Status'],
    Siswa: ['NIS','NISN','Nama','Kelas','Jenis Kelamin','Status'],
    Berita: ['Tanggal','Judul','Kategori','Ringkasan','Isi','Gambar','Status'],
    Pengumuman: ['Tanggal','Judul','Isi','Status'],
    Prestasi: ['Tanggal','Nama','Kelas','Prestasi','Tingkat','Penyelenggara','Keterangan','Foto','Status'],
    Agenda: ['Tanggal','Nama Kegiatan','Lokasi','Keterangan','Status'],
    Galeri: ['Tanggal','Judul','Gambar','Keterangan','Status'],
    Dokumen: ['Nama Dokumen','Keterangan','URL','Kategori','Status'],
    Absensi_Siswa: [
      'Tanggal','NIS','Nama','Kelas','Status','Keterangan','Petugas','Waktu Input'
    ],
    Absensi_Guru: [
      'Tanggal','NIP','Nama','Status','Keterangan','Petugas','Waktu Input'
    ],
    Surat: ['Tanggal','Nomor','Jenis','Perihal','URL','Status'],
    Materi: ['Tanggal','Judul','Mapel','Kelas','Guru','URL','Keterangan','Status'],
    Pengaturan: ['Kunci','Nilai']
  };

  Object.keys(schemas).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);

    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, schemas[name].length).setValues([schemas[name]]);
    } else {
      const current = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), schemas[name].length)).getDisplayValues()[0];
      const missing = schemas[name].filter(function(h){ return current.indexOf(h) === -1; });
      if (missing.length) {
        sh.getRange(1, sh.getLastColumn() + 1, 1, missing.length).setValues([missing]);
      }
    }
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  });

  seedProfile_(ss.getSheetByName('Profil'));

  return 'Struktur sheet berhasil dibuat.';
}

function seedProfile_(sh) {
  if (!sh || sh.getLastRow() > 1) return;

  sh.getRange(2, 1, 1, 12).setValues([[
    'SMPN 1 Sukatani Purwakarta',
    'Smart School - Sistem Informasi Sekolah',
    '',
    '',
    '',
    '',
    '',
    '',
    'Selamat datang di website resmi SMP Jaya.',
    'Mewujudkan peserta didik yang berkarakter, berprestasi, dan siap menghadapi masa depan.',
    '1. Pembelajaran bermutu.\n2. Karakter dan disiplin.\n3. Pengembangan potensi.',
    'Membangun generasi berkarakter, berprestasi, dan siap menghadapi masa depan.'
  ]]);
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('SMP Jaya')
    .addItem('Buat Struktur Sheet', 'setupSheets')
    .addItem('Buat/Ubah Akun Guru Piket', 'setGuruPiket')
    .addItem('Buat/Ubah Akun Tata Usaha', 'setTataUsaha')
    .addToUi();
}