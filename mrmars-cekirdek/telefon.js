/* Mr. Mars Music Studio · MRH DGN — Telefona Gönder: üretilen parçayı veya DJ mixini MP3, WAV ya da MP4 olarak
   QR kodla eşleşen telefona doğrudan gönderir. Dosya hiçbir sunucuya yüklenmez. */
(function (OS) {
  const U = OS.U, el = U.el, ui = OS.ui, E = OS.engine, Link = window.OSLink;
  const PAGE = 'https://merihdogan.github.io/Mr.Mars.Music.Studio-All-in-1-Touch/telefon.html';
  const P = OS.phone = { base: null, link: null, stream: null };
  const pageUrl = () => P.base || (/^https?:$/.test(location.protocol) ? new URL('telefon.html', location.href).href : PAGE);
  const wait = ms => new Promise(r => { if (ms) { setTimeout(r, ms); return; } const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
  const addScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('script ' + src)); document.head.appendChild(s); });
  const once = {}; const lazy = src => (once[src] = once[src] || addScript(src));
  const safe = s => String(s || 'mix').replace(/[\\/:*?"<>|]/g, '_').trim() || 'mix';

  // ---------------- Kaynak: proje veya DJ belleği ----------------
  // lossy: kaynak zaten sıkıştırılmış; native: hazır kayıt, örnekleme hızı yükseltilemez
  async function getAudio(source, sr) {
    if (source === 'dj') {
      const M = ui.dj && ui.dj.mem;
      if (!M || !M.mr) throw new Error(OS.t('Henüz gönderilecek DJ mixi yok. Önce bir parça çalın.'));
      const blob = await M.blob(), buf = await E.init().decodeAudioData(await blob.arrayBuffer());
      return { buffer: buf, name: 'dj-set-' + U.stamp(), lossy: true, native: true };
    }
    if (source === 'djrec') {
      const r = ui.dj && ui.dj.lastRec;
      if (!r) throw new Error(OS.t('Kayıpsız DJ kaydı yok. DJ Mixer’de biçimi WAV yapıp Seti Kaydet ile kaydı alın ve bitirin.'));
      const buf = new AudioBuffer({ length: r.L.length, numberOfChannels: 2, sampleRate: r.sr }); buf.copyToChannel(r.L, 0); buf.copyToChannel(r.R, 1);
      return { buffer: buf, name: r.name, native: true };
    }
    const has = OS.project.tracks.some(t => t.clips.length);
    if (!has) throw new Error(OS.t('Projede gönderilecek klip yok'));
    const buffer = await E.render({ sampleRate: sr, tail: source === 'loop' ? 0.5 : 3, loopOnly: source === 'loop' });
    return { buffer, name: safe(OS.project.name) };
  }

  // ---------------- MP3 ----------------
  P._enc = { get muxMp4() { return muxMp4; }, get toMp3() { return toMp3; }, get toMp4() { return toMp4; }, get encodeAudioAac() { return encodeAudioAac; }, get pcm() { return pcm; } };
  const pcm = (L, R, sr) => ({ sampleRate: sr, numberOfChannels: 2, duration: L.length / sr, getChannelData: c => (c ? R : L) });
  async function toMp3(ab, name, kbps, prog, meta) {
    await lazy('mrmars-cekirdek/mp3kod.js');
    const sr = [32000, 44100, 48000].includes(ab.sampleRate) ? ab.sampleRate : 44100;
    const L = ab.getChannelData(0), R = ab.getChannelData(1), mono = R === L, enc = new window.lamejs.Mp3Encoder(mono ? 1 : 2, sr, kbps);
    if (ab.sampleRate !== sr) throw new Error('sample rate ' + ab.sampleRate);
    const tag = meta && OS.audioLab.id3(meta), parts = tag ? [...tag] : [], step = 1152 * 40, l = new Int16Array(step), r = new Int16Array(step);
    const conv = (s, o, d, n) => { for (let i = 0; i < n; i++) { const v = s[o + i]; d[i] = v >= 1 ? 32767 : v <= -1 ? -32768 : v * 32767; } };
    for (let o = 0; o < L.length; o += step) {
      const n = Math.min(step, L.length - o);
      conv(L, o, l, n); conv(R, o, r, n);
      const b = mono ? enc.encodeBuffer(l.subarray(0, n)) : enc.encodeBuffer(l.subarray(0, n), r.subarray(0, n));
      if (b.length) parts.push(new Uint8Array(b));
      prog(o / L.length); await wait(0);
    }
    const end = enc.flush(); if (end.length) parts.push(new Uint8Array(end));
    return new File(parts, name + '.mp3', { type: 'audio/mpeg' });
  }

  // ---------------- MP4 (H.264 + AAC) ----------------
  const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const u16 = v => [(v >>> 8) & 255, v & 255];
  const str = s => Array.from(s, c => c.charCodeAt(0));
  const zeros = n => new Array(n).fill(0);
  function box(type, ...parts) {
    const flat = parts.map(p => (p instanceof Uint8Array ? p : new Uint8Array(p))), size = flat.reduce((a, p) => a + p.length, 8), out = new Uint8Array(size);
    out.set(u32(size), 0); out.set(str(type), 4);
    let o = 8; flat.forEach(p => { out.set(p, o); o += p.length; });
    return out;
  }
  const full = (type, flags, ...parts) => box(type, u32(flags), ...parts);
  const MATRIX = [...u32(0x10000), ...zeros(12), ...u32(0x10000), ...zeros(12), ...u32(0x40000000)];
  function tableBoxes(t, chunkOffsets) {
    const list = [];
    const runs = []; t.samples.forEach(s => { const r = runs[runs.length - 1]; if (r && r[1] === s.dur) r[0]++; else runs.push([1, s.dur]); });
    list.push(full('stts', 0, u32(runs.length), ...runs.flatMap(r => [...u32(r[0]), ...u32(r[1])]).reduce((a, x) => (a.push(x), a), []).length ? [runs.flatMap(r => [...u32(r[0]), ...u32(r[1])])] : []));
    if (t.video) { const keys = []; t.samples.forEach((s, i) => { if (s.key) keys.push(i + 1); }); list.push(full('stss', 0, u32(keys.length), keys.flatMap(k => u32(k)))); }
    const stsc = []; t.chunks.forEach((n, i) => { if (!stsc.length || stsc[stsc.length - 1][1] !== n) stsc.push([i + 1, n]); });
    list.push(full('stsc', 0, u32(stsc.length), stsc.flatMap(e => [...u32(e[0]), ...u32(e[1]), ...u32(1)])));
    list.push(full('stsz', 0, u32(0), u32(t.samples.length), t.samples.flatMap(s => u32(s.data.length))));
    list.push(full('stco', 0, u32(chunkOffsets.length), chunkOffsets.flatMap(o => u32(o))));
    return list;
  }
  function trackBox(id, t, offsets, seconds) {
    const durMs = Math.round(seconds * 1000), durT = t.samples.reduce((a, s) => a + s.dur, 0);
    const tkhd = full('tkhd', 3, u32(0), u32(0), u32(id), u32(0), u32(durMs), zeros(8), u16(0), u16(0), u16(t.video ? 0 : 0x100), u16(0), MATRIX, u32((t.video ? t.w : 0) * 65536), u32((t.video ? t.h : 0) * 65536));
    const mdhd = full('mdhd', 0, u32(0), u32(0), u32(t.scale), u32(durT), u16(0x55c4), u16(0));
    const hdlr = full('hdlr', 0, u32(0), str(t.video ? 'vide' : 'soun'), zeros(12), str(t.video ? 'Video' : 'Sound'), [0]);
    const dinf = box('dinf', full('dref', 0, u32(1), full('url ', 1)));
    const stsd = full('stsd', 0, u32(1), t.video
      ? box('avc1', zeros(6), u16(1), zeros(16), u16(t.w), u16(t.h), u32(0x480000), u32(0x480000), u32(0), u16(1), zeros(32), u16(24), u16(0xffff), box('avcC', t.config))
      : t.kind === 'alac'
        ? box('alac', zeros(6), u16(1), zeros(8), u16(t.channels || 2), u16(t.bits), zeros(4), u32(t.scale > 65535 ? 0 : t.scale * 65536), full('alac', 0, u32(4096), [0, t.bits, 40, 10, 14, t.channels || 2], u16(255), u32(4096 * 2 * (t.bits >> 3) + 16), u32(t.scale * 2 * t.bits), u32(t.scale)))
        : box('mp4a', zeros(6), u16(1), zeros(8), u16(t.channels || 2), u16(16), zeros(4), u32(t.scale > 65535 ? 0 : t.scale * 65536), esds(t.config, t.bitrate)));
    const stbl = box('stbl', stsd, ...tableBoxes(t, offsets));
    const media = box('minf', t.video ? full('vmhd', 1, zeros(8)) : full('smhd', 0, zeros(4)), dinf, stbl);
    return box('trak', tkhd, box('mdia', mdhd, hdlr, media));
  }
  function esds(asc, bitrate) {
    const cfg = Array.from(asc), dcd = [0x40, 0x15, 0, 0, 0, ...u32(bitrate), ...u32(bitrate), 5, cfg.length, ...cfg];
    const es = [...u16(1), 0, 4, dcd.length, ...dcd, 6, 1, 2];
    return full('esds', 0, [3, es.length, ...es]);
  }
  function muxMp4(video, audio, seconds, name, meta) {
    // Ses ~1 sn'lik öbekler, video kare kare: oynatıcı için zamanca iç içe
    const groups = [];
    let ai = 0, vi = 0; const perChunk = Math.max(1, Math.round(audio.scale / (audio.samples[0] ? audio.samples[0].dur : 1024)));
    audio.chunks = []; if (video) video.chunks = [];
    while (ai < audio.samples.length || (video && vi < video.samples.length)) {
      if (video && vi < video.samples.length) { groups.push({ t: video, from: vi, n: 1 }); video.chunks.push(1); vi++; }
      if (ai < audio.samples.length) { const n = Math.min(perChunk, audio.samples.length - ai); groups.push({ t: audio, from: ai, n }); audio.chunks.push(n); ai += n; }
    }
    const ftyp = video ? box('ftyp', str('isom'), u32(0x200), str('isomiso2avc1mp41')) : box('ftyp', str('M4A '), u32(0x200), str('M4A isomiso2mp41'));
    const durMs = Math.round(seconds * 1000);
    const mvhd = full('mvhd', 0, u32(0), u32(0), u32(1000), u32(durMs), u32(0x10000), u16(0x100), u16(0), zeros(8), MATRIX, zeros(24), u32(video ? 3 : 2));
    const tags = meta ? OS.audioLab.mp4Tags(meta, box, full) : null, tail = tags ? [tags] : [];
    const moov = (vo, ao) => (video ? box('moov', mvhd, trackBox(1, video, vo, seconds), trackBox(2, audio, ao, seconds), ...tail) : box('moov', mvhd, trackBox(1, audio, ao, seconds), ...tail));
    const headSize = ftyp.length + moov(video ? video.chunks.map(() => 0) : [], audio.chunks.map(() => 0)).length + 8;
    const vo = [], ao = []; let at = headSize; const parts = [];
    groups.forEach(g => { (g.t === video ? vo : ao).push(at); for (let i = 0; i < g.n; i++) { const d = g.t.samples[g.from + i].data; parts.push(d); at += d.length; } });
    const mdatSize = at - headSize + 8;
    return new File([ftyp, moov(vo, ao), new Uint8Array(u32(mdatSize)), new Uint8Array(str('mdat')), ...parts], name + (video ? '.mp4' : '.m4a'), { type: video ? 'video/mp4' : 'audio/mp4' });
  }
  async function encodeAudioAac(ab, prog, rate) {
    const sr = ab.sampleRate, ch = ab.getChannelData(1) === ab.getChannelData(0) ? 1 : 2; let bitrate = 0, cfg = null;
    if (window.AudioEncoder) for (const b of [rate || 192000, 192000, 160000, 128000]) { const c = { codec: 'mp4a.40.2', sampleRate: sr, numberOfChannels: ch, bitrate: b }; if ((await AudioEncoder.isConfigSupported(c)).supported) { cfg = c; bitrate = b; break; } }
    if (!cfg) throw new Error(OS.t('Bu tarayıcı MP4 üretemiyor. MP3 veya WAV seçin.'));
    const t = { video: false, scale: sr, bitrate, channels: ch, samples: [], config: null };
    let fail = null;
    const enc = new AudioEncoder({ output: (c, meta) => { if (meta && meta.decoderConfig && meta.decoderConfig.description && !t.config) t.config = new Uint8Array(meta.decoderConfig.description); const d = new Uint8Array(c.byteLength); c.copyTo(d); t.samples.push({ data: d, dur: 1024 }); }, error: e => { fail = e; } });
    enc.configure(cfg);
    const L = ab.getChannelData(0), R = ab.getChannelData(1), step = 4096;
    for (let o = 0; o < L.length; o += step) {
      if (fail) throw fail;
      const n = Math.min(step, L.length - o), buf = new Float32Array(n * ch); buf.set(L.subarray(o, o + n), 0); if (ch === 2) buf.set(R.subarray(o, o + n), n);
      const a = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round(o / sr * 1e6), data: buf });
      enc.encode(a); a.close();
      if (o % (step * 32) === 0) { prog(o / L.length * 0.5); while (enc.encodeQueueSize > 64) await wait(5); await wait(0); }
    }
    await enc.flush(); enc.close();
    if (fail) throw fail; if (!t.config) throw new Error('AAC config');
    return t;
  }
  async function encodeCoverVideo(ab, title, prog) {
    const W = 720, H = 720, cfg = { codec: 'avc1.42001f', width: W, height: H, bitrate: 400000, framerate: 1, avc: { format: 'avc' } };
    if (!window.VideoEncoder || !(await VideoEncoder.isConfigSupported(cfg)).supported) throw new Error(OS.t('Bu tarayıcı MP4 üretemiyor. MP3 veya WAV seçin.'));
    const scale = 90000, t = { video: true, scale, w: W, h: H, samples: [], config: null };
    let fail = null;
    const enc = new VideoEncoder({ output: (c, meta) => { if (meta && meta.decoderConfig && meta.decoderConfig.description && !t.config) t.config = new Uint8Array(meta.decoderConfig.description); const d = new Uint8Array(c.byteLength); c.copyTo(d); t.samples.push({ data: d, dur: scale, key: c.type === 'key' }); }, error: e => { fail = e; } });
    enc.configure(cfg);
    // Kapak: ad ve dalga biçimi, üstünde ilerleyen çizgi
    const cv = new OffscreenCanvas(W, H), g = cv.getContext('2d'), L = ab.getChannelData(0), bars = 150, peaks = new Float32Array(bars), span = Math.max(1, Math.floor(L.length / bars));
    for (let i = 0; i < bars; i++) { let p = 0; for (let j = i * span, e = Math.min(L.length, j + span); j < e; j += 37) p = Math.max(p, Math.abs(L[j])); peaks[i] = p; }
    const seconds = ab.duration, frames = Math.max(1, Math.ceil(seconds));
    const paint = k => {
      g.fillStyle = '#10141a'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#eeeeee'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.fillText('Mr. Mars Music Studio', W / 2, 90);
      g.fillStyle = '#e8edf2'; g.font = '30px sans-serif'; g.fillText(String(title).slice(0, 38), W / 2, 150);
      const bw = (W - 80) / bars, mid = H / 2 + 30;
      for (let i = 0; i < bars; i++) { const h = Math.max(2, peaks[i] * 200); g.fillStyle = i / bars <= k ? '#eeeeee' : '#3a3a3a'; g.fillRect(40 + i * bw, mid - h, Math.max(1, bw - 1), h * 2); }
      const s = Math.floor(k * seconds), f = v => String(v).padStart(2, '0');
      g.fillStyle = '#9aa7b4'; g.font = '26px monospace'; g.fillText(f(Math.floor(s / 60)) + ':' + f(s % 60), W / 2, H - 60);
    };
    for (let i = 0; i < frames; i++) {
      if (fail) throw fail;
      paint(i / frames);
      const fr = new VideoFrame(cv, { timestamp: i * 1e6, duration: 1e6 });
      enc.encode(fr, { keyFrame: i % 4 === 0 }); fr.close();
      prog(0.5 + i / frames * 0.5);
      while (enc.encodeQueueSize > 8) await wait(5);
      if (i % 8 === 0) await wait(0);
    }
    await enc.flush(); enc.close();
    if (fail) throw fail; if (!t.config) throw new Error('H264 config');
    return t;
  }
  async function toMp4(ab, name, prog, meta) {
    const a = await encodeAudioAac(ab, prog), v = await encodeCoverVideo(ab, name, prog);
    return muxMp4(v, a, ab.duration, name, meta);
  }

  // ---------------- Biçimler ----------------
  const FORMATS = P.FORMATS = [
    { id: 'mp3192', group: 'Hızlı dinleme', label: 'MP3 192 kbps', kind: 'mp3', kbps: 192, sr: 44100 },
    { id: 'mp3320', group: 'Hızlı dinleme', label: 'MP3 320 kbps', kind: 'mp3', kbps: 320, sr: 44100 },
    { id: 'aac256', group: 'Hızlı dinleme', label: 'AAC M4A (Apple, sistemin izin verdiği en yüksek hız, en çok 256 kbps)', kind: 'aac', kbps: 256, sr: 44100 },
    { id: 'mp4', group: 'Hızlı dinleme', label: 'MP4 (video kapaklı)', kind: 'mp4', sr: 44100 },
    { id: 'wav24-44', group: 'Dağıtım (kayıpsız)', label: 'WAV 24-bit 44.1 kHz (önerilen)', kind: 'wav', bits: 24, sr: 44100, lossless: true },
    { id: 'wav24-48', group: 'Dağıtım (kayıpsız)', label: 'WAV 24-bit 48 kHz', kind: 'wav', bits: 24, sr: 48000, lossless: true },
    { id: 'wav24-96', group: 'Dağıtım (kayıpsız)', label: 'WAV 24-bit 96 kHz (Hi-Res)', kind: 'wav', bits: 24, sr: 96000, lossless: true },
    { id: 'wav16-44', group: 'Dağıtım (kayıpsız)', label: 'WAV 16-bit 44.1 kHz (CD)', kind: 'wav', bits: 16, sr: 44100, lossless: true },
    { id: 'flac24-44', group: 'Dağıtım (kayıpsız)', label: 'FLAC 24-bit 44.1 kHz', kind: 'flac', bits: 24, sr: 44100, lossless: true },
    { id: 'flac24-96', group: 'Dağıtım (kayıpsız)', label: 'FLAC 24-bit 96 kHz (Hi-Res)', kind: 'flac', bits: 24, sr: 96000, lossless: true },
    { id: 'flac16-44', group: 'Dağıtım (kayıpsız)', label: 'FLAC 16-bit 44.1 kHz (CD)', kind: 'flac', bits: 16, sr: 44100, lossless: true },
    { id: 'alac24-44', group: 'Dağıtım (kayıpsız)', label: 'Apple Lossless M4A 24-bit 44.1 kHz', kind: 'alac', bits: 24, sr: 44100, lossless: true },
  ];
  const fmtOf = id => FORMATS.find(f => f.id === id) || FORMATS[0];
  // ---------------- Dosyayı hazırla: aynı kaynak ve biçim bir kez üretilir ----------------
  const cache = new Map(), audioCache = new Map();
  P.clearCache = () => { cache.clear(); audioCache.clear(); };
  const Lab = OS.audioLab;
  const encodeAs = async (f, a, prog) => {
    const buf = a.buffer;
    if (a.native && buf.sampleRate < f.sr) throw new Error(OS.t('Bu kaynak bu örnekleme hızında değil, yükseltmek kaliteyi artırmaz. 44.1 kHz biçim seçin.'));
    const q = await Lab.process(buf.getChannelData(0), buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0), buf.sampleRate, Lab.settings, f.sr, k => prog(k * 0.5));
    const file = await Lab.encode(q, f, a.name, Object.assign({}, Lab.meta, { title: Lab.meta.title || a.name }), k => prog(0.5 + k * 0.5), Lab.settings.dither);
    file.peakDb = q.after.truePeakDb; file.lufs = q.after.lufs; file.lossy = !!a.lossy; file.report = q;
    return file;
  };
  P.makeFile = function (source, id, prog) {
    prog = prog || (() => { });
    const f = fmtOf(id), key = source + ':' + f.id, live = source === 'dj';
    if (!live && cache.has(key)) return cache.get(key);
    const job = (async () => {
      const ak = source + ':' + f.sr;
      let a = !live && audioCache.get(ak);
      if (!a) { a = await getAudio(source, f.sr); if (!live) audioCache.set(ak, a); }
      return encodeAs(f, a, prog);
    })();
    if (!live) { cache.set(key, job); job.catch(() => cache.delete(key)); }
    return job;
  };

  // ---------------- Eşleşme: tek QR, telefon okutunca bağlantı kendiliğinden kurulur ----------------
  P.peers = [];
  const openPeers = () => P.peers.filter(p => p.dc.readyState === 'open');
  P.isOpen = () => openPeers().length > 0;
  P.disconnect = () => { if (P.relay) P.relay.close(); P.relay = null; P.session = null; P.peers.forEach(p => { try { p.pc.close(); } catch (e) { } }); P.peers = []; };
  const sayAll = m => openPeers().forEach(p => { try { p.dc.send(JSON.stringify(m)); } catch (e) { } });
  // Sırayla gönderir: telefon başka biçim isterse bir önceki bitince başlar
  function sendTo(peer, source, format) {
    peer.queue = (peer.queue || Promise.resolve()).then(async () => {
      const ui = P.onStatus || (() => { }), say = (t, k) => ui(t, k);
      try {
        say(OS.t('Hazırlanıyor…'), 0);
        peer.dc.send(JSON.stringify({ kind: 'status', text: OS.t('Hazırlanıyor…') }));
        const file = await P.makeFile(source, format, k => say(OS.t('Hazırlanıyor…'), k));
        say(OS.t('Gönderiliyor…'), 0);
        await Link.sendFile(peer.dc, file, file.name, k => say(OS.t('Gönderiliyor…'), k));
        say(OS.t('Gönderildi') + ': ' + file.name + ' · ' + (file.size / 1048576).toFixed(1) + ' MB · ' + (file.kbps ? file.kbps + ' kbps · ' : '') + OS.audioLab.dbStr(file.lufs) + ' LUFS · ' + OS.audioLab.dbStr(file.peakDb) + ' dBTP', 1);
      } catch (e) {
        console.error(e); say(OS.t('Gönderilemedi') + ': ' + e.message);
        try { peer.dc.send(JSON.stringify({ kind: 'error', text: e.message })); } catch (err) { }
      }
    });
    return peer.queue;
  }
  P.sendReady = file => Promise.all(openPeers().map(p => (p.queue = (p.queue || Promise.resolve()).then(() => Link.sendFile(p.dc, file, file.name)).catch(e => console.error(e)))));
  P.sendAll = (source, format) => Promise.all(openPeers().map(p => sendTo(p, source, format)));
  P._peerFailed = peer => {
    P.peers = P.peers.filter(p => p !== peer); P.onPeers && P.onPeers();
    if (!P.isOpen()) (P.onStatus || (() => { }))(OS.t('Doğrudan bağlantı kurulamadı. Telefonu bilgisayarla aynı Wi-Fi ağına alın.'));
  };
  P.startSession = async function (getChoice) {
    if (P.session) { P.session.getChoice = getChoice; return P.session; }
    const room = Link.rand(12), key = Link.rand(32), s = P.session = { room, key, getChoice, url: pageUrl() + '#r=' + room + '&k=' + key };
    const say = (t, k) => (P.onStatus || (() => { }))(t, k);
    P.relay = await Link.relay(room, key, 'pc', async m => {
      if (m.t === 'hello') {
        if (P.peers.some(p => p.id === m.from)) return;
        say(OS.t('Bağlanıyor…'));
        const l = await Link.createOffer(), peer = { id: m.from, pc: l.pc, dc: l.dc };
        P.peers.push(peer);
        l.dc.addEventListener('open', () => { say(OS.t('Telefon bağlandı')); P.onPeers && P.onPeers(); try { l.dc.send(JSON.stringify({ kind: 'formats', list: FORMATS.map(f => ({ id: f.id, label: OS.t(f.label), group: OS.t(f.group) })) })); } catch (e) { } const c = P.session.getChoice(); sendTo(peer, c.source, c.format); });
        l.dc.addEventListener('close', () => { P.peers = P.peers.filter(p => p !== peer); P.onPeers && P.onPeers(); });
        l.dc.addEventListener('message', e => { if (typeof e.data !== 'string') return; const q = JSON.parse(e.data); if (q.kind === 'request') { const c = P.session.getChoice(); sendTo(peer, c.source, q.format); } });
        l.pc.addEventListener('connectionstatechange', () => { if (l.pc.connectionState === 'failed') P._peerFailed(peer); });
        P.relay.send({ t: 'offer', to: m.from, desc: l.desc });
      } else if (m.t === 'answer') {
        const peer = P.peers.find(p => p.id === m.from);
        if (peer && !peer.pc.currentRemoteDescription) await peer.pc.setRemoteDescription(m.desc);
      }
    }, n => { s.relays = n; P.onRelays && P.onRelays(n); });
    return s;
  };

  // ---------------- Pencere ----------------
  P.open = function () {
    const view = (document.querySelector('#tabs button.active') || {}).dataset, isDj = view && view.view === 'dj';
    P.clearCache();
    if (window.OS_checkUpdate) window.OS_checkUpdate();
    const srcSel = el('select', null, el('option', { value: 'dj', selected: isDj }, OS.t('DJ Mixer: son mix (en çok 30 dk)')), el('option', { value: 'djrec' }, OS.t('DJ Mixer: Seti Kaydet WAV kaydı (kayıpsız)')), el('option', { value: 'project', selected: !isDj }, OS.t('Proje: tüm şarkı')), el('option', { value: 'loop' }, OS.t('Proje: yalnız döngü bölgesi')));
    const groups = [...new Set(FORMATS.map(f => f.group))];
    const fmtSel = el('select', null, groups.map(g => el('optgroup', { label: OS.t(g) }, FORMATS.filter(f => f.group === g).map(f => el('option', { value: f.id }, OS.t(f.label))))));
    const panel = OS.audioLab.panel(() => { P.clearCache(); prepare(); });
    const warn = el('div', { style: 'color:var(--warn,#e0a93b);font-size:12px;text-align:center;min-height:1em' });
    const note = () => { const f = fmtOf(fmtSel.value); warn.textContent = srcSel.value === 'dj' && f.lossless ? OS.t('Bu kaynak 128 kbps sıkıştırılmış bellekten gelir, dağıtım için uygun değil. Seti Kaydet ile alınmış WAV kaydını veya projeyi seçin.') : ''; };
    const choice = () => ({ source: srcSel.value, format: fmtSel.value });
    const status = el('div', { class: 'muted', style: 'min-height:1.4em;text-align:center' }), bar = el('div', { style: 'height:6px;width:0;background:var(--acc);border-radius:3px;transition:width .15s' }), barBox = el('div', { style: 'height:6px;background:var(--bg);border-radius:3px;overflow:hidden' }, bar);
    const qr = el('canvas', { style: 'width:min(340px,70vw);height:auto;background:#fff;border-radius:6px;image-rendering:pixelated;align-self:center' });
    const set = (txt, k) => { status.textContent = txt; bar.style.width = k == null ? '0' : Math.round(k * 100) + '%'; };
    const sendBtn = el('button', { class: 'btn primary', disabled: !P.isOpen(), onclick: () => { const c = choice(); P.sendAll(c.source, c.format); } }, OS.t('Telefona gönder'));
    P.onStatus = set;
    P.onPeers = () => { sendBtn.disabled = !P.isOpen(); };
    P.onRelays = n => { if (!P.isOpen() && status.dataset.wait) set(n ? OS.t('Telefon kamerasıyla okutun. Müzik hemen gelir.') : OS.t('Bağlantı servislerine ulaşılamıyor. İnternet bağlantısını kontrol edin.')); };
    // Şarkı önceden hazırlanır: telefon okutunca hemen gider
    const prepare = () => { const c = choice(); if (c.source !== 'dj' && !fmtOf(c.format).lossless) P.makeFile(c.source, c.format).catch(e => set(e.message)); };
    const onChange = () => { P.clearCache(); note(); prepare(); };
    srcSel.onchange = onChange; fmtSel.onchange = () => { note(); prepare(); };
    const saveBtn = el('button', { class: 'btn', onclick: async () => { const c = choice(); saveBtn.disabled = true; try { set(OS.t('Hazırlanıyor…'), 0); const f = await P.makeFile(c.source, c.format, k => set(OS.t('Hazırlanıyor…'), k)); U.download(f, f.name); set(f.name + ' · ' + (f.size / 1048576).toFixed(1) + ' MB · ' + (f.kbps ? f.kbps + ' kbps · ' : '') + OS.audioLab.dbStr(f.lufs) + ' LUFS · ' + OS.audioLab.dbStr(f.peakDb) + ' dBTP', 1); } catch (e) { console.error(e); set(e.message); } saveBtn.disabled = false; } }, OS.t('Bilgisayara kaydet'));
    const body = el('div', { style: 'display:flex;flex-direction:column;gap:10px;width:min(520px,86vw)' },
      el('div', { class: 'row', style: 'justify-content:center' }, el('label', { class: 'field' }, OS.t('Kaynak'), srcSel), el('label', { class: 'field' }, OS.t('Biçim'), fmtSel)),
      panel, warn,
      qr, status, barBox,
      el('p', { class: 'muted', style: 'margin:0;text-align:center' }, OS.t('Müzik sunucuya yüklenmez, doğrudan telefona gider. Bağlantı kurulurken yalnız şifreli bağlantı bilgisi aracı servisten geçer.')));
    const m = U.modal(OS.t('Telefona Gönder'), body, [{ label: 'Kapat' }]);
    m.box.querySelector('.modal-buttons').prepend(el('button', { class: 'btn', onclick: () => OS.converter.open() }, OS.t('Format Dönüştürücü')));
    m.box.querySelector('.modal-buttons').append(saveBtn, sendBtn);
    note();
    status.dataset.wait = '1';
    set(OS.t('Bağlantı hazırlanıyor…'));
    P.startSession(choice).then(s => {
      window.OSQR.draw(qr, s.url, 460);
      set(P.isOpen() ? OS.t('Telefon bağlı') : OS.t('Telefon kamerasıyla okutun. Müzik hemen gelir.'));
    }).catch(e => { console.error(e); set(OS.t('Gönderilemedi') + ': ' + e.message); });
    prepare();
    P._dialog = { srcSel, fmtSel, status, sendBtn, saveBtn, qr, warn, panel };
  };
})(window.OS);
