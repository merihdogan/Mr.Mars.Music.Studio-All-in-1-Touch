#!/usr/bin/env node
/* Mr. Mars Music Studio · MRH DGN — canlı yayın köprüsü.
   Tarayıcı radyo sunucusuna doğrudan bağlanamaz. Bu küçük program yalnız bu bilgisayardan bağlantı kabul eder,
   gelen MP3 akışını radyo sunucusuna iletir. Ek paket gerekmez.   Çalıştırma: node yayin-kopru.js [port]      */
const net = require('net'), crypto = require('crypto');
const PORT = +process.argv[2] || 8765;
const ALLOWED = /^(null|file:\/\/.*|https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|https:\/\/merihdogan\.github\.io)$/;

function frame(text) {
  const b = Buffer.from(text), h = b.length < 126 ? Buffer.from([0x81, b.length]) : Buffer.from([0x81, 126, b.length >> 8, b.length & 255]);
  return Buffer.concat([h, b]);
}
function bridge(sock, head) {
  let buf = head, up = null, on = false;
  const say = o => { try { sock.write(frame(JSON.stringify(o))); } catch (e) { } };
  const stop = () => { try { sock.destroy(); } catch (e) { } try { up && up.destroy(); } catch (e) { } };
  function config(c) {
    if (!c.host || !c.port || !/^\/[\w.\-\/]*$/.test(c.mount || '')) { say({ error: 'bad settings' }); return stop(); }
    const clean = v => String(v || '').replace(/[\r\n]/g, ' ');
    up = net.connect(c.port, c.host, () => {
      up.write(['SOURCE ' + c.mount + ' HTTP/1.0', 'Authorization: Basic ' + Buffer.from(clean(c.user) + ':' + clean(c.pass)).toString('base64'), 'User-Agent: MrMars/1.0', 'Content-Type: audio/mpeg', 'Ice-Name: ' + clean(c.name), 'Ice-Public: 0', 'Ice-Audio-Info: bitrate=' + (+c.bitrate || 192), '', ''].join('\r\n'));
    });
    up.once('data', d => {
      const line = d.toString('latin1').split('\r\n')[0];
      if (/^(HTTP|ICY)\/?[\d.]* *200|^HTTP\/[\d.]+ 100/.test(line) || /^OK/.test(line)) { on = true; console.log('Yayında:', c.host + ':' + c.port + c.mount); say({ state: 'on' }); }
      else { console.log('Sunucu yanıtı:', line); say({ error: line.slice(0, 120) }); stop(); }
    });
    up.on('error', e => { say({ error: e.message }); stop(); });
    up.on('close', () => { if (on) console.log('Sunucu bağlantısı kapandı'); stop(); });
  }
  function pump() {
    while (buf.length >= 2) {
      const op = buf[0] & 15, masked = buf[1] & 128; let len = buf[1] & 127, o = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); o = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); o = 10; }
      if (!masked || len > 1 << 24) return stop();
      if (buf.length < o + 4 + len) return;
      const mask = buf.subarray(o, o + 4), data = Buffer.from(buf.subarray(o + 4, o + 4 + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(o + 4 + len);
      if (op === 8) return stop();
      if (op === 9) { sock.write(Buffer.concat([Buffer.from([0x8a, data.length]), data])); continue; }
      if (op === 1 && !up) { try { config(JSON.parse(data.toString())); } catch (e) { stop(); } continue; }
      if (op === 2 && up && on) up.write(data);
    }
  }
  sock.on('data', d => { buf = Buffer.concat([buf, d]); pump(); });
  sock.on('close', stop); sock.on('error', stop);
  pump();
}
const srv = net.createServer(sock => {
  let acc = Buffer.alloc(0);
  const first = d => {
    acc = Buffer.concat([acc, d]);
    const end = acc.indexOf('\r\n\r\n'); if (end < 0) { if (acc.length > 8192) sock.destroy(); return; }
    sock.removeListener('data', first);
    const head = acc.subarray(0, end).toString('latin1'), get = n => (head.match(new RegExp('^' + n + ': *(.*)$', 'im')) || [])[1];
    const key = get('Sec-WebSocket-Key'), origin = (get('Origin') || 'null').trim();
    if (!key || !ALLOWED.test(origin)) { console.log('Reddedildi:', origin); sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    const ok = crypto.createHash('sha1').update(key.trim() + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + ok + '\r\n\r\n');
    bridge(sock, acc.subarray(end + 4));
  };
  sock.on('data', first); sock.on('error', () => { });
});
srv.listen(PORT, '127.0.0.1', () => console.log('Mr. Mars yayın köprüsü hazır: 127.0.0.1:' + PORT));
