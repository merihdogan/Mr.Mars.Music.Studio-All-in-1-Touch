/* Mr. Mars Music Studio · MRH DGN — DJ komut dili: kullanıcı kendi düğmelerini yazar.
   Her komut, kontrolcü eşlemelerinin kullandığı aynı eylemleri çalıştırır.
     A.play ; wait 4b ; B.sync
     if A.playing then B.play else A.play end
     repeat 4  A.hot1 ; wait 1b  end
     fade xfader 1 8b
     set B.vol 0.8
     toast "merhaba"      run "Düğme adı"                                                                  */
(function (OS) {
  const U = OS.U, el = U.el, DJ = OS.ui.dj;
  const S = DJ.script = { buttons: [] };
  try { S.buttons = JSON.parse(localStorage.getItem('os.djscript') || '[]'); } catch (e) { }
  if (!S.buttons.length) S.buttons = [
    { name: 'Geçiş A→B', code: 'B.sync ; B.play ; fade xfader 1 16b ; wait 1b ; A.play' },
    { name: 'Geçiş B→A', code: 'A.sync ; A.play ; fade xfader 0 16b ; wait 1b ; B.play' },
    { name: 'Stutter 4', code: 'repeat 4  A.stutter ; wait 1b  end' },
    { name: 'Bas kes (8)', code: 'A.killlow ; wait 8b ; A.killlow' },
  ];
  const save = () => { try { localStorage.setItem('os.djscript', JSON.stringify(S.buttons)); } catch (e) { } };

  // ---------- Sözlük: düğme gibi çalışanlar ve 0-1 değer alanlar ----------
  const DECK_BTN = ['play', 'cue', 'sync', 'keylock', 'headcue', 'brake', 'spin', 'reverse', 'tap', 'load', 'padnext', 'padprev', 'loopin', 'loopout', 'loophalf', 'loopdouble', 'loopexit', 'loopauto', 'stutter', 'tostart', 'keymatch', 'slip', 'quant', 'vinyl', 'jumpback', 'jumpfwd', 'keyup', 'keydown',
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(n => 'hot' + n), ...['0.25', '0.5', '1', '2', '4', '8', '16', '32'].map(n => 'loop' + n), ...['low', 'mid', 'high', 'lomid', 'himid'].map(b => 'kill' + b), ...['vocals', 'drums', 'bass', 'melody'].map(k => 'stem_' + k)];
  const DECK_VAL = ['vol', 'pitch', 'trim', 'res', 'sendA', 'sendB', 'filter', 'fx', 'fx2', 'fx3', 'eqlow', 'eqmid', 'eqhigh', 'eqlomid', 'eqhimid', ...['vocals', 'drums', 'bass', 'melody'].map(k => 'stemlvl_' + k), ...['vocals', 'drums', 'bass', 'melody'].map(k => 'stemfx_' + k)];
  const GLOBAL_BTN = ['smartmix', 'automix', 'bankprev', 'banknext', 'lib.up', 'lib.down', ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(n => 'pad' + n), ...[0, 1, 2, 3, 4].map(n => 'mfx' + n)];
  const GLOBAL_VAL = ['xfader', 'master', 'mfx', 'cuemix', 'cuevol', 'samplervol'];
  const isDeck = a => /^[ABCD]\./.test(a);
  const kind = a => { const k = isDeck(a) ? a.slice(2) : null; if (k ? DECK_BTN.includes(k) : GLOBAL_BTN.includes(a)) return 'btn'; if (k ? DECK_VAL.includes(k) : GLOBAL_VAL.includes(a)) return 'val'; return null; };
  S.words = () => ({ deckButtons: DECK_BTN, deckValues: DECK_VAL, globalButtons: GLOBAL_BTN, globalValues: GLOBAL_VAL });

  // ---------- Sözdizimi ----------
  function tokens(src) {
    const t = [], re = /\s*(?:#[^\n]*|"([^"]*)"|(>=|<=|!=|==|>|<|;)|([A-Za-z_][\w.]*|[+-]?\d*\.?\d+(?:ms|b|s)?))/gy;
    let m, pos = 0;
    src = src.replace(/\s+$/, '');
    while (pos < src.length) {
      re.lastIndex = pos; m = re.exec(src);
      if (!m) throw new Error(OS.t('Anlaşılamayan yazı') + ': ' + src.slice(pos, pos + 12));
      pos = re.lastIndex;
      if (m[1] !== undefined) t.push({ s: m[1] }); else if (m[2]) t.push({ o: m[2] }); else if (m[3]) t.push({ w: m[3] });
    }
    return t;
  }
  S.parse = function (src) {
    const t = tokens(src); let i = 0;
    const peek = () => t[i], word = w => t[i] && t[i].w === w, eat = w => { if (word(w)) { i++; return true; } return false; };
    const need = w => { if (!eat(w)) throw new Error(OS.t('Eksik') + ': ' + w); };
    const num = () => { const x = t[i++]; if (!x || !x.w || !/^[+-]?\d*\.?\d+(ms|b|s)?$/.test(x.w)) throw new Error(OS.t('Sayı bekleniyor')); return x.w; };
    const skip = () => { while (t[i] && t[i].o === ';') i++; };
    function block(ends) {
      const out = []; skip();
      while (i < t.length && !(t[i].w && ends.includes(t[i].w))) { out.push(stmt()); skip(); }
      return out;
    }
    function atom() {
      if (eat('not')) return { not: atom() };
      const x = t[i++]; if (!x || !x.w) throw new Error(OS.t('Koşul bekleniyor'));
      const name = x.w;
      if (t[i] && t[i].o && t[i].o !== ';') { const op = t[i++].o; return { name, op, val: parseFloat(num()) }; }
      return { name };
    }
    function cond() { let c = atom(); while (word('and') || word('or')) { const op = t[i++].w; c = { op, a: c, b: atom() }; } return c; }
    function stmt() {
      if (eat('if')) { const c = cond(); need('then'); const a = block(['else', 'end']); let b = []; if (eat('else')) b = block(['end']); need('end'); return { k: 'if', c, a, b }; }
      if (eat('repeat')) { const n = parseInt(num(), 10); const a = block(['end']); need('end'); return { k: 'repeat', n, a }; }
      if (eat('wait')) return { k: 'wait', d: num() };
      if (eat('toast')) { const x = t[i++]; return { k: 'toast', s: x && (x.s !== undefined ? x.s : x.w) }; }
      if (eat('run')) { const x = t[i++]; return { k: 'run', s: x && (x.s !== undefined ? x.s : x.w) }; }
      if (eat('set')) { const x = t[i++]; if (!x || !x.w || kind(x.w) !== 'val') throw new Error(OS.t('Bilinmeyen değer') + ': ' + (x && x.w)); return { k: 'set', a: x.w, v: parseFloat(num()) }; }
      if (eat('fade')) { const x = t[i++]; if (!x || !x.w || kind(x.w) !== 'val') throw new Error(OS.t('Bilinmeyen değer') + ': ' + (x && x.w)); const v = parseFloat(num()); return { k: 'fade', a: x.w, v, d: num() }; }
      const x = t[i++];
      if (!x || !x.w) throw new Error(OS.t('Komut bekleniyor'));
      if (kind(x.w) !== 'btn') throw new Error(OS.t('Bilinmeyen komut') + ': ' + x.w);
      return { k: 'act', a: x.w };
    }
    const prog = block([]);
    if (i < t.length) throw new Error(OS.t('Fazla yazı') + ': ' + (t[i].w || t[i].o));
    return prog;
  };

  // ---------- Çalıştırma ----------
  const deckOf = n => DJ.decks[DJ._i.LETTERS.indexOf(n[0])];
  function value(name) {
    if (name === 'xfader') return DJ.xfade;
    if (name === 'shift') return DJ.shift ? 1 : 0;
    if (name === 'time') return performance.now() / 1000;
    if (!isDeck(name)) throw new Error(OS.t('Bilinmeyen değer') + ': ' + name);
    const d = deckOf(name), p = name.slice(2);
    switch (p) {
      case 'playing': return d.playing ? 1 : 0;
      case 'loaded': return d.buffer ? 1 : 0;
      case 'looping': return d.loop ? 1 : 0;
      case 'bpm': return d.bpm ? d.bpm * d.rate : 0;
      case 'pos': return d.position();
      case 'remain': return d.buffer ? d.buffer.duration - d.position() : 0;
      case 'vol': return d.faderVal;
      case 'pitch': return (d.rate - 1) / d.range;
      case 'beat': return d.bpm ? (d.position() - d.grid) / d.beat : 0;
      case 'stems': return d.stems ? 1 : 0;
      case 'keylock': return d.keylock ? 1 : 0;
      default: throw new Error(OS.t('Bilinmeyen değer') + ': ' + name);
    }
  }
  function test(c) {
    if (c.not) return !test(c.not);
    if (c.op === 'and') return test(c.a) && test(c.b);
    if (c.op === 'or') return test(c.a) || test(c.b);
    const v = value(c.name);
    if (!c.op) return !!v;
    return { '>': v > c.val, '<': v < c.val, '>=': v >= c.val, '<=': v <= c.val, '==': v === c.val, '!=': v !== c.val }[c.op];
  }
  // süre: 4b vuruş (çalan deckin temposu), 500ms, 2s; ekisiz sayı vuruş sayılır
  function ms(d) {
    const m = String(d).match(/^([+-]?\d*\.?\d+)(ms|b|s)?$/), v = parseFloat(m[1]);
    if (m[2] === 'ms') return v; if (m[2] === 's') return v * 1000;
    const p = DJ.decks.find(x => x.playing && x.bpm) || DJ.decks.find(x => x.bpm);
    return v * (p ? p.beat / p.eff * 1000 : 500);
  }
  const sleep = (t, run) => new Promise(r => { const id = setTimeout(r, t); run.stop = () => { clearTimeout(id); r(); }; });
  const send = (a, v) => { const k = kind(a); if (k === 'btn') DJ._i.runAction(a, 1, 127, true, false); else DJ._i.runAction(a, v, Math.round(v * 127), false, false); };
  function curVal(a) {
    if (a === 'xfader') return DJ.xfade;
    if (isDeck(a)) { const p = a.slice(2); if (p === 'vol' || p === 'pitch') return p === 'vol' ? value(a) : (value(a) + 1) / 2; }
    return S.last[a] != null ? S.last[a] : 0.5;
  }
  async function exec(list, run, depth) {
    if (depth > 8) throw new Error(OS.t('Çok derin çağrı'));
    for (const s of list) {
      if (run.dead) return;
      switch (s.k) {
        case 'act': send(s.a); break;
        case 'set': S.last[s.a] = s.v; send(s.a, s.v); break;
        case 'wait': await sleep(ms(s.d), run); break;
        case 'toast': U.toast(String(s.s)); break;
        case 'if': await exec(test(s.c) ? s.a : s.b, run, depth); break;
        case 'repeat': for (let n = 0; n < Math.min(s.n, 256) && !run.dead; n++) await exec(s.a, run, depth); break;
        case 'fade': {
          const T = ms(s.d), a = curVal(s.a), t0 = performance.now();
          while (!run.dead) { const k = Math.min(1, (performance.now() - t0) / T), v = a + (s.v - a) * k; send(s.a, v); S.last[s.a] = v; if (k >= 1) break; await sleep(25, run); }
          break;
        }
        case 'run': { const b = S.buttons.find(x => x.name === s.s); if (!b) throw new Error(OS.t('Düğme bulunamadı') + ': ' + s.s); await exec(S.parse(b.code), run, depth + 1); break; }
      }
    }
  }
  S.last = {};
  S.running = new Set();
  S.run = async function (code) {
    const run = { dead: false }; S.running.add(run);
    try { await exec(S.parse(code), run, 0); } catch (e) { U.toast('Script: ' + e.message, 6000); throw e; } finally { S.running.delete(run); DJ.renderInfo(); }
  };
  S.stopAll = () => S.running.forEach(r => { r.dead = true; r.stop && r.stop(); });
  S.ui = function () {
    const box = el('div', { class: 'dj-panel dj-script' });
    const draw = () => {
      box.innerHTML = '';
      box.append(el('div', { class: 'row wrap' }, el('b', null, 'Script'),
        el('button', { class: 'btn sm danger', onclick: S.stopAll }, '■ ' + OS.t('Hepsini durdur')),
        el('button', { class: 'btn sm', onclick: () => { S.buttons.push({ name: OS.t('Düğme') + ' ' + (S.buttons.length + 1), code: '' }); save(); draw(); } }, OS.t('+ Düğme')),
        el('button', { class: 'btn sm', onclick: help }, OS.t('Komut listesi'))),
        el('div', { class: 'script-pads' }, S.buttons.map(b => el('button', { class: 'btn script-pad', onclick: () => S.run(b.code).catch(() => { }) }, b.name))),
        ...S.buttons.map((b, i) => { const msg = el('span', { class: 'muted' }); const check = v => { try { S.parse(v); msg.textContent = '✓'; } catch (e) { msg.textContent = e.message; } };
          const code = el('textarea', { class: 'inp script-code', rows: 2, spellcheck: 'false', oninput: e => { b.code = e.target.value; save(); check(b.code); } }, b.code); check(b.code);
          return el('div', { class: 'script-row' }, el('input', { class: 'inp', value: b.name, style: 'width:130px', onchange: e => { b.name = e.target.value; save(); draw(); } }), code, msg, el('button', { class: 'btn sm danger', onclick: () => { S.buttons.splice(i, 1); save(); draw(); } }, '✕')); }));
    };
    draw();
    return box;
  };
  function help() {
    const W = S.words(), pre = t => el('div', { class: 'code', style: 'white-space:pre-wrap' }, t);
    U.modal(OS.t('Komut listesi'), el('div', { style: 'max-width:640px' },
      pre('A.play ; wait 4b ; B.sync\nif A.playing and A.bpm > 120 then B.play else A.play end\nrepeat 4  A.hot1 ; wait 1b  end\nfade xfader 1 8b\nset B.vol 0.8\ntoast "metin"\nrun "Düğme adı"'),
      el('b', null, 'Deck (A. B. C. D.)'), pre(W.deckButtons.join(' ')), el('b', null, OS.t('Değerler (set / fade, 0-1)')), pre(W.deckValues.join(' ') + '\n' + W.globalValues.join(' ')), el('b', null, OS.t('Genel')), pre(W.globalButtons.join(' ')),
      el('b', null, OS.t('Koşullar')), pre('A.playing A.loaded A.looping A.bpm A.pos A.remain A.vol A.pitch A.beat A.stems A.keylock xfader shift time')), [{ label: 'Tamam', primary: true }]);
  }
})(window.OS);
