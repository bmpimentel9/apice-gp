import zlib from 'node:zlib';
import fs from 'node:fs';

// Gera PNG RGBA sem dependências: IHDR + IDAT (zlib) + IEND.
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(tipo, dados) {
  const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
  const t = Buffer.from(tipo, 'ascii');
  const corpo = Buffer.concat([t, dados]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([len, corpo, crc]);
}
function png(w, h, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const linhas = [];
  for (let y = 0; y < h; y++) {
    linhas.push(Buffer.from([0]));
    linhas.push(pixels.subarray(y * w * 4, (y + 1) * w * 4));
  }
  const idat = zlib.deflateSync(Buffer.concat(linhas), { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Ícone: fundo escuro, curva laranja (o "ápice") e um vértice marcado.
function desenhar(tam) {
  const p = Buffer.alloc(tam * tam * 4);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= tam || y >= tam) return;
    const i = (y * tam + x) * 4;
    const af = a / 255;
    p[i] = Math.round(p[i] * (1 - af) + r * af);
    p[i + 1] = Math.round(p[i + 1] * (1 - af) + g * af);
    p[i + 2] = Math.round(p[i + 2] * (1 - af) + b * af);
    p[i + 3] = 255;
  };
  // fundo com leve gradiente radial
  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      const dx = (x - tam * 0.5) / tam, dy = (y - tam * 0.35) / tam;
      const d = Math.sqrt(dx * dx + dy * dy);
      const f = Math.max(0, 1 - d * 1.9);
      set(x, y, Math.round(7 + f * 34), Math.round(10 + f * 20), Math.round(18 + f * 8));
    }
  }
  // traçado: uma curva em "ápice" desenhada como faixa grossa
  const larg = tam * 0.11;
  const pontos = 900;
  for (let i = 0; i < pontos; i++) {
    const t = i / (pontos - 1);
    // curva em U invertido apertando no vértice: evoca o ápice de uma curva
    const ang = -Math.PI * 0.78 + t * Math.PI * 1.56;
    const raio = tam * (0.3 + 0.05 * Math.cos(ang * 2));
    const cx = tam * 0.5, cy = tam * 0.58;
    const x = cx + Math.sin(ang) * raio;
    const y = cy - Math.cos(ang) * raio * 0.95;
    const perto = Math.abs(t - 0.5) < 0.09;
    for (let oy = -larg; oy <= larg; oy++) {
      for (let ox = -larg; ox <= larg; ox++) {
        if (ox * ox + oy * oy > larg * larg) continue;
        if (perto) set(Math.round(x + ox), Math.round(y + oy), 255, 128, 0);
        else set(Math.round(x + ox), Math.round(y + oy), 236, 238, 244);
      }
    }
  }
  return png(tam, tam, p);
}

for (const tam of [180, 192, 512]) {
  fs.writeFileSync(`public/icon-${tam}.png`, desenhar(tam));
  console.log(`icon-${tam}.png`);
}
fs.copyFileSync('public/icon-180.png', 'public/apple-touch-icon.png');
console.log('apple-touch-icon.png');
