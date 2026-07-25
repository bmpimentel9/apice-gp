/**
 * Assistência de traçado e leitura do ponto de frenagem.
 *
 * Duas responsabilidades que juntas definem como o jogo se joga:
 *
 * 1. `direcaoAssistida` converte o comando do jogador de "ângulo de volante"
 *    para "onde eu quero estar na pista". Com assistência total, o carro
 *    persegue a linha de corrida deslocada pelo polegar — nunca sai sozinho.
 *
 * 2. `lerFrenagem` calcula, a cada instante, quanto freio a curva à frente
 *    exige. É o que alimenta o aviso na tela e o que transforma o freio no
 *    único verbo de habilidade do jogo.
 */
import type { Pista } from './track';
import { type EstadoCarro, curvaturaMaxima } from './car';
import type { Assistencias } from './constants';

/** Índice do traçado a uma distância de arco. */
function indicePorArco(pista: Pista, s: number) {
  const sm = ((s % pista.comprimento) + pista.comprimento) % pista.comprimento;
  return Math.min(pista.n - 1, Math.floor((sm / pista.comprimento) * pista.n));
}

export interface ResultadoDirecao {
  direcao: number;
  /** Onde o carro está tentando ficar, em metros do centro. */
  alvoLateral: number;
}

/**
 * Mistura o comando do jogador com a perseguição da linha de corrida.
 *
 * Com `tracadoAutomatico = 1`, o comando vira deslocamento lateral do alvo: o
 * jogador escolhe a linha, o carro cuida do volante. Com valores menores, o
 * comando volta a ser volante e a assistência apenas corrige.
 */
export function direcaoAssistida(
  carro: EstadoCarro,
  pista: Pista,
  comando: number,
  assist: Assistencias,
  temMuros = false,
): ResultadoDirecao {
  const forca = assist.tracadoAutomatico;
  if (forca <= 0.001) return { direcao: comando, alvoLateral: carro.lateral };

  // A mira encurta em trecho sinuoso. Sem isso, num circuito de rua o alvo cai
  // depois da curva seguinte e o carro corta caminho direto para o muro.
  let curvAdiante = 0;
  for (let d = 8; d < 64; d += 8) {
    curvAdiante = Math.max(curvAdiante, Math.abs(pista.curvatura[indicePorArco(pista, carro.s + d)]));
  }
  // O encurtamento precisa ser SUAVE: encurtar demais faz o controlador
  // oscilar, e oscilação num circuito de rua é batida garantida.
  const fatorSinuoso = Math.max(0.62, 1 / (1 + curvAdiante * 7));
  const dist = Math.min(78, Math.max(12, (carro.velocidade * 0.58 + 11) * fatorSinuoso));
  const iMira = indicePorArco(pista, carro.s + dist);

  // Duas margens diferentes, e confundi-las quebra o jogo:
  //
  //  - o LIMITE do alvo tem que deixar a linha de corrida inteira passar. Se
  //    for apertado demais, o carro é forçado ao centro justamente onde
  //    precisaria abrir a curva, e aí não faz a curva de jeito nenhum.
  //  - o DESVIO é o quanto o polegar pode empurrar o carro para fora da linha
  //    ideal. Esse sim é menor num circuito de rua, onde errar custa o muro.
  const limite = Math.max(1.0, pista.largura / 2 - 1.4);
  const desvioMax = Math.max(0.4, pista.largura / 2 - (temMuros ? 3.4 : 2.2));
  const base = pista.offsetLinha[iMira];
  // Com assistência total o polegar move o alvo; com parcial, o polegar é
  // volante e não deve deslocar o alvo (senão o comando conta duas vezes).
  const desvio = forca > 0.95 ? comando * desvioMax : 0;
  const alvoLateral = Math.max(-limite, Math.min(limite, base + desvio));

  const ax = pista.px[iMira] + pista.nx[iMira] * alvoLateral;
  const az = pista.pz[iMira] + pista.nz[iMira] * alvoLateral;

  const dx = ax - carro.x;
  const dz = az - carro.z;
  const d = Math.max(Math.hypot(dx, dz), 3);
  let erro = Math.atan2(dx, dz) - carro.yaw;
  while (erro > Math.PI) erro -= Math.PI * 2;
  while (erro < -Math.PI) erro += Math.PI * 2;

  // curvatura de perseguição pura, normalizada pelo envelope do carro
  const kNecessaria = (2 * Math.sin(erro)) / d;
  const kMax = curvaturaMaxima(carro);
  let auto = kNecessaria / Math.max(kMax, 1e-5);

  // Fora da pista a assistência aperta: em vez de seguir a linha ideal a
  // distância, ela puxa de volta para dentro com mais autoridade.
  if (carro.foraDaPista) auto *= 1.9;

  auto = Math.max(-1, Math.min(1, auto));
  const direcao = forca > 0.95 ? auto : comando * (1 - forca) + auto * forca;
  return { direcao: Math.max(-1, Math.min(1, direcao)), alvoLateral };
}

export interface LeituraFrenagem {
  /** Quanto freio a curva à frente exige agora, de 0 a 1. */
  necessario: number;
  /** Distância até o ponto em que é preciso começar a frear. */
  distanciaAtePonto: number;
  /** Velocidade alvo na curva mais exigente da janela. */
  velocidadeAlvo: number;
  /** true quando já passou do ponto ideal e o jogador está atrasado. */
  atrasado: boolean;
}

/**
 * Calcula a exigência de frenagem comparando a velocidade atual com a máxima
 * que ainda permite chegar em cada ponto à frente dentro do envelope.
 */
export function lerFrenagem(carro: EstadoCarro, pista: Pista, coragem = 1): LeituraFrenagem {
  const v = Math.max(carro.velocidade, 1);
  const aFreio = (14 + v * 0.24) * coragem;
  const janela = Math.min(pista.comprimento * 0.45, (v * v) / (2 * aFreio) + 60);

  let vPermitida = Infinity;
  let vAlvo = Infinity;
  let distCritica = janela;

  for (let d = 4; d < janela; d += 6) {
    const i = indicePorArco(pista, carro.s + d);
    const alvo = pista.velocidadeOtima[i];
    const vLim = Math.sqrt(alvo * alvo + 2 * aFreio * d);
    if (vLim < vPermitida) {
      vPermitida = vLim;
      vAlvo = alvo;
      distCritica = d;
    }
  }
  const iAqui = indicePorArco(pista, carro.s + 2);
  const aqui = pista.velocidadeOtima[iAqui];
  if (aqui < vPermitida) { vPermitida = aqui; vAlvo = aqui; distCritica = 0; }

  const excesso = v - vPermitida;
  const necessario = excesso <= 0 ? 0 : Math.min(1, excesso / 6);

  // distância até o ponto de frenagem: onde a velocidade atual passaria a ser
  // exatamente a máxima permitida
  const distAte = vAlvo < v
    ? Math.max(0, (v * v - vAlvo * vAlvo) / (2 * aFreio))
    : Infinity;

  return {
    necessario,
    distanciaAtePonto: Math.max(0, distCritica - distAte),
    velocidadeAlvo: vAlvo === Infinity ? v : vAlvo,
    atrasado: necessario > 0.55,
  };
}

/**
 * Freio de última instância dos modos assistidos.
 *
 * NÃO substitui o jogador no ponto de frenagem — só entra quando ele já perdeu
 * a curva e o carro iria para o muro. A diferença importa: o tempo de volta
 * continua sendo decidido pelo polegar, mas o jogo nunca vira uma sequência de
 * batidas. Num circuito de rua isso é a diferença entre jogável e frustrante.
 */
export function freioDeSeguranca(
  freioJogador: number,
  leitura: LeituraFrenagem,
  assist: Assistencias,
): number {
  if (assist.tracadoAutomatico <= 0.001) return freioJogador;
  // só age quando a exigência está no talo, ou seja, quando já é emergência
  if (leitura.necessario < 0.86) return freioJogador;
  const emergencia = (leitura.necessario - 0.86) / 0.14;
  return Math.max(freioJogador, Math.min(1, emergencia) * assist.tracadoAutomatico);
}

export type QualidadeCurva = 'perfeito' | 'bom' | 'tarde' | 'cedo';

/**
 * Avalia como o jogador passou pela curva, comparando a velocidade mínima que
 * ele atingiu com a que o carro conseguiria ali.
 */
export function avaliarCurva(vMinimaJogador: number, vOtimaCurva: number): QualidadeCurva {
  const r = vMinimaJogador / Math.max(vOtimaCurva, 1);
  if (r > 1.06) return 'tarde';   // chegou rápido demais e correu largo
  if (r > 0.97) return 'perfeito';
  if (r > 0.9) return 'bom';
  return 'cedo';                  // freou demais e perdeu velocidade
}
