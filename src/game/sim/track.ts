/**
 * Geometria de circuito em tempo de execução.
 *
 * A partir dos pontos centrais brutos, constrói: comprimento de arco, tangentes,
 * normais, curvatura, linha de corrida otimizada e o perfil de velocidade
 * teórico ótimo — que dá o tempo de volta perfeito de graça, sem precisar de
 * telemetria humana nenhuma.
 */
import type { DadosCircuito } from '../data/tracks';
import {
  CLA_CURVA, CDA_CURVA, RHO_AR, MU_LATERAL, MU_LONGITUDINAL, GRAVIDADE,
  MASSA_CARRO, MASSA_PILOTO, POTENCIA_PICO_W, VEL_MAXIMA, VEL_POTENCIA_PLENA,
  FORCA_TRACAO_MAX, FATOR_ARRASTO_RETA,
} from './constants';

export interface AmostraPista {
  x: number; y: number; z: number;      // posição no mundo (Y = altura)
  tx: number; tz: number;               // tangente unitária (plano XZ)
  nx: number; nz: number;               // normal unitária à esquerda
  curvatura: number;                    // 1/raio, assinada
  largura: number;
  inclinacao: number;                   // rad, subida positiva
}

export interface Reta {
  inicio: number; fim: number; comprimento: number;
}

const CELULA = 40; // m, tamanho da célula do grid espacial

export class Pista {
  readonly dados: DadosCircuito;
  readonly n: number;
  readonly comprimento: number;
  readonly largura: number;

  /** Posição central: X, altura, Z. */
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  /** Distância acumulada desde a largada. */
  readonly s: Float32Array;
  readonly tx: Float32Array;
  readonly tz: Float32Array;
  readonly nx: Float32Array;
  readonly nz: Float32Array;
  readonly curvatura: Float32Array;
  readonly inclinacao: Float32Array;

  /** Deslocamento lateral da linha de corrida em relação ao centro. */
  readonly offsetLinha: Float32Array;
  /** Velocidade ótima em cada ponto da linha de corrida (m/s). */
  readonly velocidadeOtima: Float32Array;
  readonly tempoTeorico: number;

  readonly retas: Reta[];
  readonly setores: [number, number, number];

  private grid = new Map<number, number[]>();

  constructor(dados: DadosCircuito) {
    this.dados = dados;
    const pts = dados.pontos;
    const n = (this.n = pts.length);
    this.largura = dados.largura;

    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.pz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.px[i] = pts[i][0];
      this.py[i] = pts[i][2]; // elevação vira altura
      this.pz[i] = pts[i][1];
    }

    // comprimento de arco
    this.s = new Float32Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      this.s[i] = acc;
      acc += this.distPlano(i, (i + 1) % n);
    }
    this.comprimento = acc;

    // tangentes e normais (diferenças centrais no plano)
    this.tx = new Float32Array(n);
    this.tz = new Float32Array(n);
    this.nx = new Float32Array(n);
    this.nz = new Float32Array(n);
    this.inclinacao = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      let dx = this.px[b] - this.px[a];
      let dz = this.pz[b] - this.pz[a];
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      this.tx[i] = dx; this.tz[i] = dz;
      this.nx[i] = -dz; this.nz[i] = dx; // normal à esquerda
      const dy = this.py[b] - this.py[a];
      this.inclinacao[i] = Math.atan2(dy, len);
    }

    // curvatura assinada por circunferência de três pontos
    this.curvatura = new Float32Array(n);
    const span = 2;
    for (let i = 0; i < n; i++) {
      const a = (i - span + n) % n;
      const c = (i + span) % n;
      const ax = this.px[a] - this.px[i], az = this.pz[a] - this.pz[i];
      const cx = this.px[c] - this.px[i], cz = this.pz[c] - this.pz[i];
      const cross = ax * cz - az * cx;
      const la = Math.hypot(ax, az), lc = Math.hypot(cx, cz);
      const lac = Math.hypot(this.px[a] - this.px[c], this.pz[a] - this.pz[c]);
      const den = la * lc * lac;
      this.curvatura[i] = den < 1e-6 ? 0 : (2 * cross) / den;
    }

    this.construirGrid();
    this.offsetLinha = this.calcularLinhaDeCorrida();
    this.velocidadeOtima = this.calcularPerfilVelocidade();
    this.tempoTeorico = this.calcularTempoTeorico();
    this.retas = this.detectarRetas();
    this.setores = [0, Math.floor(n / 3), Math.floor((2 * n) / 3)];
  }

  private distPlano(i: number, j: number) {
    return Math.hypot(this.px[j] - this.px[i], this.pz[j] - this.pz[i]);
  }

  // ── Busca espacial ─────────────────────────────────────────────────────────

  private chave(x: number, z: number) {
    return (Math.floor(x / CELULA) & 0xffff) * 65536 + (Math.floor(z / CELULA) & 0xffff);
  }

  private construirGrid() {
    for (let i = 0; i < this.n; i++) {
      const k = this.chave(this.px[i], this.pz[i]);
      let lista = this.grid.get(k);
      if (!lista) { lista = []; this.grid.set(k, lista); }
      lista.push(i);
    }
  }

  /** Índice do ponto central mais próximo. Busca local se `dica` for dada. */
  indiceMaisProximo(x: number, z: number, dica = -1): number {
    if (dica >= 0) {
      // janela local: o carro não teleporta entre quadros
      let melhor = dica, melhorD = Infinity;
      for (let o = -24; o <= 24; o++) {
        const i = (dica + o + this.n * 2) % this.n;
        const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
        if (d < melhorD) { melhorD = d; melhor = i; }
      }
      if (melhorD < 3600) return melhor; // dentro de 60 m, confia
    }
    let melhor = 0, melhorD = Infinity;
    const cx = Math.floor(x / CELULA), cz = Math.floor(z / CELULA);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const lista = this.grid.get(((cx + ox) & 0xffff) * 65536 + ((cz + oz) & 0xffff));
        if (!lista) continue;
        for (const i of lista) {
          const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
          if (d < melhorD) { melhorD = d; melhor = i; }
        }
      }
    }
    if (melhorD === Infinity) {
      for (let i = 0; i < this.n; i++) {
        const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
        if (d < melhorD) { melhorD = d; melhor = i; }
      }
    }
    return melhor;
  }

  /** Projeta um ponto do mundo na pista. */
  projetar(x: number, z: number, dica = -1) {
    const i = this.indiceMaisProximo(x, z, dica);
    const dx = x - this.px[i], dz = z - this.pz[i];
    const ao_longo = dx * this.tx[i] + dz * this.tz[i];
    const lateral = dx * this.nx[i] + dz * this.nz[i];
    const s = (this.s[i] + ao_longo + this.comprimento) % this.comprimento;
    return { indice: i, s, lateral, altura: this.py[i] };
  }

  /** Amostra a pista por distância de arco, com interpolação linear. */
  amostrar(s: number): AmostraPista {
    const sm = ((s % this.comprimento) + this.comprimento) % this.comprimento;
    // busca binária no arco acumulado
    let lo = 0, hi = this.n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.s[mid] <= sm) lo = mid; else hi = mid - 1;
    }
    const i = lo, j = (i + 1) % this.n;
    const seg = (j === 0 ? this.comprimento : this.s[j]) - this.s[i];
    const t = seg > 0 ? (sm - this.s[i]) / seg : 0;
    const mix = (a: Float32Array) => a[i] + (a[j] - a[i]) * t;
    let tx = mix(this.tx), tz = mix(this.tz);
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    return {
      x: mix(this.px), y: mix(this.py), z: mix(this.pz),
      tx, tz, nx: -tz, nz: tx,
      curvatura: mix(this.curvatura),
      largura: this.largura,
      inclinacao: mix(this.inclinacao),
    };
  }

  /** Altura do terreno da pista num ponto do mundo. */
  alturaEm(x: number, z: number, dica = -1) {
    const i = this.indiceMaisProximo(x, z, dica);
    const j = (i + 1) % this.n;
    const dx = x - this.px[i], dz = z - this.pz[i];
    const ao_longo = dx * this.tx[i] + dz * this.tz[i];
    const seg = this.distPlano(i, j) || 1;
    const t = Math.max(0, Math.min(1, ao_longo / seg));
    return this.py[i] + (this.py[j] - this.py[i]) * t;
  }

  // ── Linha de corrida ───────────────────────────────────────────────────────

  /**
   * Relaxação iterativa: cada ponto migra na direção que reduz a curvatura
   * local, limitado pela largura utilizável. Converge para a trajetória de
   * maior raio possível — que é, na prática, a linha de corrida.
   */
  private calcularLinhaDeCorrida(): Float32Array {
    const n = this.n;
    const limite = this.largura / 2 - 1.4; // margem para o carro caber
    let off = new Float32Array(n);
    const prox = new Float32Array(n);

    for (let iter = 0; iter < 900; iter++) {
      for (let i = 0; i < n; i++) {
        const a = (i - 1 + n) % n, b = (i + 1) % n;
        // posição atual dos três pontos na linha
        const ax = this.px[a] + this.nx[a] * off[a], az = this.pz[a] + this.nz[a] * off[a];
        const bx = this.px[b] + this.nx[b] * off[b], bz = this.pz[b] + this.nz[b] * off[b];
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        // projeta o ponto médio no eixo normal deste nó
        const alvo = (mx - this.px[i]) * this.nx[i] + (mz - this.pz[i]) * this.nz[i];
        let v = off[i] + (alvo - off[i]) * 0.35;
        if (v > limite) v = limite;
        if (v < -limite) v = -limite;
        prox[i] = v;
      }
      off.set(prox);
    }
    return off;
  }

  /** Posição no mundo da linha de corrida no índice i. */
  pontoLinha(i: number): [number, number] {
    return [this.px[i] + this.nx[i] * this.offsetLinha[i], this.pz[i] + this.nz[i] * this.offsetLinha[i]];
  }

  // ── Perfil de velocidade ───────────────────────────────────────────────────

  private massaTotal() { return MASSA_CARRO + MASSA_PILOTO + 30; }

  /** Velocidade máxima em curva de raio R, contando o downforce. */
  velMaximaCurva(raio: number) {
    const m = this.massaTotal();
    const k = 0.5 * RHO_AR * CLA_CURVA;
    const den = m / raio - MU_LATERAL * k;
    if (den <= 0) return VEL_MAXIMA; // downforce sozinho já segura o carro
    const v = Math.sqrt((MU_LATERAL * m * GRAVIDADE) / den);
    return Math.min(v, VEL_MAXIMA);
  }

  private aceleracaoMax(v: number) {
    const m = this.massaTotal();
    const pot = v < VEL_POTENCIA_PLENA ? POTENCIA_PICO_W * (v / VEL_POTENCIA_PLENA) : POTENCIA_PICO_W;
    const fMotor = Math.min(pot / Math.max(v, 3), FORCA_TRACAO_MAX);
    const arrasto = 0.5 * RHO_AR * CDA_CURVA * FATOR_ARRASTO_RETA * v * v;
    // deixa chegar a zero: é o arrasto que define a velocidade máxima real de
    // cada reta, e é isso que impede o carro de bater o limitador em Mônaco.
    return Math.max(0, (fMotor - arrasto) / m);
  }

  private desaceleracaoMax(v: number) {
    const m = this.massaTotal();
    const down = 0.5 * RHO_AR * CLA_CURVA * v * v;
    const atrito = MU_LONGITUDINAL * (m * GRAVIDADE + down);
    const arrasto = 0.5 * RHO_AR * CDA_CURVA * v * v;
    return (atrito + arrasto) / m;
  }

  private calcularPerfilVelocidade(): Float32Array {
    const n = this.n;
    const v = new Float32Array(n);

    // 1) teto por curvatura, medida sobre a própria linha de corrida
    for (let i = 0; i < n; i++) {
      const a = (i - 2 + n) % n, c = (i + 2) % n;
      const [ax, az] = this.pontoLinha(a);
      const [bx, bz] = this.pontoLinha(i);
      const [cx, cz] = this.pontoLinha(c);
      const abx = ax - bx, abz = az - bz, cbx = cx - bx, cbz = cz - bz;
      const cross = abx * cbz - abz * cbx;
      const den = Math.hypot(abx, abz) * Math.hypot(cbx, cbz) * Math.hypot(ax - cx, az - cz);
      const k = den < 1e-6 ? 0 : Math.abs((2 * cross) / den);
      v[i] = k < 1e-5 ? VEL_MAXIMA : this.velMaximaCurva(1 / k);
    }

    const ds = (i: number) => {
      const j = (i + 1) % n;
      const [ax, az] = this.pontoLinha(i);
      const [bx, bz] = this.pontoLinha(j);
      return Math.hypot(bx - ax, bz - az) || 0.1;
    };

    // 2) passada regressiva: propaga o quanto é preciso frear antes de cada curva
    for (let volta = 0; volta < 3; volta++) {
      for (let p = n - 1; p >= 0; p--) {
        const i = p, j = (i + 1) % n;
        const lim = Math.sqrt(v[j] * v[j] + 2 * this.desaceleracaoMax(v[j]) * ds(i));
        if (v[i] > lim) v[i] = lim;
      }
      // 3) passada progressiva: limita pela aceleração disponível
      for (let p = 0; p < n; p++) {
        const i = p, a = (i - 1 + n) % n;
        const lim = Math.sqrt(v[a] * v[a] + 2 * this.aceleracaoMax(v[a]) * ds(a));
        if (v[i] > lim) v[i] = lim;
      }
    }
    return v;
  }

  private calcularTempoTeorico() {
    let t = 0;
    for (let i = 0; i < this.n; i++) {
      const j = (i + 1) % this.n;
      const [ax, az] = this.pontoLinha(i);
      const [bx, bz] = this.pontoLinha(j);
      const d = Math.hypot(bx - ax, bz - az);
      const vm = (this.velocidadeOtima[i] + this.velocidadeOtima[j]) / 2;
      t += d / Math.max(vm, 1);
    }
    return t;
  }

  private detectarRetas(): Reta[] {
    const n = this.n, limiar = 1 / 500;
    const retas: Reta[] = [];
    let i = 0;
    while (i < n) {
      if (Math.abs(this.curvatura[i]) < limiar) {
        let j = i;
        while (j < i + n && Math.abs(this.curvatura[j % n]) < limiar) j++;
        const comp = (j - i) * (this.comprimento / n);
        if (comp > 200) retas.push({ inicio: i % n, fim: (j - 1) % n, comprimento: comp });
        i = j;
      } else i++;
    }
    return retas.sort((a, b) => b.comprimento - a.comprimento);
  }

  /** Setor (0,1,2) de uma distância de arco. */
  setorDe(s: number) {
    const f = s / this.comprimento;
    return f < 1 / 3 ? 0 : f < 2 / 3 ? 1 : 2;
  }

  /** Está dentro dos limites da pista? */
  dentroDaPista(lateral: number) {
    return Math.abs(lateral) <= this.largura / 2;
  }
}

const cache = new Map<string, Pista>();
export function obterPista(dados: DadosCircuito) {
  let p = cache.get(dados.id);
  if (!p) { p = new Pista(dados); cache.set(dados.id, p); }
  return p;
}
