/**
 * Paleta e tokens visuais — direção de arte "Broadcast Vetorial":
 * silhuetas chapadas e nítidas (baratas de renderizar, perfeitas em tela
 * pequena) com iluminação de estúdio assada nas cores dos vértices.
 *
 * Toda a iluminação da pista e do cenário é pré-calculada nos vértices. Isso
 * significa zero luzes dinâmicas na cena estática — o item mais caro de um
 * renderizador WebGL no iPhone — sem abrir mão de aparência cara.
 */
import { Color } from 'three';

export type HoraDoDia = 'dia' | 'tarde' | 'noite';

export interface Ambiente {
  ceuTopo: string;
  ceuHorizonte: string;
  neblina: string;
  neblinaDensidade: number;
  /** Multiplicador global de luz aplicado às cores assadas. */
  luz: number;
  /** Direção do sol, normalizada, para o sombreado assado. */
  sol: [number, number, number];
  corLuz: string;
  corSombra: string;
}

export const AMBIENTES: Record<HoraDoDia, Ambiente> = {
  dia: {
    ceuTopo: '#1F5FB0', ceuHorizonte: '#AFD4EE',
    neblina: '#C3DCEE', neblinaDensidade: 0.0014,
    luz: 1.18, sol: [0.45, 0.82, 0.35], corLuz: '#FFF8EA', corSombra: '#7F93AE',
  },
  tarde: {
    ceuTopo: '#12344A', ceuHorizonte: '#FF8C3C',
    neblina: '#C9A187', neblinaDensidade: 0.0018,
    luz: 1.1, sol: [-0.72, 0.36, 0.28], corLuz: '#FFE3C4', corSombra: '#6E6389',
  },
  noite: {
    ceuTopo: '#050A1C', ceuHorizonte: '#1B2A55',
    neblina: '#152244', neblinaDensidade: 0.0024,
    luz: 0.72, sol: [0.2, 0.95, 0.1], corLuz: '#BFD0F5', corSombra: '#1B2647',
  },
};

export const CORES = {
  asfalto: '#4A4E57',
  asfaltoClaro: '#4E515A',
  asfaltoEscuro: '#3A3D44',
  borracha: '#2A2C31',
  kerbA: '#D81E2C',
  kerbB: '#F3F1E7',
  kerbAzul: '#1D3FE0',
  linha: '#F3F1E7',
  grama: '#3F7A45',
  /** Faixa de grama artificial entre o kerb e a escapatória. */
  gramaArtificial: '#3CB043',
  gramaEscura: '#275A2F',
  brita: '#9C835A',
  britaEscura: '#86704C',
  muro: '#17181A',
  muroFaixa: '#EDEDE6',
  concreto: '#8A8A83',
  largada: '#E8E8E4',
} as const;

const _c = new Color();

/**
 * Aplica a iluminação assada a uma cor.
 *
 * Modelo: ambiente constante + componente direta modulada pela inclinação.
 * Multiplicar a cor base pela cor da luz sem um termo ambiente forte escurece
 * duas vezes e afunda a cena — foi exatamente o que aconteceu na primeira
 * versão, em que o asfalto virou quase preto.
 */
const AMBIENTE = 0.80;
const DIRETA = 0.52;

export function corComLuz(hex: string, fator: number, amb: Ambiente): [number, number, number] {
  _c.set(hex);
  const luz = new Color(amb.corLuz);
  const sombra = new Color(amb.corSombra);
  const f = Math.max(0, Math.min(1, fator));
  // o termo ambiente é neutro (não tinge), o direto é que carrega a cor do sol
  const misturar = (base: number, cl: number, cs: number) => {
    const ambiente = AMBIENTE * (0.78 + cs * 0.44);
    const direta = DIRETA * cl * f;
    return base * (ambiente + direta) * amb.luz * 0.94;
  };
  return [
    Math.min(1, misturar(_c.r, luz.r, sombra.r)),
    Math.min(1, misturar(_c.g, luz.g, sombra.g)),
    Math.min(1, misturar(_c.b, luz.b, sombra.b)),
  ];
}

/** Ruído determinístico 1D — usado para variar o tom do asfalto sem textura. */
export function ruido(x: number) {
  const s = Math.sin(x * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

export function ruidoSuave(x: number) {
  const i = Math.floor(x);
  const f = x - i;
  const t = f * f * (3 - 2 * f);
  return ruido(i) * (1 - t) + ruido(i + 1) * t;
}

/** Tokens de UI, espelhando o guia de estilo. */
export const UI = {
  raio: { chip: 4, card: 8, painel: 16, pill: 9999 },
  sombra: {
    e1: '0 1px 2px rgba(0,0,0,.4)',
    e2: '0 4px 12px rgba(0,0,0,.35)',
    e3: '0 8px 24px rgba(0,0,0,.45)',
  },
  tempo: { numero: 180, painel: 240, flash: 120 },
} as const;
