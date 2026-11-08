/* Mr. Mars Music Studio · MRH DGN — video geçişleri: iki görüntüyü GPU üzerinde birleştiren gölgelendiriciler.
   Her geçiş A() ve B() kaynaklarını ve 0-1 arası k değerini kullanır. */
(function (OS) {
  const DJ = OS.ui.dj;
  const G = DJ.gecis = {};
  const LIST = G.LIST = [
    ['fade', 'Fade', 'return mix(A(uv),B(uv),k);'],
    ['black', 'Siyaha geçiş', 'float d=abs(k-.5)*2.;return (k<.5?A(uv):B(uv))*d;'],
    ['white', 'Beyaza geçiş', 'float d=1.-abs(k-.5)*2.;return mix(k<.5?A(uv):B(uv),vec4(1.),d*d);'],
    ['wipe', 'Sola sil', 'return uv.x<k?B(uv):A(uv);'],
    ['wipeR', 'Sağa sil', 'return uv.x>1.-k?B(uv):A(uv);'],
    ['wipeU', 'Yukarı sil', 'return uv.y<k?B(uv):A(uv);'],
    ['wipeD', 'Aşağı sil', 'return uv.y>1.-k?B(uv):A(uv);'],
    ['soft', 'Yumuşak sil', 'return mix(A(uv),B(uv),smoothstep(0.,.25,k*1.25-uv.x));'],
    ['diag', 'Çapraz sil', 'return (uv.x+uv.y)*.5<k?B(uv):A(uv);'],
    ['iris', 'Daire açıl', 'return length((uv-.5)*vec2(1.78,1.))<k*1.05?B(uv):A(uv);'],
    ['irisI', 'Daire kapan', 'return length((uv-.5)*vec2(1.78,1.))>(1.-k)*1.05?B(uv):A(uv);'],
    ['clock', 'Saat', 'return (atan(uv.x-.5,uv.y-.5)+3.14159)/6.28318<k?B(uv):A(uv);'],
    ['blindsH', 'Yatay panjur', 'return fract(uv.y*10.)<k?B(uv):A(uv);'],
    ['blindsV', 'Dikey panjur', 'return fract(uv.x*14.)<k?B(uv):A(uv);'],
    ['checker', 'Dama', 'vec2 c=floor(uv*vec2(16.,9.));float o=mod(c.x+c.y,2.)*.5;return k*1.5-o>fract(uv.x*16.)*.5?B(uv):A(uv);'],
    ['dissolve', 'Toz', 'return rnd(floor(uv*vec2(480.,270.)))<k?B(uv):A(uv);'],
    ['tiles', 'Karolar', 'return rnd(floor(uv*vec2(16.,9.)))<k?B(uv):A(uv);'],
    ['pixel', 'Piksel', 'float s=(1.-abs(k-.5)*2.);s=mix(1.,60.,s*s);vec2 q=(floor(uv*vec2(160.,90.)/s)+.5)*s/vec2(160.,90.);return mix(A(q),B(q),step(.5,k));'],
    ['zoomI', 'İçe zoom', 'vec2 c=uv-.5;return mix(A(c*(1.-k*.8)+.5),B(c*(1.+(1.-k)*2.)+.5),k);'],
    ['zoomO', 'Dışa zoom', 'vec2 c=uv-.5;return mix(A(c*(1.+k*2.)+.5),B(c*(1.-(1.-k)*.8)+.5),k);'],
    ['zoom', 'Zoom', 'vec2 c=uv-.5;float z=1./(.6+.4*k);return mix(A(uv),B(c*z+.5),k);'],
    ['spin', 'Dönüş', 'vec2 c=(uv-.5)*vec2(1.78,1.);float a=k*6.283,s=sin(a),q=cos(a),z=1.+sin(k*3.14159)*2.;c=mat2(q,-s,s,q)*c*z;vec2 p=c/vec2(1.78,1.)+.5;return mix(A(p),B(p),smoothstep(.3,.7,k));'],
    ['slideL', 'Soldan kay', 'vec2 p=uv+vec2(1.-k,0.);return p.x<1.?B(p):A(uv);'],
    ['slideR', 'Sağdan kay', 'vec2 p=uv-vec2(1.-k,0.);return p.x>0.?B(p):A(uv);'],
    ['slideU', 'Alttan kay', 'vec2 p=uv+vec2(0.,1.-k);return p.y<1.?B(p):A(uv);'],
    ['slideD', 'Üstten kay', 'vec2 p=uv-vec2(0.,1.-k);return p.y>0.?B(p):A(uv);'],
    ['pushL', 'Sola it', 'float x=uv.x+k;return x<1.?A(vec2(x,uv.y)):B(vec2(x-1.,uv.y));'],
    ['pushU', 'Yukarı it', 'float y=uv.y+k;return y<1.?A(vec2(uv.x,y)):B(vec2(uv.x,y-1.));'],
    ['doors', 'Kapılar', 'float o=k*.5,d=abs(uv.x-.5);if(d<o)return B(uv);return A(vec2(uv.x<.5?uv.x+o:uv.x-o,uv.y));'],
    ['flip', 'Çevir', 'float a=k*3.14159,c=cos(a);vec2 p=vec2((uv.x-.5)/max(abs(c),.001)+.5,(uv.y-.5)/(1.-abs(sin(a))*.2*(uv.x-.5)*(c>0.?1.:-1.))+.5);if(p.x<0.||p.x>1.||p.y<0.||p.y>1.)return vec4(0.,0.,0.,1.);return c>0.?A(p):B(vec2(1.-p.x,p.y));'],
    ['box', 'Kutu', 'float a=k*1.5708,w=sin(a);float x0=1.-w;if(uv.x>x0){vec2 p=vec2((uv.x-x0)/max(w,.001),.5+(uv.y-.5)/(.85+.15*w));return B(p)*(.5+.5*w);}vec2 p=vec2(uv.x/max(x0,.001),.5+(uv.y-.5)/(1.-.15*w));return A(p)*(1.-.5*w);'],
    ['ripple', 'Dalgacık', 'vec2 c=uv-.5;float l=length(c),s=sin(k*3.14159);vec2 p=uv+c/max(l,.001)*sin(l*50.-k*30.)*.04*s;return mix(A(p),B(p),k);'],
    ['wave', 'Dalga', 'float s=sin(k*3.14159);vec2 p=uv+vec2(sin(uv.y*18.+k*12.)*.05*s,0.);return mix(A(p),B(p),k);'],
    ['glitch', 'Bozulma', 'float s=sin(k*3.14159),r=rnd(vec2(floor(uv.y*24.),floor(t*18.)));vec2 p=uv+vec2((r-.5)*.3*s,0.);vec4 c=step(.5,k+(r-.5)*.4)>.5?B(p):A(p);c.r=(step(.5,k)>.5?B(p+vec2(.02*s,0.)):A(p+vec2(.02*s,0.))).r;return c;'],
    ['rgb', 'Renk kayması', 'float s=sin(k*3.14159)*.06;vec4 a=mix(A(uv),B(uv),k);a.r=mix(A(uv+vec2(s,0.)).r,B(uv+vec2(s,0.)).r,k);a.b=mix(A(uv-vec2(s,0.)).b,B(uv-vec2(s,0.)).b,k);return a;'],
    ['luma', 'Parlaklık', 'vec4 a=A(uv);return dot(a.rgb,vec3(.3,.6,.1))<k*1.05?B(uv):a;'],
    ['burn', 'Yanma', 'float n=rnd(floor(uv*vec2(160.,90.)))*.25+(uv.y)*.75;float e=k*1.3-n;if(e>.05)return B(uv);if(e>0.)return vec4(1.,.45,.1,1.);return A(uv);'],
    ['kaleido', 'Kaleydoskop', 'float s=sin(k*3.14159);vec2 c=uv-.5;float a=atan(c.y,c.x),l=length(c),n=6.283/8.;a=abs(mod(a,n)-n*.5);vec2 q=vec2(cos(a),sin(a))*l+.5;vec2 p=mix(uv,q,smoothstep(0.,.5,s));return mix(A(p),B(p),smoothstep(.35,.65,k));'],
    ['swirl', 'Girdap', 'float s=sin(k*3.14159);vec2 c=uv-.5;float l=length(c),a=s*(1.-l*1.4)*7.;float n=sin(a),q=cos(a);vec2 p=mat2(q,-n,n,q)*c+.5;return mix(A(p),B(p),k);'],
    ['warp', 'Hız tüneli', 'vec2 c=uv-.5;float s=sin(k*3.14159);vec4 r=vec4(0.);for(float i=0.;i<10.;i++){vec2 p=c*(1.-i*.035*s)+.5;r+=mix(A(p),B(p),k);}return r/10.;'],
    ['tv', 'Tüp TV', 'float h=abs(k-.5)*2.,y=(uv.y-.5)/max(h*h,.004)+.5;if(y<0.||y>1.)return vec4(0.,0.,0.,1.);vec4 c=k<.5?A(vec2(uv.x,y)):B(vec2(uv.x,y));return c+vec4(1.)*(1.-h)*.5;'],
    ['split', 'Ayna böl', 'float o=k*.5,d=abs(uv.y-.5);if(d<o)return B(uv);return A(vec2(uv.x,uv.y<.5?uv.y+o:uv.y-o));'],
  ];
  const HEAD = 'precision mediump float;varying vec2 v;uniform sampler2D a,b;uniform float k,t;vec4 A(vec2 p){return texture2D(a,p);}vec4 B(vec2 p){return texture2D(b,p);}float rnd(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}vec4 tr(vec2 uv){';
  const TAIL = '}void main(){gl_FragColor=tr(v);}';
  let gl, cv, buf, texA, texB; const prog = {}; let failed = false;
  function init(W, H) {
    if (gl || failed) return gl;
    cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    gl = cv.getContext('webgl', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) { failed = true; return null; }
    buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    const tex = () => { const x = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, x); [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(([p, v]) => gl.texParameteri(gl.TEXTURE_2D, p, v)); return x; };
    texA = tex(); texB = tex();
    return gl;
  }
  function compile(id) {
    if (prog[id] !== undefined) return prog[id];
    const def = LIST.find(x => x[0] === id); if (!def) return (prog[id] = null);
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(id, gl.getShaderInfoLog(s)); return null; } return s; };
    const vs = sh(gl.VERTEX_SHADER, 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}'), fs = sh(gl.FRAGMENT_SHADER, HEAD + def[2] + TAIL);
    if (!vs || !fs) return (prog[id] = null);
    const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return (prog[id] = null);
    return (prog[id] = { p, a: gl.getUniformLocation(p, 'a'), b: gl.getUniformLocation(p, 'b'), k: gl.getUniformLocation(p, 'k'), t: gl.getUniformLocation(p, 't'), pos: gl.getAttribLocation(p, 'p') });
  }
  G.ok = id => { if (!init(1280, 720)) return false; return !!compile(id); };
  // ca ve cb kaynak tuvaller; sonuç dönen tuvalde
  G.draw = function (id, ca, cb, k) {
    if (!init(ca.width, ca.height)) return null;
    const P = compile(id); if (!P) return null;
    gl.useProgram(P.p); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(P.pos); gl.vertexAttribPointer(P.pos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texA); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ca); gl.uniform1i(P.a, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texB); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cb); gl.uniform1i(P.b, 1);
    gl.uniform1f(P.k, k); gl.uniform1f(P.t, performance.now() / 1000);
    gl.viewport(0, 0, cv.width, cv.height); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return cv;
  };
})(window.OS);
