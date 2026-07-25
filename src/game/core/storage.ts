/**
 * Persistência local. Recordes, fantasmas e preferências.
 *
 * Fica em localStorage por simplicidade e porque o volume é pequeno (um
 * fantasma comprimido não passa de 1 KB). Toda leitura é defensiva: o Safari
 * pode limpar o armazenamento, e o jogo precisa continuar funcionando com os
 * dados zerados em vez de quebrar.
 */
import { codificarFantasma, decodificarFantasma, type Fantasma } from './ghost';

const CHAVE = 'apice-gp.v1';

export interface Recorde {
  tempo: number;
  setores: [number, number, number];
  fantasma?: string;
  data: number;
  assistencia: string;
}

export interface Preferencias {
  assistencia: string;
  canhoto: boolean;
  modoBotoes: boolean;
  sensibilidade: number;
  volume: number;
  reduzirMovimento: boolean;
  mudo: boolean;
  vezesJogadas: number;
}

export interface DadosSalvos {
  recordes: Record<string, Recorde>;
  prefs: Preferencias;
}

const PADRAO: DadosSalvos = {
  recordes: {},
  prefs: {
    assistencia: 'intermediario',
    canhoto: false,
    modoBotoes: false,
    sensibilidade: 1,
    volume: 0.75,
    reduzirMovimento: false,
    mudo: false,
    vezesJogadas: 0,
  },
};

function ler(): DadosSalvos {
  if (typeof window === 'undefined') return structuredClone(PADRAO);
  try {
    const cru = window.localStorage.getItem(CHAVE);
    if (!cru) return structuredClone(PADRAO);
    const d = JSON.parse(cru) as Partial<DadosSalvos>;
    return {
      recordes: d.recordes ?? {},
      prefs: { ...PADRAO.prefs, ...(d.prefs ?? {}) },
    };
  } catch {
    return structuredClone(PADRAO);
  }
}

function gravar(d: DadosSalvos) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(d));
  } catch {
    // cota estourada ou modo privado: seguir sem persistir
  }
}

export const armazenamento = {
  carregar: ler,

  lerPrefs(): Preferencias {
    return ler().prefs;
  },

  salvarPrefs(p: Partial<Preferencias>) {
    const d = ler();
    d.prefs = { ...d.prefs, ...p };
    gravar(d);
    return d.prefs;
  },

  recorde(pistaId: string): Recorde | null {
    return ler().recordes[pistaId] ?? null;
  },

  /** Grava só se for melhor que o anterior. Devolve true se bateu o recorde. */
  registrarVolta(pistaId: string, tempo: number, setores: [number, number, number], fantasma: Fantasma | null, assistencia: string) {
    const d = ler();
    const atual = d.recordes[pistaId];
    if (atual && atual.tempo <= tempo) return false;
    d.recordes[pistaId] = {
      tempo, setores, data: Date.now(), assistencia,
      fantasma: fantasma ? codificarFantasma(fantasma) : atual?.fantasma,
    };
    gravar(d);
    return true;
  },

  fantasmaSalvo(pistaId: string): Fantasma | null {
    const r = ler().recordes[pistaId];
    if (!r?.fantasma) return null;
    return decodificarFantasma(r.fantasma, pistaId);
  },

  incrementarPartidas() {
    const d = ler();
    d.prefs.vezesJogadas = (d.prefs.vezesJogadas ?? 0) + 1;
    gravar(d);
    return d.prefs.vezesJogadas;
  },

  apagarTudo() {
    if (typeof window === 'undefined') return;
    try { window.localStorage.removeItem(CHAVE); } catch { /* ignorado */ }
  },
};

/** Pede armazenamento persistente para reduzir o risco de evicção. */
export async function pedirPersistencia() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch { /* opcional */ }
}
