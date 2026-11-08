/* Mr. Mars Music Studio · MRH DGN — Enstrüman Kütüphanesi: telli, mızraplı, üflemeli, yaylı, tuşlu ve
   Türk müziği çalgılarının sentezle modellenmiş sesleri (örnek kaydı kullanılmaz) */
(function (OS) {
  const R = OS.plugins.register, U = OS.U;

  // body: gövde rezonansları [frekans, kazanç dB, Q]; hp/lp: genel ton
  const M = [
    // ---- Telli / mızraplı (Karplus-Strong + gövde) ----
    { name: 'Akustik Gitar', group: 'Telli', eng: 'pluck', bright: 0.55, decay: 0.9985, body: [[110, 6, 2], [220, 4, 2], [2500, 3, 1]], lp: 9000 },
    { name: 'Klasik Gitar (Naylon)', group: 'Telli', eng: 'pluck', bright: 0.35, decay: 0.998, body: [[100, 6, 2], [200, 4, 2], [1800, -2, 1]], lp: 6000 },
    { name: 'Elektro Gitar (Temiz)', group: 'Telli', eng: 'pluck', bright: 0.6, decay: 0.9992, body: [[700, 3, 1], [3000, 4, 1.5]], lp: 7000, hp: 90 },
    { name: 'Elektro Gitar (Distorsiyon)', group: 'Telli', eng: 'pluck', bright: 0.7, decay: 0.9995, body: [[800, 5, 1], [2500, 3, 1]], lp: 5000, hp: 100, drive: 18 },
    { name: 'Bas Gitar', group: 'Telli', eng: 'pluck', bright: 0.3, decay: 0.9993, body: [[80, 5, 1.5], [700, 2, 1]], lp: 3500, oct: -1 },
    { name: 'Bağlama / Saz', group: 'Türk Çalgıları', eng: 'pluck', bright: 0.85, decay: 0.9975, body: [[350, 4, 3], [1200, 5, 2], [3500, 6, 2]], lp: 11000, hp: 120, buzz: 0.35, course: 3 },
    { name: 'Cura', group: 'Türk Çalgıları', eng: 'pluck', bright: 0.9, decay: 0.997, body: [[600, 4, 3], [2500, 6, 2]], lp: 12000, hp: 200, buzz: 0.3, course: 2, oct: 1 },
    { name: 'Ud', group: 'Türk Çalgıları', eng: 'pluck', bright: 0.4, decay: 0.997, body: [[90, 7, 2], [250, 5, 2], [1100, 2, 1.5]], lp: 5000, course: 2 },
    { name: 'Kanun', group: 'Türk Çalgıları', eng: 'pluck', bright: 0.8, decay: 0.9988, body: [[200, 4, 2], [1500, 3, 1.5], [4000, 4, 1.5]], lp: 12000, course: 3 },
    { name: 'Cümbüş', group: 'Türk Çalgıları', eng: 'pluck', bright: 0.75, decay: 0.997, body: [[180, 4, 2], [900, 6, 3], [2800, 5, 2]], lp: 9000, buzz: 0.2, course: 2 },
    { name: 'Mandolin', group: 'Telli', eng: 'pluck', bright: 0.8, decay: 0.997, body: [[400, 4, 2], [2000, 4, 2]], lp: 10000, course: 2 },
    { name: 'Banjo', group: 'Telli', eng: 'pluck', bright: 0.9, decay: 0.995, body: [[500, 6, 4], [2000, 6, 2]], lp: 12000, hp: 150 },
    { name: 'Arp (Harp)', group: 'Telli', eng: 'pluck', bright: 0.45, decay: 0.9994, body: [[150, 4, 1.5], [600, 2, 1]], lp: 8000 },
    { name: 'Sitar', group: 'Telli', eng: 'pluck', bright: 0.85, decay: 0.9985, body: [[300, 3, 2], [2000, 6, 3]], lp: 10000, buzz: 0.6 },
    { name: 'Klavsen', group: 'Tuşlu', eng: 'pluck', bright: 0.95, decay: 0.9985, body: [[300, 2, 1], [3000, 4, 1]], lp: 12000, course: 2 },
    // ---- Üflemeli ----
    { name: 'Flüt', group: 'Üflemeli', eng: 'wind', harm: [1, 0.25, 0.1, 0.04, 0.02], breath: 0.12, vib: [5, 12], att: 0.06, lpMul: 6 },
    { name: 'Ney', group: 'Türk Çalgıları', eng: 'wind', harm: [1, 0.18, 0.06, 0.03], breath: 0.3, vib: [4.5, 18], att: 0.12, lpMul: 5, form: [[700, 4, 2]] },
    { name: 'Klarnet', group: 'Üflemeli', eng: 'wind', harm: [1, 0.02, 0.7, 0.02, 0.45, 0.02, 0.28, 0.02, 0.15, 0.01, 0.08], breath: 0.03, vib: [5, 6], att: 0.04, lpMul: 10 },
    { name: 'Klarnet (Türk / Sol)', group: 'Türk Çalgıları', eng: 'wind', harm: [1, 0.05, 0.8, 0.05, 0.55, 0.04, 0.35, 0.03, 0.2], breath: 0.06, vib: [6, 22], att: 0.03, lpMul: 14, form: [[1500, 4, 2]] },
    { name: 'Obua', group: 'Üflemeli', eng: 'wind', harm: [0.6, 1, 0.8, 0.6, 0.4, 0.3, 0.2, 0.15], breath: 0.03, vib: [5, 8], att: 0.05, lpMul: 12, form: [[1100, 6, 3]] },
    { name: 'Saksafon (Alto)', group: 'Üflemeli', eng: 'wind', harm: 'rich', richExp: 0.9, breath: 0.08, vib: [5, 10], att: 0.05, lpMul: 8, form: [[550, 5, 2], [1600, 4, 2]], growl: 0.15 },
    { name: 'Saksafon (Tenor)', group: 'Üflemeli', eng: 'wind', harm: 'rich', richExp: 0.85, breath: 0.1, vib: [4.8, 10], att: 0.06, lpMul: 7, form: [[450, 6, 2], [1300, 4, 2]], growl: 0.25, oct: -1 },
    { name: 'Trompet', group: 'Üflemeli', eng: 'wind', harm: 'rich', richExp: 0.6, breath: 0.02, vib: [5.5, 6], att: 0.035, lpMul: 3, brass: 1, form: [[1300, 5, 1.5]] },
    { name: 'Trombon', group: 'Üflemeli', eng: 'wind', harm: 'rich', richExp: 0.7, breath: 0.02, vib: [5, 5], att: 0.06, lpMul: 3, brass: 1, form: [[600, 5, 1.5]], oct: -1 },
    { name: 'Korno', group: 'Üflemeli', eng: 'wind', harm: 'rich', richExp: 1.1, breath: 0.02, vib: [5, 4], att: 0.08, lpMul: 3, brass: 0.6, form: [[400, 5, 1.5]] },
    { name: 'Zurna', group: 'Türk Çalgıları', eng: 'wind', harm: 'rich', richExp: 0.35, breath: 0.05, vib: [6, 15], att: 0.02, lpMul: 20, form: [[1200, 8, 2], [2800, 6, 2]] },
    { name: 'Mızıka', group: 'Üflemeli', eng: 'wind', harm: [1, 0.6, 0.5, 0.35, 0.25, 0.2, 0.12], breath: 0.06, vib: [6, 10], att: 0.03, lpMul: 8, form: [[1800, 5, 2]] },
    // ---- Yaylı ----
    { name: 'Keman', group: 'Yaylı', eng: 'bow', vib: [5.5, 18], att: 0.09, body: [[290, 5, 2], [1000, 3, 1.5], [2600, 6, 2]], lpMul: 14 },
    { name: 'Viyola', group: 'Yaylı', eng: 'bow', vib: [5.2, 16], att: 0.1, body: [[220, 5, 2], [800, 3, 1.5], [2000, 5, 2]], lpMul: 12 },
    { name: 'Çello', group: 'Yaylı', eng: 'bow', vib: [5, 14], att: 0.12, body: [[110, 6, 2], [500, 4, 1.5], [1500, 3, 2]], lpMul: 10, oct: -1 },
    { name: 'Kontrbas (Yay)', group: 'Yaylı', eng: 'bow', vib: [4.5, 10], att: 0.15, body: [[70, 6, 2], [300, 4, 1.5]], lpMul: 8, oct: -2 },
    { name: 'Kemençe', group: 'Türk Çalgıları', eng: 'bow', vib: [6, 25], att: 0.06, body: [[400, 6, 3], [1400, 5, 2], [3200, 5, 2]], lpMul: 16 },
    { name: 'Yaylı Grubu (Orkestra)', group: 'Yaylı', eng: 'bow', vib: [5, 12], att: 0.3, body: [[250, 4, 1.5], [2500, 3, 1.5]], lpMul: 10, ens: 3 },
    // ---- Tuşlu / vurmalı ----
    { name: 'Piyano', group: 'Tuşlu', eng: 'fm', ratio: 1, index: 1.4, idec: 0.4, dec: 2.8, sus: 0, rel: 0.4, hammer: 0.15, det: 1.5 },
    { name: 'Elektrik Piyano', group: 'Tuşlu', eng: 'fm', ratio: 1, index: 3, idec: 0.9, dec: 2, sus: 0.15, rel: 0.4 },
    { name: 'Org', group: 'Tuşlu', eng: 'organ', bars: [1, 0.8, 0.6, 0, 0.4, 0, 0, 0.3], trem: 6 },
    { name: 'Akordeon', group: 'Tuşlu', eng: 'organ', bars: [1, 0.7, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15], reed: 1, trem: 0, det: 9 },
    { name: 'Marimba', group: 'Vurmalı', eng: 'fm', ratio: 4, index: 2.5, idec: 0.05, dec: 0.6, sus: 0, rel: 0.3 },
    { name: 'Vibrafon', group: 'Vurmalı', eng: 'fm', ratio: 4, index: 1, idec: 0.2, dec: 3, sus: 0, rel: 1, trem: 5 },
    { name: 'Müzik Kutusu / Çelesta', group: 'Vurmalı', eng: 'fm', ratio: 5, index: 2, idec: 0.3, dec: 1.5, sus: 0, rel: 0.6, oct: 1 },
    { name: 'Çan', group: 'Vurmalı', eng: 'fm', ratio: 3.5, index: 6, idec: 2, dec: 4, sus: 0, rel: 2 },
    // ---- Synth / vokal ----
    { name: 'Synth Lead', group: 'Synth', eng: 'synth', wave: 'sawtooth', det: 10, cut: 5, att: 0.01 },
    { name: 'Synth Pad', group: 'Synth', eng: 'synth', wave: 'sawtooth', det: 18, cut: 2.5, att: 0.5, rel: 1.5 },
    { name: 'Koro (Aah)', group: 'Vokal', eng: 'bow', vib: [5, 14], att: 0.25, body: [[700, 10, 5], [1150, 8, 5], [2800, 4, 4]], lpMul: 6, ens: 3, noise: 0.03 },
    // ---- V.05: Afro / Doğu / Batı ekleri (listenin sonuna eklenir, eski projelerdeki sıra bozulmaz) ----
    { name: 'Balafon', group: 'Afro', eng: 'fm', ratio: 4, index: 3, idec: 0.04, dec: 0.55, sus: 0, rel: 0.25, hammer: 0.25 },
    { name: 'Kalimba', group: 'Afro', eng: 'fm', ratio: 3, index: 1.2, idec: 0.08, dec: 1.4, sus: 0, rel: 0.5, det: 4 },
    { name: 'Kora', group: 'Afro', eng: 'pluck', bright: 0.75, decay: 0.9993, body: [[180, 4, 2], [1200, 3, 2], [3500, 2, 2]], lp: 11000 },
    { name: 'Log Drum (Afro / Amapiano)', group: 'Afro', eng: 'fm', ratio: 1, index: 0.3, idec: 0.1, dec: 0.55, sus: 0, rel: 0.2, drop: 2.2, dropT: 0.05, oct: -1 },
    { name: 'Konuşan Davul (perdeli)', group: 'Afro', eng: 'fm', ratio: 1.5, index: 0.8, idec: 0.1, dec: 0.5, sus: 0, rel: 0.2, drop: 0.7, dropT: 0.15, hammer: 0.2 },
    { name: 'Duduk', group: 'Türk Çalgıları', eng: 'wind', harm: [1, 0.6, 0.3, 0.15, 0.08, 0.04], breath: 0.05, vib: [5, 14], att: 0.08, lpMul: 5, form: [[600, 5, 2], [1200, 3, 2]] },
    { name: 'Yaylı Tambur', group: 'Türk Çalgıları', eng: 'bow', vib: [5.5, 15], att: 0.07, body: [[300, 4, 3], [1800, 5, 2], [3500, 4, 2]], lpMul: 14 },
    { name: 'Tanbur', group: 'Türk Çalgıları', eng: 'pluck', bright: 0.6, decay: 0.9993, body: [[150, 5, 2], [900, 4, 2], [3000, 3, 2]], lp: 9000, buzz: 0.1 },
    { name: 'Divan Sazı', group: 'Türk Çalgıları', eng: 'pluck', bright: 0.7, decay: 0.999, body: [[250, 5, 3], [1000, 5, 2], [3200, 5, 2]], lp: 10000, buzz: 0.3, course: 3, oct: -1 },
    { name: 'Analog Sub Bas', group: 'Synth', eng: 'synth', wave: 'sawtooth', det: 3, cut: 1.2, att: 0.005, rel: 0.12, oct: -1 },
    { name: '90’lar House Org Bas', group: 'Synth', eng: 'organ', bars: [1, 0, 0.6, 0, 0.3, 0, 0, 0], trem: 0, oct: -1 },
    { name: 'Analog Poli Pad', group: 'Synth', eng: 'synth', wave: 'sawtooth', det: 14, cut: 2, att: 0.6, rel: 2 },
    { name: 'Elektrik Piyano Yumuşak', group: 'Tuşlu', eng: 'fm', ratio: 1, index: 2.5, idec: 1.2, dec: 3, sus: 0.1, rel: 0.5, trem: 4.5 },
    { name: 'Brass Section', group: 'Üflemeli', eng: 'wind', harm: 'rich', richExp: 0.65, breath: 0.02, vib: [5.5, 6], att: 0.05, lpMul: 3, brass: 1, ens: 3, form: [[1200, 4, 1.5]] },
    // ---- Elektro gitar: manyetik konumu + manyetik rezonansı + amfi + kabin ----
    // pick: pena konumu, pu: manyetik konumları (tel boyuna oran), t60: sönme süresi, damp: tiz kaybı, bright: pena sertliği
    { name: 'E.Gitar · Tek Bobin Sap (Temiz)', group: 'Elektro Gitar', eng: 'gtr', lvl: 1.2, pick: 0.2, pu: [0.25], t60: 3.2, damp: 0.16, bright: 0.6, pre: [[3800, 5, 2]], body: [[120, -2, 1], [2600, 2, 1]], hp: 80, lp: 7500, comp: 1, roomAdd: 0.06 },
    { name: 'E.Gitar · Tek Bobin Ara (Funk)', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.91, pick: 0.14, pu: [0.25, 0.1], t60: 1.6, damp: 0.1, bright: 0.85, pre: [[4300, 6, 2]], body: [[220, -4, 1], [1800, 3, 1]], hp: 130, lp: 9000, comp: 1 },
    { name: 'E.Gitar · Tek Bobin Köprü (Twang)', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.9, pick: 0.11, pu: [0.085], t60: 2.4, damp: 0.08, bright: 0.9, pre: [[4800, 7, 2.5]], body: [[1500, 3, 1], [3200, 3, 1.5]], hp: 140, lp: 9500, comp: 1 },
    { name: 'E.Gitar · Tek Bobin Blues (Overdrive)', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.27, pick: 0.16, pu: [0.22], t60: 3.6, damp: 0.14, bright: 0.7, pre: [[3600, 4, 2]], dist: { hp: 200, g: 3, type: 'tube', k: 1.6, out: 0.7 }, body: [[900, 4, 0.8], [3000, 2, 1.5]], hp: 90, lp: 5200, pvib: [5.2, 12, 0.35] },
    { name: 'E.Gitar · Surf (Reverb + Tremolo)', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.72, pick: 0.09, pu: [0.085], t60: 2.2, damp: 0.08, bright: 0.85, pre: [[4600, 6, 2]], body: [[1300, 2, 1]], hp: 150, lp: 8500, ampTrem: { rate: 5.2, depth: 0.28 }, roomAdd: 0.55 },
    { name: 'E.Gitar · Rockabilly (Slap Eko)', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.53, pick: 0.12, pu: [0.25, 0.09], t60: 1.8, damp: 0.1, bright: 0.8, pre: [[3800, 5, 2]], dist: { hp: 120, g: 1.4, type: 'tube', k: 1, out: 0.95 }, body: [[1400, 3, 1]], hp: 110, lp: 7000, slap: { ms: 115, fb: 0.15, mix: 0.4 } },
    { name: 'E.Gitar · 80’ler Temiz (Chorus)', group: 'Elektro Gitar', eng: 'gtr', lvl: 1.03, pick: 0.14, pu: [0.25, 0.1], t60: 2.8, damp: 0.1, bright: 0.8, pre: [[4200, 5, 2]], body: [[300, -3, 1], [2400, 3, 1]], hp: 120, lp: 9500, comp: 1, chorus: { rate: 0.8, depth: 0.0035, mix: 0.6 }, roomAdd: 0.15 },
    { name: 'E.Gitar · Caz Gövdeli (Çift Bobin Sap)', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.45, pick: 0.3, pu: [0.24, 0.27], t60: 2.4, damp: 0.34, bright: 0.32, pre: [[1900, 3, 1]], body: [[180, 3, 1.5], [420, 2, 1.5], [3000, -5, 1]], hp: 70, lp: 3200 },
    { name: 'E.Gitar · Yarı Gövdeli Blues', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.29, pick: 0.2, pu: [0.21, 0.24], t60: 3, damp: 0.2, bright: 0.55, pre: [[2400, 3, 1.2]], dist: { hp: 150, g: 2.4, type: 'tube', k: 1.5, out: 0.72 }, body: [[220, 2, 1.5], [1000, 3, 0.8]], hp: 85, lp: 4400, pvib: [5, 12, 0.35] },
    { name: 'E.Gitar · Çift Bobin Temiz', group: 'Elektro Gitar', eng: 'gtr', lvl: 1.03, pick: 0.2, pu: [0.21, 0.24], t60: 3.4, damp: 0.2, bright: 0.55, pre: [[2500, 4, 1.2]], body: [[400, 1, 1], [1800, 1, 1]], hp: 80, lp: 6000, comp: 1, roomAdd: 0.06 },
    { name: 'E.Gitar · Klasik Rock (Crunch)', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.3, pick: 0.13, pu: [0.09, 0.125], t60: 3.8, damp: 0.13, bright: 0.75, pre: [[2600, 4, 1.2]], dist: { hp: 220, g: 5, type: 'tube', k: 2.2, g2: 1.5, k2: 1.3, out: 0.5 }, body: [[1100, 4, 0.8], [2800, 3, 1.5]], hp: 90, lp: 4800 },
    { name: 'E.Gitar · Hard Rock (Yüksek Gain)', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.4, pick: 0.11, pu: [0.09, 0.125], t60: 4.8, damp: 0.12, bright: 0.8, pre: [[2500, 4, 1.2]], dist: { hp: 320, g: 9, type: 'asym', k: 3, g2: 3, k2: 2, out: 0.33 }, body: [[900, 3, 0.8], [2800, 5, 1.2]], hp: 90, lp: 4500 },
    { name: 'E.Gitar · Solo Lead (Uzun Sustain)', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.43, pick: 0.15, pu: [0.21, 0.24], t60: 6, damp: 0.14, bright: 0.7, pre: [[2300, 4, 1]], dist: { hp: 280, g: 10, type: 'tube', k: 3, g2: 3, k2: 2, out: 0.3 }, body: [[1000, 5, 0.7], [2400, 3, 1.2]], hp: 110, lp: 4600, pvib: [5.4, 22, 0.3], slap: { ms: 360, fb: 0.32, mix: 0.24 }, roomAdd: 0.2 },
    { name: 'E.Gitar · Modern Metal Ritim', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.73, pick: 0.09, pu: [0.08, 0.115], t60: 5, damp: 0.08, bright: 0.95, palm: 1, pre: [[3000, 5, 1.3]], dist: { hp: 650, g: 14, type: 'asym', k: 4, g2: 3, k2: 2.4, out: 0.26 }, body: [[110, 5, 1.6], [500, -6, 0.9], [2900, 5, 1.3]], hp: 75, lp: 5200 },
    { name: 'E.Gitar · 60’lar Fuzz', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.44, pick: 0.15, pu: [0.25], t60: 4.2, damp: 0.16, bright: 0.7, pre: [[3400, 3, 1.5]], dist: { hp: 90, g: 12, type: 'fuzz', k: 4, out: 0.34 }, body: [[700, 3, 0.8]], hp: 80, lp: 3800, pvib: [5, 14, 0.4] },
    { name: 'E.Gitar · Elektro-Akustik (Piezo)', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.8, pick: 0.17, t60: 2.6, damp: 0.1, bright: 0.85, noise: 0.25, body: [[110, 5, 2], [220, 3, 2], [2800, 4, 1], [6000, 3, 1]], hp: 70, lp: 13000, comp: 1, roomAdd: 0.1 },
    // ---- Perdesiz elektro gitar: yumuşak basış, perdeler arası kayma, geniş titreşim ve makam perdeleri ----
    // scoop: basışta alttan gelme (cent), pvib: titreşim [Hz, cent, gecikme]
    { name: 'Perdesiz E.Gitar · Temiz', group: 'Perdesiz Elektro Gitar (Türk)', eng: 'gtr', lvl: 1.06, fret: 1, pick: 0.2, pu: [0.24], t60: 2.8, damp: 0.24, bright: 0.45, noise: 0.04, scoop: 22, pvib: [5, 20, 0.28], pre: [[2800, 3, 1.5]], body: [[260, 2, 1.5], [1100, 2, 1.2]], hp: 75, lp: 5500, comp: 1, roomAdd: 0.14 },
    { name: 'Perdesiz E.Gitar · Ud Tınısı', group: 'Perdesiz Elektro Gitar (Türk)', eng: 'gtr', lvl: 1.26, fret: 1, course: 2, pick: 0.1, pu: [0.2], t60: 1.7, damp: 0.3, bright: 0.5, noise: 0.08, scoop: 16, pvib: [5.5, 16, 0.3], pre: [[1600, 3, 1.2]], body: [[110, 4, 2], [280, 4, 2], [1100, 2, 1.5]], hp: 70, lp: 4200, comp: 1, roomAdd: 0.1 },
    { name: 'Perdesiz E.Gitar · Saz Tınısı', group: 'Perdesiz Elektro Gitar (Türk)', eng: 'gtr', lvl: 1.05, fret: 1, course: 2, pick: 0.08, pu: [0.1], t60: 1.9, damp: 0.1, bright: 0.85, noise: 0.1, scoop: 12, pvib: [6, 16, 0.3], pre: [[3600, 5, 2]], body: [[350, 3, 3], [1200, 4, 2], [3500, 3, 2]], hp: 130, lp: 8500, comp: 1, roomAdd: 0.08 },
    { name: 'Perdesiz E.Gitar · Yumuşak Caz', group: 'Perdesiz Elektro Gitar (Türk)', eng: 'gtr', lvl: 0.48, fret: 1, pick: 0.3, pu: [0.26], t60: 2.6, damp: 0.42, bright: 0.28, noise: 0.02, scoop: 28, pvib: [4.6, 24, 0.35], pre: [[1500, 2, 1]], body: [[190, 3, 1.5], [2800, -5, 1]], hp: 65, lp: 2800, roomAdd: 0.2 },
    { name: 'Perdesiz E.Gitar · Anadolu Rock (Overdrive)', group: 'Perdesiz Elektro Gitar (Türk)', eng: 'gtr', lvl: 0.31, fret: 1, pick: 0.13, pu: [0.11, 0.14], t60: 3.8, damp: 0.16, bright: 0.68, noise: 0.05, scoop: 20, pvib: [5.4, 22, 0.25], pre: [[2500, 4, 1.2]], dist: { hp: 220, g: 5, type: 'tube', k: 2.2, g2: 1.4, k2: 1.3, out: 0.5 }, body: [[1000, 4, 0.8], [2600, 3, 1.5]], hp: 95, lp: 4600, roomAdd: 0.12 },
    { name: 'Perdesiz E.Gitar · Distorsiyon Solo', group: 'Perdesiz Elektro Gitar (Türk)', eng: 'gtr', lvl: 0.42, fret: 1, pick: 0.15, pu: [0.21, 0.24], t60: 6, damp: 0.16, bright: 0.65, noise: 0.03, scoop: 26, pvib: [5.2, 30, 0.22], pre: [[2300, 4, 1]], dist: { hp: 280, g: 10, type: 'tube', k: 3, g2: 3, k2: 2, out: 0.3 }, body: [[1000, 5, 0.7], [2300, 3, 1.2]], hp: 110, lp: 4300, slap: { ms: 340, fb: 0.28, mix: 0.2 }, roomAdd: 0.22 },
    { name: 'Perdesiz E.Gitar · Ney Tınısı (Kabarma)', group: 'Perdesiz Elektro Gitar (Türk)', eng: 'gtr', lvl: 0.84, fret: 1, pick: 0.22, pu: [0.25], t60: 7, damp: 0.34, bright: 0.3, noise: 0, scoop: 30, swell: 0.22, pvib: [4.5, 22, 0.4], pre: [[1400, 2, 1]], body: [[700, 3, 1.5]], hp: 120, lp: 3600, comp: 1, roomAdd: 0.3 },
    // ---- Türk çalgıları ekleri (listenin sonuna eklenir) ----
    { name: 'Kaval', group: 'Türk Çalgıları', eng: 'wind', harm: [1, 0.32, 0.14, 0.06, 0.03], breath: 0.42, vib: [4.8, 10], att: 0.07, lpMul: 6, form: [[1000, 3, 2]] },
    { name: 'Mey', group: 'Türk Çalgıları', eng: 'wind', harm: 'rich', richExp: 0.95, breath: 0.03, vib: [5, 12], att: 0.06, lpMul: 5, form: [[420, 6, 2], [1050, 5, 2.5]] },
    { name: 'Sipsi', group: 'Türk Çalgıları', eng: 'wind', harm: [1, 0.08, 0.8, 0.08, 0.55, 0.06, 0.38, 0.05, 0.22], breath: 0.07, vib: [6.5, 18], att: 0.015, lpMul: 14, form: [[2400, 6, 2.5]], oct: 1 },
    { name: 'Tulum', group: 'Türk Çalgıları', eng: 'wind', harm: 'rich', richExp: 0.55, breath: 0.04, vib: [6, 3], att: 0.012, lpMul: 16, form: [[1500, 7, 2], [3000, 5, 2]], ens: 2 },
    { name: 'Kabak Kemane', group: 'Türk Çalgıları', eng: 'bow', vib: [5.5, 30], att: 0.05, body: [[500, 6, 3], [1500, 5, 2.5], [3000, 3, 2]], lpMul: 12, noise: 0.05 },
    { name: 'Santur', group: 'Türk Çalgıları', eng: 'pluck', lvl: 0.85, bright: 0.98, decay: 0.9995, body: [[250, -3, 1], [2800, 4, 1.5], [6000, 7, 1.5]], lp: 15000, hp: 180, course: 4 },
    { name: 'Elektro Bağlama', group: 'Türk Çalgıları', eng: 'gtr', lvl: 1.1, course: 3, pick: 0.07, pu: [0.1], t60: 2.2, damp: 0.07, bright: 0.95, noise: 0.12, pre: [[3400, 6, 2]], body: [[350, 3, 3], [1400, 3, 2], [3000, 4, 2]], hp: 140, lp: 9000, comp: 1, roomAdd: 0.12 },
    // ---- Yaylılar: elektrik keman, Avrupa halk yaylıları ve metal sesleri. drone: sabit tel, rasp: tekerlek vızıltısı, symp: rezonans telleri ----
    { name: 'Elektrik Keman (Temiz)', group: 'Yaylı', eng: 'bow', lvl: 1, vib: [5.5, 16], att: 0.05, body: [[600, 2, 1], [2800, 3, 1.5]], lpMul: 16, hp: 180, comp: 1, noise: 0.01, roomAdd: 0.1 },
    { name: 'Elektrik Keman (Metal)', group: 'Yaylı', eng: 'bow', lvl: 0.34, vib: [5.6, 20], att: 0.02, dist: { hp: 300, g: 6, type: 'tube', k: 2.5, g2: 2, k2: 1.6, out: 0.4 }, body: [[1200, 4, 1], [2600, 3, 1.5]], hp: 200, lp: 5000, lpMul: 12, slap: { ms: 340, fb: 0.25, mix: 0.18 } },
    { name: 'Folk Metal Keman', group: 'Yaylı', eng: 'bow', lvl: 0.29, vib: [6, 14], att: 0.03, ens: 2, dist: { hp: 200, g: 1.6, type: 'tube', k: 1.2, out: 0.8 }, body: [[290, 5, 2], [1000, 3, 1.5], [2600, 6, 2]], lpMul: 18, noise: 0.03, lp: 9000 },
    { name: 'Metal Çello (Distorsiyon)', group: 'Yaylı', eng: 'bow', lvl: 0.39, oct: -1, vib: [5, 14], att: 0.04, dist: { hp: 120, g: 8, type: 'tube', k: 3, g2: 2, k2: 1.6, out: 0.35 }, body: [[120, 4, 1.5], [600, 2, 1], [2200, 3, 1.5]], hp: 60, lp: 4200, lpMul: 10 },
    { name: 'Senfonik Metal Yaylıları', group: 'Yaylı', eng: 'bow', lvl: 1.23, ens: 3, vib: [5, 10], att: 0.03, body: [[250, 3, 1.5], [2500, 4, 1.5]], lpMul: 12, comp: 1, roomAdd: 0.3 },
    { name: 'Hurdy Gurdy', group: 'Yaylı', eng: 'bow', lvl: 0.44, ens: 2, vib: [5, 0], att: 0.02, drone: [48, 55], rasp: { rate: 7, amt: 0.09 }, body: [[800, 6, 2.5], [1700, 5, 2.5], [3200, 4, 2]], lpMul: 14, noise: 0.02 },
    { name: 'Elektro Hurdy Gurdy (Metal)', group: 'Yaylı', eng: 'bow', lvl: 0.35, ens: 2, vib: [5, 0], att: 0.015, drone: [48, 55], rasp: { rate: 7, amt: 0.09 }, dist: { hp: 250, g: 6, type: 'tube', k: 2.6, g2: 2, k2: 1.6, out: 0.4 }, body: [[900, 5, 1.5], [2400, 4, 1.5]], hp: 120, lp: 5000, lpMul: 12 },
    { name: 'Nyckelharpa', group: 'Yaylı', eng: 'bow', lvl: 0.43, vib: [5.2, 10], att: 0.05, symp: [62, 67, 69, 74, 79], body: [[350, 4, 2], [1300, 4, 2], [2800, 5, 2]], lpMul: 14, roomAdd: 0.06 },
    { name: 'Hardanger Kemanı', group: 'Yaylı', eng: 'bow', lvl: 0.35, vib: [5.6, 12], att: 0.05, drone: [62], symp: [69, 74, 76, 78, 81], body: [[310, 5, 2], [1100, 3, 1.5], [3000, 6, 2]], lpMul: 18 },
    { name: 'Jouhikko', group: 'Yaylı', eng: 'bow', lvl: 0.36, vib: [4.5, 6], att: 0.08, drone: [50], body: [[240, 6, 2.5], [800, 4, 2]], lpMul: 7, noise: 0.09 },
    { name: 'Gusle', group: 'Yaylı', eng: 'bow', lvl: 0.49, vib: [6, 25], att: 0.04, body: [[400, 7, 3], [1600, 5, 3]], lpMul: 9, noise: 0.12 },
    { name: 'Crwth', group: 'Yaylı', eng: 'bow', lvl: 0.4, vib: [5, 8], att: 0.06, drone: [55], body: [[300, 5, 2], [1200, 4, 2]], lpMul: 10, noise: 0.05 },
    // ---- Elektro gitar: Avrupa metal sesleri ----
    { name: 'E.Gitar · İsveç Death (Testere)', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.47, pick: 0.09, pu: [0.08, 0.115], t60: 5, damp: 0.08, bright: 0.95, palm: 1, pre: [[3000, 5, 1.3]], dist: { hp: 120, g: 16, type: 'fuzz', k: 5, g2: 3, k2: 3, out: 0.25 }, body: [[110, 5, 1.5], [1100, 10, 1.2], [3200, -4, 1.5], [7000, 8, 1.5]], hp: 70, lp: 9000 },
    { name: 'E.Gitar · Göteborg Melodik Death', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.59, pick: 0.1, pu: [0.08, 0.115], t60: 5, damp: 0.09, bright: 0.9, palm: 1, pre: [[2800, 5, 1.3]], dist: { hp: 500, g: 12, type: 'asym', k: 3.5, g2: 3, k2: 2, out: 0.3 }, body: [[120, 3, 1.5], [700, -3, 1], [2600, 5, 1.2]], hp: 80, lp: 5600, pvib: [5.4, 16, 0.3], slap: { ms: 300, fb: 0.2, mix: 0.12 } },
    { name: 'E.Gitar · Norveç Black Metal', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.63, pick: 0.08, pu: [0.08], t60: 4, damp: 0.06, bright: 0.98, pre: [[3400, 5, 1.5]], dist: { hp: 380, g: 14, type: 'fuzz', k: 4, g2: 2, k2: 2, out: 0.28 }, body: [[250, -6, 1], [3000, 6, 1.2], [6000, 5, 1.5]], hp: 160, lp: 7500, roomAdd: 0.25 },
    { name: 'E.Gitar · İngiliz Heavy Metal', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.31, pick: 0.12, pu: [0.09, 0.125], t60: 4.5, damp: 0.12, bright: 0.8, pre: [[2600, 4, 1.2]], dist: { hp: 250, g: 6, type: 'tube', k: 2.6, g2: 1.8, k2: 1.6, out: 0.42 }, body: [[900, 5, 0.8], [2700, 3, 1.4]], hp: 90, lp: 4600, pvib: [5.4, 14, 0.3] },
    { name: 'E.Gitar · Alman Thrash', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.64, pick: 0.09, pu: [0.08, 0.115], t60: 4.5, damp: 0.08, bright: 0.95, palm: 1, pre: [[3000, 5, 1.3]], dist: { hp: 600, g: 13, type: 'asym', k: 4, g2: 2.5, k2: 2.4, out: 0.28 }, body: [[100, 4, 1.6], [450, -7, 0.9], [3000, 6, 1.2]], hp: 75, lp: 5200 },
    { name: 'E.Gitar · Alman Power Metal (Solo)', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.43, pick: 0.14, pu: [0.21, 0.24], t60: 6, damp: 0.13, bright: 0.72, pre: [[2400, 4, 1]], dist: { hp: 300, g: 11, type: 'tube', k: 3, g2: 3, k2: 2, out: 0.3 }, body: [[1000, 5, 0.7], [2500, 4, 1.2]], hp: 110, lp: 4800, pvib: [5.6, 24, 0.25], slap: { ms: 380, fb: 0.34, mix: 0.26 }, roomAdd: 0.22 },
    { name: 'E.Gitar · Neue Deutsche Härte', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.61, pick: 0.09, pu: [0.08, 0.115], t60: 4, damp: 0.09, bright: 0.85, palm: 1, pre: [[2600, 4, 1.3]], dist: { hp: 420, g: 12, type: 'asym', k: 3.5, g2: 2, k2: 2, out: 0.3 }, body: [[90, 6, 1.4], [350, 3, 1.2], [800, -5, 1], [3000, 2, 1.5]], hp: 65, lp: 3800 },
    { name: 'E.Gitar · İngiliz Doom', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.49, pick: 0.2, pu: [0.21, 0.24], t60: 7, damp: 0.22, bright: 0.55, pre: [[2000, 3, 1]], dist: { hp: 70, g: 12, type: 'fuzz', k: 4, out: 0.3 }, body: [[100, 6, 1.2], [600, 3, 0.8], [2500, -3, 1]], hp: 55, lp: 3000, roomAdd: 0.2 },
    { name: 'E.Gitar · Viking / Pagan Metal', group: 'Elektro Gitar', eng: 'gtr', lvl: 0.39, pick: 0.13, pu: [0.09, 0.125], t60: 5, damp: 0.12, bright: 0.78, pre: [[2500, 4, 1.2]], dist: { hp: 300, g: 8, type: 'tube', k: 3, g2: 2, k2: 1.8, out: 0.35 }, body: [[900, 3, 0.8], [2400, 4, 1.2]], hp: 90, lp: 4800, chorus: { rate: 0.5, depth: 0.003, mix: 0.5 }, roomAdd: 0.3 },
    // ---- Elektro bas: low, bozulmamış alt frekansın karışıma eklenen miktarı ----
    { name: 'E.Bas · Parmak (Temiz)', group: 'Elektro Bas', eng: 'gtr', lvl: 0.75, oct: -1, pick: 0.25, pu: [0.22], t60: 3.6, damp: 0.24, bright: 0.45, noise: 0.02, pre: [[900, 3, 1]], body: [[80, 4, 1.4], [700, 2, 1]], hp: 35, lp: 3800, comp: 1 },
    { name: 'E.Bas · Pena (Temiz)', group: 'Elektro Bas', eng: 'gtr', lvl: 0.75, oct: -1, pick: 0.09, pu: [0.16], t60: 3, damp: 0.12, bright: 0.8, noise: 0.05, pre: [[1600, 4, 1.2]], body: [[90, 3, 1.4], [1200, 3, 1.2]], hp: 40, lp: 5000, comp: 1 },
    { name: 'E.Bas · Klasik Heavy Metal (Galop)', group: 'Elektro Bas', eng: 'gtr', lvl: 0.39, oct: -1, pick: 0.09, pu: [0.13], t60: 3.2, damp: 0.1, bright: 0.9, dist: { hp: 200, g: 2.4, type: 'tube', k: 1.6, out: 0.6, low: 0.55 }, body: [[90, 3, 1.4], [1300, 4, 1]], hp: 40, lp: 5000 },
    { name: 'E.Bas · Thrash (Sert Pena)', group: 'Elektro Bas', eng: 'gtr', lvl: 0.61, oct: -1, pick: 0.07, pu: [0.11], t60: 2.6, damp: 0.06, bright: 0.98, palm: 1, pre: [[2400, 6, 1.5]], dist: { hp: 400, g: 5, type: 'asym', k: 3, out: 0.35, low: 0.7 }, body: [[2500, 6, 1.5]], hp: 40, lp: 6500 },
    { name: 'E.Bas · Death Metal (Distorsiyon)', group: 'Elektro Bas', eng: 'gtr', lvl: 0.6, oct: -1, pick: 0.09, pu: [0.12], t60: 3, damp: 0.09, bright: 0.9, palm: 1, dist: { hp: 300, g: 10, type: 'fuzz', k: 4, out: 0.25, low: 0.7 }, body: [[100, 3, 1.4], [1000, 5, 1]], hp: 38, lp: 4500 },
    { name: 'E.Bas · Black Metal (İnce)', group: 'Elektro Bas', eng: 'gtr', lvl: 0.81, oct: -1, pick: 0.08, pu: [0.1], t60: 2.6, damp: 0.08, bright: 0.92, dist: { hp: 450, g: 8, type: 'fuzz', k: 3.5, out: 0.25, low: 0.25 }, body: [[3000, 4, 1.5]], hp: 90, lp: 6000 },
    { name: 'E.Bas · Doom (Fuzz)', group: 'Elektro Bas', eng: 'gtr', lvl: 0.37, oct: -1, pick: 0.22, pu: [0.22], t60: 6, damp: 0.2, bright: 0.55, dist: { hp: 60, g: 10, type: 'fuzz', k: 4, out: 0.3, low: 0.4 }, body: [[70, 5, 1.3], [500, 2, 0.8]], hp: 35, lp: 2500 },
    { name: 'E.Bas · Pagan / Folk Metal', group: 'Elektro Bas', eng: 'gtr', lvl: 0.36, oct: -1, pick: 0.14, pu: [0.18], t60: 3.6, damp: 0.16, bright: 0.68, dist: { hp: 150, g: 3, type: 'tube', k: 2, out: 0.5, low: 0.5 }, body: [[100, 3, 1.4], [800, 2, 1]], hp: 38, lp: 3800, roomAdd: 0.1 },
    { name: 'E.Bas · Modern Metal (Beş Telli)', group: 'Elektro Bas', eng: 'gtr', lvl: 0.76, oct: -1, pick: 0.08, pu: [0.1], t60: 3, damp: 0.07, bright: 0.95, palm: 1, pre: [[2500, 5, 1.4]], dist: { hp: 350, g: 6, type: 'asym', k: 3, out: 0.3, low: 0.8 }, body: [[60, 5, 1.3], [400, -4, 1], [2800, 5, 1.4]], hp: 30, lp: 6000 },
    // ---- Viking çalgıları: arkeolojik buluntulardan bilinen çalgı türlerinin yaklaşık modelleri ----
    { name: 'Tagelharpa', group: 'Viking', eng: 'bow', lvl: 0.59, vib: [4.5, 5], att: 0.1, drone: [45, 52], body: [[210, 7, 2.5], [620, 4, 2], [1500, 2, 2]], lpMul: 6, noise: 0.1 },
    { name: 'Viking Liri', group: 'Viking', eng: 'pluck', lvl: 1.12, bright: 0.38, decay: 0.9975, body: [[140, 5, 2], [420, 4, 2], [1200, 1, 1.5]], lp: 3600, hp: 70 },
    { name: 'Kravik Liri', group: 'Viking', eng: 'pluck', lvl: 0.5, bright: 0.88, decay: 0.998, body: [[220, 3, 2.5], [900, 3, 2], [2800, 7, 1.5], [4500, 5, 1.5]], lp: 11000, hp: 140, buzz: 0.15 },
    { name: 'Bukkehorn', group: 'Viking', eng: 'wind', lvl: 1.04, harm: 'rich', richExp: 0.9, breath: 0.1, vib: [5, 4], att: 0.05, lpMul: 3, brass: 0.8, form: [[850, 6, 2.5], [2000, 3, 2]] },
    { name: 'Lur', group: 'Viking', eng: 'wind', lvl: 1.14, harm: 'rich', richExp: 0.8, breath: 0.05, vib: [4.5, 3], att: 0.1, lpMul: 3, brass: 0.7, form: [[500, 5, 1.5], [1300, 3, 1.5]] },
    { name: 'Savaş Borusu', group: 'Viking', eng: 'wind', lvl: 2.34, oct: -1, ens: 2, harm: 'rich', richExp: 0.65, breath: 0.04, vib: [4, 3], att: 0.14, lpMul: 3, brass: 1, growl: 0.2, form: [[320, 6, 1.5], [900, 4, 1.5]], roomAdd: 0.35 },
    { name: 'Kemik Flüt', group: 'Viking', eng: 'wind', lvl: 0.67, harm: [1, 0.2, 0.22, 0.05, 0.04], breath: 0.5, vib: [5.5, 14], att: 0.05, lpMul: 7, form: [[2400, 5, 2]], oct: 1 },
    { name: 'Viking Pan Flütü', group: 'Viking', eng: 'wind', lvl: 0.67, harm: [1, 0.12, 0.25, 0.03, 0.06], breath: 0.6, vib: [4.6, 7], att: 0.08, lpMul: 5, form: [[1400, 3, 1.5]], roomAdd: 0.15 },
    { name: 'Söğüt Flütü', group: 'Viking', eng: 'wind', lvl: 0.85, harm: [1, 0.5, 0.3, 0.18, 0.1, 0.06], breath: 0.3, vib: [5, 3], att: 0.03, lpMul: 8, form: [[1800, 3, 2]] },
    { name: 'Ağız Arpı', group: 'Viking', eng: 'wind', lvl: 1.82, harm: 'rich', richExp: 0.55, breath: 0, vib: [5, 0], att: 0.004, lpMul: 5, brass: 1, form: [[700, 9, 6], [1700, 8, 6], [3000, 5, 5]] },
    { name: 'Viking Çerçeve Davulu', group: 'Viking', eng: 'fm', lvl: 0.58, ratio: 1.5, index: 0.5, idec: 0.06, dec: 0.6, sus: 0, rel: 0.2, drop: 1.5, dropT: 0.04, hammer: 0.3, oct: -2 },
  ];
  // Aynı çalgı iki yerde olmasın: yerini başka model alanlar listelerden çıkar, eski projelerde çalmaya devam eder
  const SAME = ['Elektro Gitar (Temiz)', 'Elektro Gitar (Distorsiyon)', 'Bas Gitar', 'Jouhikko'];
  M.forEach(m => { if (SAME.includes(m.name)) m.hidden = true; });
  OS.LIBRARY = M;
  // Kendi menü cihazı olan gruplar Enstrüman Kütüphanesi'nde tekrar görünmez
  // Cihaz panelinde kendi sesini atama düğmesi
  function realUI(box, dev) {
    const b = U.el('button', { class: 'btn sm primary', onclick: () => { const n = dev.inst.modelName(); OS.real.dialog(n, OS.t(n)); } }, OS.t('Gerçek ses ata…'));
    const lbl = U.el('span', { class: 'muted', style: 'margin-left:8px' });
    const show = () => { const n = dev.inst.realInfo(); lbl.textContent = n == null ? OS.t('Sentez') : n === 'preset' ? OS.t('Hazır gerçek kayıt') : n; };
    show(); const h = () => setTimeout(show, 60); document.addEventListener('os-real-changed', h); setTimeout(show, 900);
    box.appendChild(U.el('div', { class: 'row', style: 'margin:6px 0' }, b, lbl));
  }
  const OWN = ['Elektro Gitar', 'Elektro Bas', 'Perdesiz Elektro Gitar (Türk)', 'Türk Çalgıları', 'Yaylı', 'Viking'];
  // Çalgı başına makam: tüm projeyi değiştirmeden yalnız bu parçayı komalı çaldırır
  const MAKAMS = ['Rast', 'Uşşak', 'Hüseyni', 'Hicaz', 'Hicazkar', 'Nihavend', 'Kürdi', 'Saba', 'Segah', 'Hüzzam', 'Karcığar', 'Nikriz', 'Muhayyer', 'Bayati Araban', 'Hümayun'];
  const MAKAM_SYS = 'Türk Makamları (53 koma)', NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  OS.LIBRARY_MAKAMS = ['Genel akort'].concat(MAKAMS);

  R({
    id: 'inst.library', name: 'Enstrüman Kütüphanesi', type: 'instrument', category: 'Enstrüman',
    params: [
      { id: 'model', name: 'Enstrüman', type: 'choice', options: M.map(m => m.name), hide: M.map((m, i) => (m.hidden || OWN.includes(m.group)) ? i : -1).filter(i => i >= 0), min: 0, max: M.length - 1, def: 0 },
      { id: 'tone', name: 'Ton', min: -1, max: 1, def: 0 },
      { id: 'expr', name: 'İfade (vibrato)', min: 0, max: 2, def: 1 },
      { id: 'sustain', name: 'Uzunluk', min: 0.3, max: 2, def: 1 },
      { id: 'transpose', name: 'Oktav', min: -2, max: 2, def: 0, step: 1 },
      { id: 'room', name: 'Oda', min: 0, max: 1, def: 0.15 },
      { id: 'vol', name: 'Ses', min: -40, max: 6, def: -6, unit: 'dB' },
      { id: 'makam', name: 'Makam', type: 'choice', options: ['Genel akort'].concat(MAKAMS), min: 0, max: MAKAMS.length, def: 0 },
      { id: 'tonic', name: 'Makam tonu', type: 'choice', options: NOTES, min: 0, max: 11, def: 9 },
      { id: 'glide', name: 'Kayma (perdesiz)', min: 0, max: 0.4, def: 0.07, unit: 's' },
      { id: 'source', name: 'Ses kaynağı', type: 'choice', options: ['Gerçek kayıt', 'Sentez'], min: 0, max: 1, def: 0 },
    ],
    ui: realUI,
    create(ctx) {
      const out = ctx.createGain(), post = ctx.createGain(), dryG = ctx.createGain(), wetG = ctx.createGain(), conv = ctx.createConvolver();
      conv.buffer = U.makeReverbIR(ctx, 1.6, 3, 0.5);
      post.connect(dryG); post.connect(conv); conv.connect(wetG); dryG.connect(out); wetG.connect(out);
      const voiceBus = ctx.createGain();
      const p = { model: 0, tone: 0, expr: 1, sustain: 1, transpose: 0, room: 0.15, makam: 0, tonic: 9, glide: 0.07, source: 0 };
      let chain = [], mods = [], last = null;
      const pitch = nn => { const i = Math.round(p.makam) - 1, deg = i >= 0 && OS.tuning && (OS.tuning.SYSTEMS[MAKAM_SYS] || {})[MAKAMS[i]]; return deg ? OS.tuning.freqIn(nn, deg, Math.round(p.tonic)) : U.midiToFreq(nn); };
      const roomMix = () => { const v = U.clamp(p.room + (m().roomAdd || 0), 0, 1); wetG.gain.value = v * 0.6; dryG.gain.value = 1 - v * 0.3; };
      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      const voices = [], ksCache = new Map(), waves = new Map();
      const m = () => M[Math.round(p.model)];

      // modele özgü ortak son işlem: gövde filtreleri, ton, bozulma
      function buildPost() {
        try { voiceBus.disconnect(); } catch (e) { }
        chain.forEach(n => { try { n.disconnect(); } catch (e) { } });
        chain = [];
        mods.forEach(o => { try { o.stop(); } catch (e) { } }); mods = [];
        const orig = m(), rl = realNow();
        // Temiz akustik kayıt model süzgeçlerinden geçmez; amfili modeller kendi zincirini korur
        const md = rl && !rl.keep ? { name: orig.name } : orig;
        const add = n => { (chain.length ? chain[chain.length - 1] : voiceBus).connect(n); chain.push(n); return n; };
        if (md.hp) { const f = add(ctx.createBiquadFilter()); f.type = 'highpass'; f.frequency.value = md.hp; }
        const peak = ([f, g, q]) => { const b = add(ctx.createBiquadFilter()); b.type = 'peaking'; b.frequency.value = f; b.gain.value = g; b.Q.value = q; };
        (md.pre || []).forEach(peak); // manyetiğin kendi rezonansı amfiden önce gelir
        if (md.comp) { const c = add(ctx.createDynamicsCompressor()); c.threshold.value = -26; c.ratio.value = 3; c.attack.value = 0.008; c.release.value = 0.18; c.knee.value = 12; const g = add(ctx.createGain()); g.gain.value = 0.72; }
        if (md.dist) {
          const d = md.dist, tap = chain.length ? chain[chain.length - 1] : voiceBus, h = add(ctx.createBiquadFilter()); h.type = 'highpass'; h.frequency.value = d.hp || 100;
          const stage = (gain, type, k) => { const g = add(ctx.createGain()); g.gain.value = gain; const ws = add(ctx.createWaveShaper()); ws.curve = U.curve(type, k); ws.oversample = '4x'; };
          stage(d.g, d.type, d.k);
          if (d.g2) { const l = add(ctx.createBiquadFilter()); l.type = 'lowpass'; l.frequency.value = 6500; stage(d.g2, 'soft', d.k2); }
          const dc = add(ctx.createBiquadFilter()); dc.type = 'highpass'; dc.frequency.value = 30;
          const g = add(ctx.createGain()); g.gain.value = d.out;
          if (d.low) { const f = ctx.createBiquadFilter(), lg = ctx.createGain(), merge = ctx.createGain(); f.type = 'lowpass'; f.frequency.value = 180; lg.gain.value = d.low; tap.connect(f); f.connect(lg); lg.connect(merge); g.connect(merge); chain.push(f, lg, merge); }
        }
        if (md.drive) { const g = add(ctx.createGain()); g.gain.value = md.drive; const ws = add(ctx.createWaveShaper()); ws.curve = U.curve('asym', 3); ws.oversample = '4x'; const g2 = add(ctx.createGain()); g2.gain.value = 0.25; }
        (md.body || []).concat(md.form || []).forEach(([f, g, q]) => { const b = add(ctx.createBiquadFilter()); b.type = 'peaking'; b.frequency.value = f; b.gain.value = g; b.Q.value = q; });
        if (md.symp) {
          // Döngü gecikmesi tarayıcıda 128 örnekten kısa olamaz: tiz teller için periyodun katı kullanılır
          const a = add(ctx.createGain()), z = ctx.createGain(); a.connect(z); const parts = [];
          md.symp.forEach(n => { const f = 440 * Math.pow(2, (n - 69) / 12), d = ctx.createDelay(0.1), inp = ctx.createGain(), lp = ctx.createBiquadFilter(), fb = ctx.createGain(), w = ctx.createGain(); d.delayTime.value = Math.ceil(0.0032 * f) / f; inp.gain.value = 0.1; lp.type = 'lowpass'; lp.frequency.value = 6000; lp.Q.value = -3.01; fb.gain.value = 0.97; w.gain.value = 0.35; a.connect(inp); inp.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); d.connect(w); w.connect(z); parts.push(d, inp, lp, fb, w); });
          chain.push(...parts, z);
        }
        const tl = add(ctx.createBiquadFilter()); tl.type = 'highshelf'; tl.frequency.value = 2500; tl.gain.value = p.tone * 9;
        if (md.lp) { const f = add(ctx.createBiquadFilter()); f.type = 'lowpass'; f.frequency.value = md.lp * (1 + p.tone * 0.4); }
        if (md.dist) { const f = add(ctx.createBiquadFilter()); f.type = 'lowpass'; f.frequency.value = md.lp * 1.25 * (1 + p.tone * 0.4); } // kabin: 12 dB yerine 24 dB eğim
        const side = () => { const a = add(ctx.createGain()), z = ctx.createGain(); a.connect(z); return { a, z }; };
        if (md.chorus) {
          const { a, z } = side(), d = ctx.createDelay(0.05), w = ctx.createGain(), o = ctx.createOscillator(), og = ctx.createGain();
          d.delayTime.value = 0.012; o.frequency.value = md.chorus.rate; og.gain.value = md.chorus.depth; w.gain.value = md.chorus.mix;
          o.connect(og); og.connect(d.delayTime); a.connect(d); d.connect(w); w.connect(z); o.start(); mods.push(o); chain.push(d, w, og, z);
        }
        if (md.ampTrem) { const g = add(ctx.createGain()), o = ctx.createOscillator(), og = ctx.createGain(); g.gain.value = 1 - md.ampTrem.depth; o.frequency.value = md.ampTrem.rate; og.gain.value = md.ampTrem.depth; o.connect(og); og.connect(g.gain); o.start(); mods.push(o); }
        if (md.slap) {
          const { a, z } = side(), d = ctx.createDelay(1), fb = ctx.createGain(), w = ctx.createGain();
          d.delayTime.value = md.slap.ms / 1000; fb.gain.value = md.slap.fb; w.gain.value = md.slap.mix;
          a.connect(d); d.connect(fb); fb.connect(d); d.connect(w); w.connect(z); chain.push(d, fb, w, z);
        }
        if (md.lvl) { const g = add(ctx.createGain()); g.gain.value = md.lvl; }
        (chain.length ? chain[chain.length - 1] : voiceBus).connect(post);
        ksCache.clear(); last = null; roomMix();
      }

      function realNow() { return Math.round(p.source) === 0 ? OS.real.active(m().name) : null; }
      let readyP = OS.real.prepare(m().name).then(() => buildPost());
      const refresh = () => { readyP = OS.real.prepare(m().name).then(() => buildPost()); };
      const onReal = e => { if (e.detail.name === m().name) refresh(); };
      document.addEventListener('os-real-changed', onReal);

      function pluckBuf(f, md, vel) {
        const key = Math.round(f * 10) + ':' + p.sustain + ':' + Math.round(vel * 4);
        if (ksCache.has(key)) return ksCache.get(key);
        const sr = ctx.sampleRate, dec = Math.min(0.99995, 1 - (1 - md.decay) / p.sustain), len = Math.floor(sr * Math.min(6, 1.2 + 3 * p.sustain));
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        // Döngü gecikmesi tam periyot olmalı: hat (N + 1 - kesir okuma) + filtre (1 - damp)
        const damp = 0.35 + md.bright * 0.6, P = sr / f - (1 - damp), N = Math.max(2, Math.floor(P)), frac = P - N, line = new Float32Array(N + 1);
        const br = U.clamp(md.bright * (0.7 + vel * 0.4), 0.05, 0.99);
        let lp = 0; for (let i = 0; i <= N; i++) { lp += br * ((Math.random() * 2 - 1) - lp); line[i] = lp; }
        // çekme noktası etkisi: hat içinde tarak filtre
        const pick = Math.max(1, Math.floor(N * 0.13)); for (let i = N; i >= pick; i--) line[i] -= 0.5 * line[i - pick];
        let idx = 0, prev = 0;
        for (let i = 0; i < len; i++) {
          const a = line[idx], b = line[(idx + 1) % (N + 1)], s = a * frac + b * (1 - frac);
          let y = dec * (damp * s + (1 - damp) * prev); prev = s;
          if (md.buzz) { const th = 0.25 * (1 - md.buzz); if (y > th) y = th + (y - th) * 0.4; else if (y < -th) y = -th + (y + th) * 0.4; } // perde teması (cızıltı)
          d[i] = s; line[idx] = y; idx = (idx + 1) % (N + 1);
        }
        if (ksCache.size > 300) ksCache.clear();
        ksCache.set(key, buf); return buf;
      }
      // Elektro gitar teli: hat gecikmesi tam perdeye ayarlanır, kaynak pena atımı, çıkış manyetik konumu
      function gtrBuf(f, md, v) {
        const pm = md.palm && v < 0.55, key = 'g' + Math.round(f * 100) + ':' + p.sustain + ':' + Math.round(v * 4);
        if (ksCache.has(key)) return ksCache.get(key);
        const sr = ctx.sampleRate, P = sr / f, t60 = (md.t60 || 3) * p.sustain * Math.pow(110 / f, 0.4) * (pm ? 0.09 : 1);
        const len = Math.ceil(sr * U.clamp(t60 * 1.25, 0.25, 7)), s = U.clamp((md.damp || 0.2) * Math.pow(220 / f, 0.5) * (pm ? 2.2 : 1), 0.01, 0.5);
        const L = P - s, D = Math.max(2, Math.floor(L)), fr = L - D, size = D + 2, g = Math.pow(10, -3 * (P / sr) / t60);
        // Telin hızı: pena noktasında dikdörtgen atım (harmonikler sin(nπβ)/n), üstüne az miktar sürtünme
        const beta = md.pick || 0.15, wid = Math.max(1, Math.round(beta * D)), exc = new Float32Array(D), a = U.clamp((md.bright || 0.6) * (0.45 + v * 0.75) * (pm ? 0.4 : 1), 0.05, 0.98), nz = md.noise != null ? md.noise : 0.12;
        for (let i = 0; i < D; i++) exc[i] = (i < wid ? 1 - wid / D : -wid / D) + (Math.random() * 2 - 1) * nz;
        let lp = 0; for (let pass = 0; pass < 2; pass++) for (let i = 0; i < D; i++) { lp += a * (exc[i] - lp); exc[i] = lp; }
        let mean = 0; for (let i = 0; i < D; i++) mean += exc[i]; mean /= D; for (let i = 0; i < D; i++) exc[i] -= mean;
        const x = new Float32Array(len), line = new Float32Array(size);
        let w = 0, prev = 0;
        for (let i = 0; i < len; i++) {
          const c = i < D ? exc[i] : line[(w - D + size) % size] * (1 - fr) + line[(w - D - 1 + size + size) % size] * fr;
          line[w] = g * ((1 - s) * c + s * prev); prev = c; w = (w + 1) % size; x[i] = c;
        }
        const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0), pus = md.pu || [];
        let pk = 0;
        for (let i = 0; i < len; i++) {
          let y = x[i];
          if (pus.length) { y = 0; for (let k = 0; k < pus.length; k++) { const j = i - Math.max(1, Math.round(pus[k] * P)); y += x[i] - (j >= 0 ? x[j] : 0); } y /= pus.length; }
          d[i] = y; if (Math.abs(y) > pk) pk = Math.abs(y);
        }
        const nrm = pk ? 0.9 / pk : 1, fade = Math.floor(sr * 0.01);
        for (let i = 0; i < len; i++) d[i] *= nrm * (i > len - fade ? (len - i) / fade : 1);
        if (ksCache.size > 120) ksCache.clear();
        ksCache.set(key, buf); return buf;
      }
      function wave(md) {
        if (waves.has(md.name)) return waves.get(md.name);
        const N = 40, re = new Float32Array(N), im = new Float32Array(N);
        for (let h = 1; h < N; h++) im[h] = md.harm === 'rich' ? 1 / Math.pow(h, md.richExp || 1) : (md.harm[h - 1] || 0);
        const w = ctx.createPeriodicWave(re, im); waves.set(md.name, w); return w;
      }
      const env = (g, t, a, peak, dec, sus) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); if (dec) g.gain.setTargetAtTime(peak * sus, t + a, dec / 3); };

      function noteOn(n, vel, t) {
        t = Math.max(t || 0, ctx.currentTime);
        const md = m(), v = (vel == null ? 100 : vel) / 127;
        const nn = n + 12 * (p.transpose + (md.oct || 0)), f = pitch(nn);
        const amp = ctx.createGain(), press = ctx.createGain(); amp.connect(press); press.connect(voiceBus);
        const src = [], vc = { n, amp, src, released: false, start: t, md, press };
        const rl = realNow();
        if (rl) OS.real.voice(ctx, rl.zones, nn, f, v, t, vc, amp, { palm: md.palm && v < 0.55, sustain: p.sustain, lvl: rl.keep ? 1.1 : 0.85 });
        else if (md.eng === 'gtr') {
          // Perdesiz: önceki notaya bitişikse parmak kayarak gelir ve eski nota susar; akorda kayma olmaz
          let from = 0, slide = false;
          if (md.fret && last && p.glide > 0 && t - last.start > 0.04 && last.f !== f && (last.off == null || (last.off - t < 0.15 && t - last.off < 0.12))) {
            const iv = 1200 * Math.log2(last.f / f);
            if (Math.abs(iv) <= 900) { from = iv; slide = true; off(last.vc, t, 0.03); }
          }
          const buf = gtrBuf(f, md, v), courses = md.course || 1;
          let vg = null;
          if (md.pvib) { const o = ctx.createOscillator(); vg = ctx.createGain(); o.frequency.value = md.pvib[0]; o.connect(vg); vg.gain.setValueAtTime(0, t + md.pvib[2]); vg.gain.linearRampToValueAtTime(md.pvib[1] * p.expr, t + md.pvib[2] + 0.35); o.start(t); src.push(o); }
          for (let c = 0; c < courses; c++) {
            const s = ctx.createBufferSource(), g = ctx.createGain(), base = (c - (courses - 1) / 2) * 3;
            s.buffer = buf; g.gain.value = 0.9 / Math.sqrt(courses); s.connect(g); g.connect(amp);
            const start = slide ? from : -(md.scoop || 0) * (0.6 + 0.4 * v);
            s.detune.setValueAtTime(base + start, t); s.detune.linearRampToValueAtTime(base, t + (slide ? p.glide : 0.055));
            if (vg) vg.connect(s.detune);
            s.start(t + c * 0.007); src.unshift(s);
          }
          const lvl = (0.55 + v * 0.65) * (slide ? 0.8 : 1);
          if (md.swell) { amp.gain.setValueAtTime(0.0001, t); amp.gain.linearRampToValueAtTime(lvl, t + md.swell); } else amp.gain.setValueAtTime(lvl, t);
          vc.auto = buf.duration;
          last = { f, start: t, vc, off: null };
        } else if (md.eng === 'pluck') {
          const courses = md.course || 1;
          for (let c = 0; c < courses; c++) {
            const s = ctx.createBufferSource(), g = ctx.createGain();
            s.buffer = pluckBuf(f * (1 + (c - (courses - 1) / 2) * 0.0015), md, v);
            g.gain.value = 0.9 / Math.sqrt(courses); s.connect(g); g.connect(amp);
            s.start(t + c * 0.006); src.push(s);
          }
          amp.gain.setValueAtTime(0.6 + v * 0.6, t);
          vc.auto = src[0].buffer.duration;
        } else if (md.eng === 'wind' || md.eng === 'bow') {
          const ens = md.ens || 1;
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(18000, f * (md.lpMul || 8) * (0.6 + v * 0.6)); lp.Q.value = 0.7; lp.connect(amp);
          const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = md.vib[0]; vib.connect(vg);
          vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(md.vib[1] * p.expr, t + 0.35); vib.start(t); src.push(vib);
          for (let e = 0; e < ens; e++) {
            const o = ctx.createOscillator(), og = ctx.createGain();
            if (md.eng === 'bow') o.type = 'sawtooth'; else o.setPeriodicWave(wave(md));
            o.frequency.value = f; o.detune.value = ens > 1 ? (e - (ens - 1) / 2) * 9 : 0; vg.connect(o.detune);
            og.gain.value = 0.5 / ens; o.connect(og); og.connect(lp); o.start(t); src.push(o);
          }
          if (md.brass) { lp.frequency.setValueAtTime(f * 1.2, t); lp.frequency.linearRampToValueAtTime(Math.min(16000, f * 9 * (0.5 + v)), t + 0.06); lp.frequency.setTargetAtTime(f * 5 * (0.5 + v), t + 0.08, 0.2); }
          if (md.drone) {
            const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2200; dl.connect(amp);
            md.drone.forEach(d => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = pitch(d); g.gain.value = 0.16; o.connect(g); g.connect(dl); o.start(t); src.push(o); });
            if (md.rasp) { const o = ctx.createOscillator(), l = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), lg = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = pitch(md.drone[0]) * 4; l.type = 'square'; l.frequency.value = md.rasp.rate; bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.5; g.gain.value = md.rasp.amt; lg.gain.value = md.rasp.amt; l.connect(lg); lg.connect(g.gain); o.connect(bp); bp.connect(g); g.connect(amp); o.start(t); l.start(t); src.push(o, l); }
          }
          const br = md.breath || md.noise || (md.eng === 'bow' ? 0.02 : 0);
          if (br) {
            const ns = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
            ns.buffer = noise; ns.loop = true; bp.type = 'bandpass'; bp.frequency.value = Math.min(12000, f * 2); bp.Q.value = 1.5;
            ng.gain.value = br * 1.5; ns.connect(bp); bp.connect(ng); ng.connect(amp); ns.start(t); src.push(ns);
          }
          if (md.growl) { const gr = ctx.createOscillator(), gg = ctx.createGain(); gr.frequency.value = 32; gg.gain.value = md.growl * 0.5; gr.connect(gg); gg.connect(amp.gain); gr.start(t); src.push(gr); }
          env(amp, t, md.att * (1.4 - v * 0.6), 0.5 + v * 0.5, 0.4, 0.85);
        } else if (md.eng === 'fm') {
          const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain();
          car.frequency.value = f; mod.frequency.value = f * md.ratio; mod.connect(mg); mg.connect(car.frequency); car.connect(amp);
          // perde kayması (log drum, konuşan davul)
          if (md.drop) { car.frequency.setValueAtTime(f * md.drop, t); car.frequency.exponentialRampToValueAtTime(f, t + md.dropT); mod.frequency.setValueAtTime(f * md.ratio * md.drop, t); mod.frequency.exponentialRampToValueAtTime(f * md.ratio, t + md.dropT); }
          const peak = f * md.index * (0.4 + v * 0.8);
          mg.gain.setValueAtTime(peak, t); mg.gain.setTargetAtTime(peak * 0.05, t, md.idec);
          car.start(t); mod.start(t); src.push(car, mod);
          if (md.det) { const c2 = ctx.createOscillator(), g2 = ctx.createGain(); c2.frequency.value = f; c2.detune.value = md.det; g2.gain.value = 0.5; mg.connect(c2.frequency); c2.connect(g2); g2.connect(amp); c2.start(t); src.push(c2); }
          if (md.hammer) { const ns = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), hg = ctx.createGain(); ns.buffer = noise; hp.type = 'bandpass'; hp.frequency.value = f * 4; hg.gain.setValueAtTime(md.hammer * v, t); hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); ns.connect(hp); hp.connect(hg); hg.connect(amp); ns.start(t); ns.stop(t + 0.05); }
          if (md.trem) { const tr = ctx.createOscillator(), tg = ctx.createGain(); tr.frequency.value = md.trem; tg.gain.value = 0.15; tr.connect(tg); tg.connect(amp.gain); tr.start(t); src.push(tr); }
          const dec = md.dec * p.sustain * (1.3 - (nn - 60) / 100);
          env(amp, t, 0.003, 0.35 + v * 0.45, Math.max(0.1, dec), md.sus);
          if (!md.sus) vc.auto = dec * 2.2;
        } else if (md.eng === 'organ') {
          const ratios = [0.5, 1, 1.5, 2, 3, 4, 5, 6];
          md.bars.forEach((b, i) => {
            if (!b) return;
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = md.reed ? 'square' : 'sine'; o.frequency.value = f * ratios[i] * (md.reed ? 1 : 1); if (md.reed && i % 2) o.detune.value = md.det;
            g.gain.value = b * (md.reed ? 0.06 : 0.12); o.connect(g); g.connect(amp); o.start(t); src.push(o);
          });
          if (md.trem) { const tr = ctx.createOscillator(), tg = ctx.createGain(); tr.frequency.value = md.trem; tg.gain.value = 0.1; tr.connect(tg); tg.connect(amp.gain); tr.start(t); src.push(tr); }
          env(amp, t, md.reed ? 0.03 : 0.005, 0.6 + v * 0.3, 0.2, 0.95);
        } else {
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(18000, f * md.cut * 4 * (0.5 + v)); lp.Q.value = 2; lp.connect(amp);
          [-1, 0, 1].forEach(k => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = md.wave; o.frequency.value = f; o.detune.value = k * md.det; g.gain.value = 0.25; o.connect(g); g.connect(lp); o.start(t); src.push(o); });
          env(amp, t, md.att, 0.5 + v * 0.4, 0.5, 0.8);
        }
        voices.push(vc);
        src[0].onended = () => { const i = voices.indexOf(vc); if (i >= 0) voices.splice(i, 1); try { amp.disconnect(); } catch (e) { } };
        if (vc.auto) src.forEach(s => { try { s.stop(t + vc.auto + 0.1); } catch (e) { } });
        if (voices.filter(x => !x.released).length > 32) off(voices.find(x => !x.released), t, 0.03);
      }
      function off(vc, t, r) {
        if (!vc || vc.released) return;
        vc.released = true;
        const g = vc.amp.gain;
        if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else g.cancelScheduledValues(t);
        g.setTargetAtTime(0, t, Math.max(0.01, r / 4));
        vc.src.forEach(s => { try { s.stop(t + r * 1.6 + 0.05); } catch (e) { } });
      }
      const relOf0 = md => md.eng === 'gtr' ? 0.1 : md.eng === 'pluck' ? 0.25 * p.sustain : md.eng === 'fm' ? (md.rel || 0.4) : md.eng === 'organ' ? 0.08 : md.rel || 0.18;
      const relOf = md => realNow() ? (OS.real.packOf(md.name) && /fm|pluck|gtr/.test(md.eng) ? 0.3 * p.sustain : 0.16) : relOf0(md);
      buildPost();
      return {
        output: out,
        get ready() { return readyP; },
        modelName: () => m().name,
        noteBend(n, c) { const t = ctx.currentTime; voices.filter(x => x.n === n && !x.released).forEach(vc => vc.src.forEach(s => { if (s.detune) s.detune.setTargetAtTime(c, t, 0.006); })); },
        notePress(n, k) { const t = ctx.currentTime; voices.filter(x => x.n === n && !x.released).forEach(vc => vc.press.gain.setTargetAtTime(0.55 + k * 0.9, t, 0.01)); },
        realInfo: () => { const a = realNow(); return a ? (a.user ? a.label : 'preset') : null; },
        set(id, v) {
          const prev = p[id]; p[id] = v;
          if (id === 'vol') out.gain.value = U.dbToGain(v);
          if (id === 'room') roomMix();
          if (id === 'model' && Math.round(prev) !== Math.round(v)) refresh();
          if (id === 'source' || (id === 'model' && Math.round(prev) !== Math.round(v)) || id === 'tone') buildPost();
          if (id === 'sustain') ksCache.clear();
        },
        noteOn,
        noteOff(n, t) { t = Math.max(t || 0, ctx.currentTime); const vc = voices.find(x => x.n === n && !x.released && x.start <= t + 0.001); if (last && last.vc === vc) last.off = t; if (vc) off(vc, t, relOf(vc.md)); },
        allOff() { voices.forEach(v => off(v, ctx.currentTime, 0.03)); last = null; },
        dispose() { document.removeEventListener('os-real-changed', onReal); mods.forEach(o => { try { o.stop(); } catch (e) { } }); },
      };
    },
  });

  // Enstrüman menüsünde doğrudan görünen gitar cihazları: aynı motor, yalnız kendi modelleri
  const base = OS.plugins.get('inst.library');
  function family(id, name, group, over) {
    const idx = M.map((x, i) => x.group === group ? i : -1).filter(i => i >= 0);
    R({
      id, name, type: 'instrument', category: 'Enstrüman',
      params: base.params.map(q => q.id === 'model' ? Object.assign({}, q, { options: idx.map(i => M[i].name), hide: idx.map((i, k) => M[i].hidden ? k : -1).filter(k => k >= 0), max: idx.length - 1, def: 0 }) : (over[q.id] != null ? Object.assign({}, q, { def: over[q.id] }) : q)),
      ui: realUI,
      create(ctx) { const i = base.create(ctx), o = {}; Object.keys(i).filter(k => k !== 'ready').forEach(k => o[k] = i[k]); Object.defineProperty(o, 'ready', { get: () => i.ready, enumerable: true }); o.set = (k, v) => i.set(k, k === 'model' ? idx[U.clamp(Math.round(v), 0, idx.length - 1)] : v); return o; },
    });
  }
  OS.real.registerPerc();
  family('inst.egtr', 'Elektro Gitarlar', 'Elektro Gitar', {});
  family('inst.fretless', 'Perdesiz Elektro Gitar (Türk)', 'Perdesiz Elektro Gitar (Türk)', { makam: 1 + MAKAMS.indexOf('Hicaz'), room: 0.2 });
  family('inst.turkish', 'Türk Çalgıları', 'Türk Çalgıları', { makam: 1 + MAKAMS.indexOf('Hicaz'), room: 0.2 });
  family('inst.ebass', 'Elektro Baslar', 'Elektro Bas', {});
  family('inst.strings', 'Yaylı Çalgılar', 'Yaylı', {});
  family('inst.viking', 'Viking Çalgıları', 'Viking', { room: 0.3 });
})(window.OS);
