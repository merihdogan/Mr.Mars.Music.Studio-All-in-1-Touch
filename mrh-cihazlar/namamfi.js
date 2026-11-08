/* Mr. Mars Music Studio · MRH DGN — gerçek amfi modelleri: gerçek bir amfiden yakalanmış .nam dosyalarını çalar.
   WaveNet ve LSTM mimarileri desteklenir; hesap ses iş parçacığında yapılır. */
(function (OS) {
  const U = OS.U, el = U.el;
  // Model → düz sayı dizileri. Ağırlık sırası model dosyasının biçimidir; uzunluk tutmazsa dosya reddedilir.
  function plan(j) {
    const w = j.weights; let p = 0; const take = n => { const a = new Float32Array(w.slice(p, p + n)); p += n; if (a.length !== n) throw new Error('short'); return a; };
    let net;
    if (j.architecture === 'WaveNet') {
      if (j.config.head) throw new Error('head');
      const arrays = j.config.layers.map(c => {
        if (c.gated) throw new Error('gated');
        const C = c.channels, I = c.input_size, K = c.kernel_size, H = c.head_size;
        const re = take(C * I), layers = c.dilations.map(d => ({ d, conv: take(C * C * K), cb: take(C), mix: take(C * c.condition_size), one: take(C * C), ob: take(C) }));
        const head = take(H * C), hb = c.head_bias ? take(H) : null;
        return { C, I, K, H, re, layers, head, hb, act: c.activation };
      });
      net = { t: 'wn', arrays, scale: w[p++] };
    } else if (j.architecture === 'LSTM') {
      const c = j.config, H = c.hidden_size, I = c.input_size;
      const cells = []; for (let l = 0; l < c.num_layers; l++) { const inp = l ? H : I; cells.push({ w: take(4 * H * (inp + H)), b: take(4 * H), h: take(H), c: take(H), inp }); }
      net = { t: 'lstm', H, cells, head: take(H), hb: w[p++] };
    } else throw new Error('arch');
    if (p !== w.length) throw new Error('weights ' + p + '/' + w.length);
    return net;
  }
  OS.namPlan = plan;
  const WORK = `const T=x=>x<-3?-1:x>3?1:x*(27+x*x)/(27+9*x*x);
  class N extends AudioWorkletProcessor{constructor(){super();this.n=null;this.port.onmessage=e=>{this.init(e.data.net)}}
   init(m){if(m.t==='wn'){let R=1;m.arrays.forEach((a,ai)=>{a.bufs=a.layers.map(l=>{const need=l.d*(a.K-1)+1;let sz=2;while(sz<need)sz*=2;return{sz,mask:sz-1,hist:new Float32Array(sz*a.C),pos:0}});a.input=new Float32Array(a.C);a.z=new Float32Array(a.C);a.next=new Float32Array(a.C);a.hacc=new Float32Array(a.C);a.hout=new Float32Array(a.H)})}else{m.cells.forEach(c=>{c.x=new Float32Array(c.inp+m.H);c.z=new Float32Array(4*m.H)})}this.n=m}
   wn(x){const A=this.n.arrays;let prev=null,hin=null;for(let i=0;i<A.length;i++){const a=A[i],C=a.C,z=a.z,h=a.hacc;if(hin)h.set(hin);else h.fill(0);let cur=a.input;for(let r=0;r<C;r++){let s=0;for(let c=0;c<a.I;c++)s+=a.re[r*a.I+c]*(prev?prev[c]:x);cur[r]=s}
     for(let L=0;L<a.layers.length;L++){const l=a.layers[L],b=a.bufs[L],H=b.hist;b.pos=(b.pos+1)&b.mask;H.set(cur,b.pos*C);z.fill(0);const w=l.conv;let p=0;for(let k=0;k<a.K;k++){const q=((b.pos-l.d*(a.K-1-k))&b.mask)*C;for(let r=0;r<C;r++){let s=0;for(let c=0;c<C;c++)s+=w[p++]*H[q+c];z[r]+=s}}
       for(let r=0;r<C;r++){z[r]=T(z[r]+l.cb[r]+l.mix[r]*x);h[r]+=z[r]}const n=a.next;let o=0;for(let r=0;r<C;r++){let s=l.ob[r];for(let c=0;c<C;c++)s+=l.one[o++]*z[c];n[r]=cur[r]+s}cur.set(n)}
     let o=0;for(let r=0;r<a.H;r++){let s=a.hb?a.hb[r]:0;for(let c=0;c<C;c++)s+=a.head[o++]*h[c];a.hout[r]=s}prev=cur;hin=a.hout}
    return this.n.scale*hin[0]}
   lstm(x){const m=this.n,H=m.H;let inp=null;for(let l=0;l<m.cells.length;l++){const c=m.cells[l],X=c.x,n=c.inp;if(inp)for(let i=0;i<n;i++)X[i]=inp[i];else X[0]=x;for(let i=0;i<H;i++)X[n+i]=c.h[i];const z=c.z,N=n+H;let p=0;for(let r=0;r<4*H;r++){let s=c.b[r];for(let j=0;j<N;j++)s+=c.w[p++]*X[j];z[r]=s}
      const S=v=>1/(1+Math.exp(-v));for(let i=0;i<H;i++){const ig=S(z[i]),fg=S(z[H+i]),g=Math.tanh(z[2*H+i]),og=S(z[3*H+i]);c.c[i]=fg*c.c[i]+ig*g;c.h[i]=og*Math.tanh(c.c[i])}inp=c.h}
    let s=m.hb;for(let i=0;i<H;i++)s+=m.head[i]*inp[i];return s}
   process(inp,out){const a=inp[0]&&inp[0][0],o=out[0][0];if(!o)return true;if(!this.n){if(a)o.set(a);return true}const wn=this.n.t==='wn';for(let i=0;i<o.length;i++){const x=a?a[i]:0;let y=wn?this.wn(x):this.lstm(x);o[i]=y===y?y:0}for(let c=1;c<out[0].length;c++)out[0][c].set(o);return true}}
  registerProcessor('mm-nam',N)`;
  const mods = new WeakMap();
  const addMod = ctx => { if (!mods.has(ctx)) mods.set(ctx, ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORK], { type: 'text/javascript' })))); return mods.get(ctx); };
  OS.plugins.register({
    id: 'fx.nam', name: 'Gerçek Amfi Modeli (.nam)', type: 'effect', category: 'Gitar & Bas',
    params: [{ id: 'in', name: 'Giriş', min: -24, max: 24, def: 0, unit: 'dB' }, { id: 'out', name: 'Çıkış', min: -30, max: 12, def: -6, unit: 'dB' }],
    create(ctx) {
      const inp = ctx.createGain(), out = ctx.createGain(), mono = ctx.createGain(); mono.channelCount = 1; mono.channelCountMode = 'explicit'; inp.connect(out);
      let node = null, model = null, name = '', err = null, ready = Promise.resolve();
      const load = (j, nm) => {
        err = null; let net; try { net = plan(j); } catch (e) { err = OS.t('Bu model dosyası desteklenmiyor'); return Promise.resolve(false); }
        model = j; name = nm || (j.metadata && j.metadata.name) || 'NAM';
        if (net.t === 'wn' && ctx.constructor.name !== 'OfflineAudioContext') { const cost = net.arrays.reduce((s, a) => s + a.layers.length * a.C * a.C * (a.K + 1), 0); if (cost > 7000) U.toast(OS.t('Bu model canlı çalmak için ağır: cızırtı olursa daha hafif (feather / nano) sürümünü deneyin. Mixdown etkilenmez.'), 8000); }
        ready = addMod(ctx).then(() => {
          if (node) { try { inp.disconnect(mono); node.disconnect(); } catch (e) { } } else { try { inp.disconnect(out); } catch (e) { } }
          node = new AudioWorkletNode(ctx, 'mm-nam', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
          node.port.postMessage({ net }); inp.connect(mono); mono.connect(node); node.connect(out); return true;
        });
        return ready;
      };
      return { input: inp, output: out, get ready() { return ready; }, load, info: () => ({ name, err }), restore(x) { if (x && x.model) load(x.model, x.name); }, save: () => model ? { model, name } : {}, set(id, v) { (id === 'in' ? inp : out).gain.value = U.dbToGain(v); } };
    },
    ui(box, dev) {
      const st = el('span', { class: 'muted', style: 'margin-left:8px' }); const show = () => { const i = dev.inst.info(); st.textContent = i.err || i.name || OS.t('Model yüklenmedi'); };
      box.appendChild(el('div', { class: 'row', style: 'margin:6px 0' }, el('button', { class: 'btn sm primary', onclick: async () => { const [f] = await U.pickFiles('.nam'); if (!f) return; let j; try { j = JSON.parse(await U.readAsText(f)); } catch (e) { U.toast(OS.t('Bu model dosyası desteklenmiyor')); return; } await dev.inst.load(j, f.name.replace(/\.nam$/i, '')); show(); } }, OS.t('Amfi modeli yükle (.nam)…')), st));
      show();
    },
  });
})(window.OS);
