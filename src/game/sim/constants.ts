/**
 * Constantes do modelo físico e do regulamento 2026.
 *
 * Valores marcados [R] são de regulamento e foram confirmados em fonte
 * (ver docs/02-pesquisa.md). Valores [E] são estimativas de engenharia
 * calibradas para o jogo — plausíveis, mas não oficiais.
 */

// ── Carro ────────────────────────────────────────────────────────────────────
export const MASSA_CARRO = 768; // kg, peso mínimo 2026 [R]
export const MASSA_PILOTO = 82; // kg [R]
export const ENTRE_EIXOS = 3.4; // m [R]
export const LARGURA_CARRO = 1.9; // m [R]
export const COMPRIMENTO_CARRO = 5.4; // m [E]
/** CG bem baixo: reduz a transferência de carga na frenagem, que era o que
 * soltava a traseira a cada inversão de volante sob 2,5 g. */
export const ALTURA_CG = 0.26; // m [E]
export const DIST_PESO_DIANT = 0.46; // fração da massa no eixo dianteiro [E]
/** Momento de inércia em yaw. Aproximação m*(L/2)^2*k para monopostos. */
export const INERCIA_YAW = 1100; // kg·m² [E]

// ── Motor / unidade de potência 2026 ─────────────────────────────────────────
export const POTENCIA_PICO_W = 760_000; // ~1019 cv combinados ICE+MGU-K [R]
export const VEL_POTENCIA_PLENA = 33; // m/s (~120 km/h): abaixo disso a tração limita [E]
export const FORCA_TRACAO_MAX = 17_000; // N, teto de tração em baixa velocidade [E]
/** Limitador de rotação na última marcha. */
export const VEL_MAXIMA = 100; // m/s (360 km/h) [E]

// ── Energia elétrica ─────────────────────────────────────────────────────────
export const ENERGIA_MAX_MJ = 4.0; // delta de SOC utilizável por volta [R]
export const RECARGA_MJ_POR_VOLTA = 9.0; // capacidade de recuperação [R]
export const OVERTAKE_CUSTO_MJ = 0.5; // por acionamento [R]
export const OVERTAKE_GANHO_W = 49_000; // +67 cv [R]
export const OVERTAKE_DURACAO = 4.5; // s por acionamento [E]
export const OVERTAKE_GAP_MAX = 1.0; // s de distância do carro à frente [R]

// ── Aerodinâmica ativa (substituiu o DRS em 2026) ────────────────────────────
export const RHO_AR = 1.225; // kg/m³
/**
 * Corner Mode (flaps fechados): downforce máxima.
 * CdA calibrado para que a velocidade máxima em reta longa caia onde deve:
 * ~355 km/h no Templo, ~290 km/h no Principado. Sem isso o carro atinge o
 * limitador em qualquer pista, o que é falso.
 */
export const CLA_CURVA = 5.0; // m² [E]
export const CDA_CURVA = 2.45; // m² [E]
/** Straight Mode (flaps abertos): -45% arrasto, -20% downforce. */
export const FATOR_ARRASTO_RETA = 0.55; // [E, dentro do -55% total confirmado]
export const FATOR_DOWNFORCE_RETA = 0.8; // [E]
export const DIST_DOWNFORCE_DIANT = 0.4; // split aero dianteiro/traseiro [E]

// ── Vácuo e ar sujo ──────────────────────────────────────────────────────────
export const VACUO_REDUCAO_ARRASTO = 0.28; // fração máx. de arrasto removido [E]
export const VACUO_ALCANCE = 45; // m [E]
/** O carro 2026 retém >80% do downforce atrás de outro [R]. */
export const AR_SUJO_PERDA_DOWNFORCE = 0.18;

// ── Pneus ────────────────────────────────────────────────────────────────────
export const MU_LONGITUDINAL = 1.75; // [E]
export const MU_LATERAL = 1.8; // [E]
/**
 * Ângulo de deriva de pico. O valor de engenharia para slick de F1 fica perto de
 * 7°, mas num controle de polegar isso torna a perda de aderência instantânea
 * demais. 10° mantém o formato da curva e dá ao jogador o aviso de que está
 * escorregando antes de perder o carro.
 */
export const SLIP_PICO_RAD = (10 * Math.PI) / 180; // [E]
/** Amortecimento natural em guinada — todo carro real tem, e estabiliza. */
export const AMORTECIMENTO_YAW = 0.55;

export type Composto = 'macio' | 'medio' | 'duro';

export interface EspecPneu {
  nome: string;
  sigla: string;
  cor: string;
  /** Multiplicador de aderência quando novo. */
  gripBase: number;
  /** Perda de aderência por volta, em fração. */
  degradacaoPorVolta: number;
  /** Voltas até o pneu "cair do penhasco". */
  vidaVoltas: number;
}

/**
 * Calibrado para que nenhuma estratégia domine numa corrida de 8–12 voltas:
 * o macio ganha ritmo mas cruza com o duro dentro da janela da prova.
 */
export const PNEUS: Record<Composto, EspecPneu> = {
  macio: { nome: 'Macio', sigla: 'M', cor: '#E2241B', gripBase: 1.0, degradacaoPorVolta: 0.017, vidaVoltas: 9 },
  medio: { nome: 'Médio', sigla: 'D', cor: '#F5C518', gripBase: 0.972, degradacaoPorVolta: 0.011, vidaVoltas: 14 },
  duro: { nome: 'Duro', sigla: 'H', cor: '#E8E8E4', gripBase: 0.948, degradacaoPorVolta: 0.0068, vidaVoltas: 20 },
};

// ── Combustível ──────────────────────────────────────────────────────────────
export const COMBUSTIVEL_MAX_KG = 110; // [R]
export const CONSUMO_KG_POR_VOLTA = 1.7; // [E]

// ── Pit lane ─────────────────────────────────────────────────────────────────
export const PIT_VELOCIDADE_LIMITE = 22.2; // m/s (80 km/h) [R]
export const PIT_TEMPO_PARADO = 2.5; // s [R]
export const PIT_PERDA_TOTAL = 21.5; // s [R, faixa 19,7–23,8]

// ── Largada ──────────────────────────────────────────────────────────────────
export const LARGADA_INTERVALO_LUZ = 1.0; // s entre luzes [R]
export const LARGADA_ESPERA_MIN = 0.2; // s [R]
export const LARGADA_ESPERA_MAX = 3.0; // s [R]
export const LARGADA_QUEIMA = 0.1; // s: abaixo disso é largada queimada [R]

// ── IA ───────────────────────────────────────────────────────────────────────
export const IA_DESVIO_HABILIDADE = 0.006; // desvio padrão do ritmo [E]
export const IA_RUIDO_VOLTA = 0.22; // s de ruído por volta [E]
export const IA_TAXA_ERRO = 0.03; // chance de erro por disputa [E]

// ── Safety car ───────────────────────────────────────────────────────────────
export const SC_REDUCAO_RITMO = 0.35; // [R, faixa 30–40%]
export const SC_CHANCE_POR_VOLTA = 0.055; // [E]
export const SC_DURACAO_VOLTAS = 2;

// ── Limites de pista ─────────────────────────────────────────────────────────
export const AVISOS_ATE_PENALIDADE = 3; // [R]
export const GRIP_FORA_DA_PISTA = 0.42; // aderência na escapatória [E]

// ── Simulação ────────────────────────────────────────────────────────────────
export const PASSO_FISICO = 1 / 120; // s
export const MAX_PASSOS_POR_QUADRO = 8;
export const GRAVIDADE = 9.81;

// ── Direção ──────────────────────────────────────────────────────────────────
export const ESTERCO_MAX_RAD = (16 * Math.PI) / 180;
/** Em alta velocidade o esterço é limitado — sem isso o carro é ingovernável. */
export const ESTERCO_VEL_REFERENCIA = 42; // m/s
export const ESTERCO_FATOR_MINIMO = 0.26;
export const ESTERCO_SUAVIZACAO = 0.11; // s

// ── Assistências ─────────────────────────────────────────────────────────────
export interface Assistencias {
  linhaDeCorrida: boolean;
  freioAssistido: boolean;
  controleEstabilidade: boolean;
}

export const NIVEIS: Record<string, Assistencias & { nome: string; descricao: string }> = {
  iniciante: {
    nome: 'Iniciante',
    descricao: 'Linha de corrida, ABS e correção de traçado',
    linhaDeCorrida: true, freioAssistido: true, controleEstabilidade: true,
  },
  intermediario: {
    nome: 'Intermediário',
    descricao: 'Linha de corrida e ABS. Sem correção',
    linhaDeCorrida: true, freioAssistido: true, controleEstabilidade: false,
  },
  profissional: {
    nome: 'Profissional',
    descricao: 'Você contra a pista. Sem nada',
    linhaDeCorrida: false, freioAssistido: false, controleEstabilidade: false,
  },
};

// ── Medalhas ─────────────────────────────────────────────────────────────────
/** Multiplicadores sobre o tempo teórico ótimo da volta. */
export const MEDALHAS = [
  { id: 'bronze', nome: 'Bronze', cor: '#C87F42', fator: 1.14 },
  { id: 'prata', nome: 'Prata', cor: '#C9D2D3', fator: 1.085 },
  { id: 'ouro', nome: 'Ouro', cor: '#F5C518', fator: 1.045 },
  { id: 'pole', nome: 'Pole', cor: '#A855F7', fator: 1.015 },
] as const;

export type IdMedalha = (typeof MEDALHAS)[number]['id'];
