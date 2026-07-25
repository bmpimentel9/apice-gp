/**
 * Texturas procedurais geradas em Canvas2D — nenhum arquivo de imagem.
 *
 * O asfalto de uma pista real nunca é uniforme: tem granulação de agregado,
 * juntas de pavimentação, remendos de reasfaltamento com bordas retas e tom
 * diferente, manchas de óleo e marcas de travamento. Superfície lisa e uniforme
 * é o erro nº 1 que faz uma pista renderizada parecer maquete.
 *
 * Tudo é gerado uma única vez no carregamento, em 512², com mipmap e
 * anisotropia — barato de memória e resolve o cintilamento em ângulo raso, que
 * é justamente o ângulo de uma câmera de perseguição.
 */
import { CanvasTexture, RepeatWrapping, LinearMipmapLinearFilter, type WebGLRenderer } from 'three';

const TAM = 512;

function canvas() {
  const c = document.createElement('canvas');
  c.width = TAM;
  c.height = TAM;
  return { c, ctx: c.getContext('2d')! };
}

/** Ruído determinístico, para a textura sair igual em toda sessão. */
function rng(semente: number) {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Asfalto: granulação em duas escalas (o arranjo das pedras e a aspereza de
 * cada pedra), mais juntas, remendos e manchas.
 */
export function texturaAsfalto(): CanvasTexture {
  const { c, ctx } = canvas();
  const r = rng(20260725);

  ctx.fillStyle = '#7a7d84';
  ctx.fillRect(0, 0, TAM, TAM);

  // macro: agregado britado visível
  const img = ctx.getImageData(0, 0, TAM, TAM);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = (r() - 0.5) * 46;
    d[i] = Math.max(0, Math.min(255, d[i] + g));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + g));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + g * 0.9));
  }
  ctx.putImageData(img, 0, 0);

  // micro: pedras individuais um pouco mais claras
  for (let i = 0; i < 2600; i++) {
    const x = r() * TAM, y = r() * TAM;
    const raio = 0.7 + r() * 2.1;
    const tom = 116 + r() * 58;
    ctx.fillStyle = `rgba(${tom},${tom + 2},${tom + 6},${0.16 + r() * 0.3})`;
    ctx.beginPath();
    ctx.arc(x, y, raio, 0, Math.PI * 2);
    ctx.fill();
  }

  // remendos de reasfaltamento: polígonos irregulares, tom mais escuro
  for (let i = 0; i < 3; i++) {
    const cx = r() * TAM, cy = r() * TAM;
    const lados = 5 + Math.floor(r() * 4);
    const raio = 55 + r() * 95;
    ctx.beginPath();
    for (let k = 0; k <= lados; k++) {
      const a = (k / lados) * Math.PI * 2;
      const rr = raio * (0.62 + r() * 0.5);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(58,60,66,${0.2 + r() * 0.16})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,42,47,0.34)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // juntas de pavimentação: linhas finas, levemente onduladas
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 4; i++) {
    const vertical = r() > 0.5;
    const p = r() * TAM;
    ctx.strokeStyle = `rgba(46,48,54,${0.3 + r() * 0.24})`;
    ctx.beginPath();
    for (let t = 0; t <= TAM; t += 16) {
      const desvio = Math.sin(t * 0.02 + i) * 2.2;
      if (vertical) {
        if (t === 0) ctx.moveTo(p + desvio, 0); else ctx.lineTo(p + desvio, t);
      } else {
        if (t === 0) ctx.moveTo(0, p + desvio); else ctx.lineTo(t, p + desvio);
      }
    }
    ctx.stroke();
  }

  // manchas de óleo e sujeira
  for (let i = 0; i < 12; i++) {
    const x = r() * TAM, y = r() * TAM;
    const raio = 8 + r() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, raio);
    g.addColorStop(0, `rgba(38,40,44,${0.16 + r() * 0.14})`);
    g.addColorStop(1, 'rgba(38,40,44,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - raio, y - raio, raio * 2, raio * 2);
  }

  return finalizar(c);
}

/** Escapatória de brita: pedra angular clara, granulometria grossa. */
export function texturaBrita(): CanvasTexture {
  const { c, ctx } = canvas();
  const r = rng(77341);
  ctx.fillStyle = '#b8ac93';
  ctx.fillRect(0, 0, TAM, TAM);
  for (let i = 0; i < 5200; i++) {
    const x = r() * TAM, y = r() * TAM;
    const raio = 1.4 + r() * 3.4;
    const tom = 150 + r() * 70;
    ctx.fillStyle = `rgba(${tom},${tom - 12},${tom - 34},${0.4 + r() * 0.5})`;
    ctx.beginPath();
    ctx.arc(x, y, raio, 0, Math.PI * 2);
    ctx.fill();
    // sombra de contato de cada pedra: é o que dá volume
    ctx.fillStyle = 'rgba(96,84,64,0.28)';
    ctx.beginPath();
    ctx.arc(x + raio * 0.4, y + raio * 0.45, raio * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  return finalizar(c);
}

/** Grama: variação de tom e faixas de corte. */
export function texturaGrama(): CanvasTexture {
  const { c, ctx } = canvas();
  const r = rng(9182);
  ctx.fillStyle = '#3f7a45';
  ctx.fillRect(0, 0, TAM, TAM);
  for (let i = 0; i < 9000; i++) {
    const x = r() * TAM, y = r() * TAM;
    const h = 2 + r() * 5;
    const v = 52 + r() * 60;
    ctx.strokeStyle = `rgba(${v * 0.5},${v + 44},${v * 0.62},${0.3 + r() * 0.45})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 2.2, y - h);
    ctx.stroke();
  }
  return finalizar(c);
}

/** Concreto de escapatória urbana. */
export function texturaConcreto(): CanvasTexture {
  const { c, ctx } = canvas();
  const r = rng(4410);
  ctx.fillStyle = '#9a9a92';
  ctx.fillRect(0, 0, TAM, TAM);
  const img = ctx.getImageData(0, 0, TAM, TAM);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = (r() - 0.5) * 26;
    d[i] += g; d[i + 1] += g; d[i + 2] += g;
  }
  ctx.putImageData(img, 0, 0);
  // placas de concreto
  ctx.strokeStyle = 'rgba(96,96,90,0.5)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo((i * TAM) / 4, 0); ctx.lineTo((i * TAM) / 4, TAM);
    ctx.moveTo(0, (i * TAM) / 4); ctx.lineTo(TAM, (i * TAM) / 4);
    ctx.stroke();
  }
  return finalizar(c);
}

function finalizar(c: HTMLCanvasElement) {
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}

let cache: {
  asfalto: CanvasTexture; brita: CanvasTexture;
  grama: CanvasTexture; concreto: CanvasTexture;
} | null = null;

/** Gera as texturas uma única vez e aplica a anisotropia suportada. */
export function obterTexturas(renderer: WebGLRenderer) {
  if (!cache) {
    cache = {
      asfalto: texturaAsfalto(),
      brita: texturaBrita(),
      grama: texturaGrama(),
      concreto: texturaConcreto(),
    };
    // 8 já elimina o cintilamento em ângulo raso; 16 gasta banda sem ganho
    // perceptível numa tela de celular.
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    for (const t of Object.values(cache)) t.anisotropy = aniso;
  }
  return cache;
}
