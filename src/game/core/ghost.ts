/**
 * Fantasma: gravação, reprodução e codificação em URL.
 *
 * A ideia central que torna o compartilhamento viável: em vez de gravar
 * posições no mundo (x, z, ângulo) a intervalos de tempo, gravamos **o tempo e
 * o deslocamento lateral a cada 20 metros de pista**. Como o traçado já é
 * conhecido dos dois lados, a posição no mundo é reconstruída a partir dele.
 *
 * O ganho é enorme: cada amostra vira 2 bytes em vez de ~6, e uma volta inteira
 * de Interlagos cabe em cerca de 430 bytes — pouco mais de 580 caracteres em
 * base64url, que passa por WhatsApp e iMessage sem quebrar.
 */
import type { Pista } from '../sim/track';
import type { EstadoCarro } from '../sim/car';

/** Distância entre amostras, em metros de pista. */
export const PASSO_AMOSTRA = 20;
const TEMPO_QUANTUM = 0.004; // s por unidade
const LATERAL_QUANTUM = 0.1; // m por unidade
const LATERAL_OFFSET = 128;

export interface Fantasma {
  pistaId: string;
  tempoTotal: number;
  /** Tempo acumulado em cada marco de 20 m. */
  tempos: Float32Array;
  /** Deslocamento lateral em cada marco. */
  laterais: Float32Array;
  /** Tempos de setor, em segundos. */
  setores: [number, number, number];
  autor?: string;
}

export class GravadorFantasma {
  private tempos: number[] = [];
  private laterais: number[] = [];
  private proximoMarco = 0;
  private setores: number[] = [];
  private setorAtual = 0;

  constructor(private pista: Pista) {}

  reiniciar() {
    this.tempos = [];
    this.laterais = [];
    this.setores = [];
    this.proximoMarco = 0;
    this.setorAtual = 0;
  }

  /** Registra a passagem por marcos de 20 m. Chamar a cada quadro. */
  amostrar(estado: EstadoCarro, tempoVolta: number) {
    const s = estado.s;
    while (this.proximoMarco <= s && this.proximoMarco < this.pista.comprimento) {
      this.tempos.push(tempoVolta);
      this.laterais.push(estado.lateral);
      this.proximoMarco += PASSO_AMOSTRA;
    }
    const setor = this.pista.setorDe(s);
    if (setor !== this.setorAtual) {
      this.setores.push(tempoVolta);
      this.setorAtual = setor;
    }
  }

  finalizar(tempoTotal: number): Fantasma {
    const s: [number, number, number] = [
      this.setores[0] ?? tempoTotal / 3,
      this.setores[1] ?? (tempoTotal * 2) / 3,
      tempoTotal,
    ];
    return {
      pistaId: this.pista.dados.id,
      tempoTotal,
      tempos: Float32Array.from(this.tempos),
      laterais: Float32Array.from(this.laterais),
      setores: s,
    };
  }
}

/** Consulta a posição do fantasma num instante da volta. */
export class LeitorFantasma {
  constructor(readonly fantasma: Fantasma, readonly pista: Pista) {}

  /** Distância de pista percorrida pelo fantasma no tempo dado. */
  arcoEm(tempo: number): number {
    const t = this.fantasma.tempos;
    if (t.length === 0) return 0;
    if (tempo <= t[0]) return 0;
    if (tempo >= this.fantasma.tempoTotal) return this.pista.comprimento;
    // busca binária no vetor de tempos, que é monotônico
    let lo = 0, hi = t.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (t[mid] <= tempo) lo = mid; else hi = mid - 1;
    }
    const t0 = t[lo], t1 = t[lo + 1] ?? this.fantasma.tempoTotal;
    const f = t1 > t0 ? (tempo - t0) / (t1 - t0) : 0;
    return (lo + f) * PASSO_AMOSTRA;
  }

  /** Posição no mundo, reconstruída a partir do traçado. */
  posicaoEm(tempo: number) {
    const s = this.arcoEm(tempo);
    const am = this.pista.amostrar(s);
    const i = s / PASSO_AMOSTRA;
    const i0 = Math.floor(i), i1 = Math.min(this.fantasma.laterais.length - 1, i0 + 1);
    const f = i - i0;
    const l0 = this.fantasma.laterais[Math.min(i0, this.fantasma.laterais.length - 1)] ?? 0;
    const l1 = this.fantasma.laterais[i1] ?? l0;
    const lateral = l0 + (l1 - l0) * f;
    return {
      x: am.x + am.nx * lateral,
      y: am.y,
      z: am.z + am.nz * lateral,
      yaw: Math.atan2(am.tx, am.tz),
      s,
    };
  }

  /**
   * Diferença de tempo do jogador para o fantasma no mesmo ponto da pista.
   * Negativo = jogador na frente.
   */
  delta(sJogador: number, tempoJogador: number) {
    const t = this.fantasma.tempos;
    if (t.length === 0) return 0;
    const i = sJogador / PASSO_AMOSTRA;
    const i0 = Math.max(0, Math.min(t.length - 1, Math.floor(i)));
    const i1 = Math.min(t.length - 1, i0 + 1);
    const f = i - i0;
    const tf = t[i0] + (t[i1] - t[i0]) * f;
    return tempoJogador - tf;
  }
}

// ── Codificação para URL ────────────────────────────────────────────────────

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function bytesParaTexto(bytes: Uint8Array) {
  let saida = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1] ?? 0, b2 = bytes[i + 2] ?? 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    const restantes = bytes.length - i;
    saida += ALFABETO[(n >> 18) & 63] + ALFABETO[(n >> 12) & 63];
    if (restantes > 1) saida += ALFABETO[(n >> 6) & 63];
    if (restantes > 2) saida += ALFABETO[n & 63];
  }
  return saida;
}

function textoParaBytes(texto: string) {
  const bytes: number[] = [];
  for (let i = 0; i < texto.length; i += 4) {
    const c = [0, 1, 2, 3].map((k) => ALFABETO.indexOf(texto[i + k] ?? 'A'));
    const n = (c[0] << 18) | (c[1] << 12) | (c[2] << 6) | c[3];
    const restantes = texto.length - i;
    bytes.push((n >> 16) & 255);
    if (restantes > 2) bytes.push((n >> 8) & 255);
    if (restantes > 3) bytes.push(n & 255);
  }
  return Uint8Array.from(bytes);
}

const VERSAO = 1;

export function codificarFantasma(f: Fantasma): string {
  const n = f.tempos.length;
  const bytes: number[] = [];
  bytes.push(VERSAO);
  // identificador da pista: 1 byte de hash estável do id
  let h = 0;
  for (const ch of f.pistaId) h = (h * 31 + ch.charCodeAt(0)) & 255;
  bytes.push(h);
  // tempo total em centésimos, 3 bytes (até ~2,7 h)
  const total = Math.round(f.tempoTotal * 100);
  bytes.push((total >> 16) & 255, (total >> 8) & 255, total & 255);
  bytes.push((n >> 8) & 255, n & 255);

  // tempos como delta quantizado; laterais como byte com deslocamento
  let anterior = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.round((f.tempos[i] - anterior) / TEMPO_QUANTUM);
    anterior = f.tempos[i];
    bytes.push(Math.max(0, Math.min(255, d)));
    const lat = Math.round(f.laterais[i] / LATERAL_QUANTUM) + LATERAL_OFFSET;
    bytes.push(Math.max(0, Math.min(255, lat)));
  }
  return bytesParaTexto(Uint8Array.from(bytes));
}

export function decodificarFantasma(texto: string, pistaId: string): Fantasma | null {
  try {
    const b = textoParaBytes(texto);
    if (b.length < 7 || b[0] !== VERSAO) return null;
    let h = 0;
    for (const ch of pistaId) h = (h * 31 + ch.charCodeAt(0)) & 255;
    if (b[1] !== h) return null; // fantasma de outra pista
    const tempoTotal = ((b[2] << 16) | (b[3] << 8) | b[4]) / 100;
    const n = (b[5] << 8) | b[6];
    if (n <= 0 || 7 + n * 2 > b.length) return null;

    const tempos = new Float32Array(n);
    const laterais = new Float32Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += b[7 + i * 2] * TEMPO_QUANTUM;
      tempos[i] = acc;
      laterais[i] = (b[8 + i * 2] - LATERAL_OFFSET) * LATERAL_QUANTUM;
    }
    return {
      pistaId, tempoTotal, tempos, laterais,
      setores: [tempoTotal / 3, (tempoTotal * 2) / 3, tempoTotal],
    };
  } catch {
    return null;
  }
}

/** Monta o link de desafio. Cai para "só o tempo" se o fantasma não couber. */
export function montarLinkDesafio(base: string, f: Fantasma, autor?: string) {
  const dados = codificarFantasma(f);
  const p = new URLSearchParams();
  p.set('c', f.pistaId);
  p.set('t', f.tempoTotal.toFixed(3));
  if (autor) p.set('a', autor.slice(0, 16));
  const comFantasma = `${base}?${p.toString()}&g=${dados}`;
  // limite conservador: acima disso alguns aplicativos truncam o link
  if (comFantasma.length <= 1900) return comFantasma;
  return `${base}?${p.toString()}`;
}
