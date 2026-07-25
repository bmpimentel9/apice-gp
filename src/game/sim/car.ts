/**
 * Modelo dinâmico do carro — longitudinal com forças reais (motor, arrasto,
 * downforce, círculo de atrito) e lateral cinemático limitado pelo envelope.
 *
 * Decisão de projeto: o trail braking NÃO é um caso especial no código. Ele
 * emerge da transferência de carga longitudinal — frear transfere peso ao eixo
 * dianteiro, o que aumenta a aderência da frente e faz o carro girar mais na
 * entrada. Soltar o freio devagar mantém esse efeito; soltar de uma vez o
 * elimina. É exatamente o que acontece num carro de verdade, e é o que dá teto
 * alto de habilidade a um jogo de um botão só.
 */
import {
  MASSA_CARRO, MASSA_PILOTO, ENTRE_EIXOS, ALTURA_CG, DIST_PESO_DIANT, INERCIA_YAW,
  POTENCIA_PICO_W, VEL_POTENCIA_PLENA, FORCA_TRACAO_MAX, VEL_MAXIMA,
  RHO_AR, CLA_CURVA, CDA_CURVA, FATOR_ARRASTO_RETA, FATOR_DOWNFORCE_RETA,
  DIST_DOWNFORCE_DIANT, MU_LATERAL, MU_LONGITUDINAL, GRAVIDADE,
  ESTERCO_MAX_RAD, ESTERCO_SUAVIZACAO,
  ENERGIA_MAX_MJ, OVERTAKE_CUSTO_MJ, OVERTAKE_GANHO_W, OVERTAKE_DURACAO,
  GRIP_FORA_DA_PISTA, PNEUS, COMBUSTIVEL_MAX_KG, CONSUMO_KG_POR_VOLTA,
  PIT_VELOCIDADE_LIMITE, VACUO_REDUCAO_ARRASTO, AR_SUJO_PERDA_DOWNFORCE,
  type Composto, type Assistencias,
} from './constants';
import type { Pista } from './track';

export interface EntradaControle {
  /** -1 (esquerda) a +1 (direita). */
  direcao: number;
  /** 0 a 1. */
  freio: number;
  overtake: boolean;
}

export type ModoAero = 'reta' | 'curva';

export interface EstadoCarro {
  x: number; y: number; z: number;
  yaw: number;
  /** Velocidade no referencial do carro. */
  u: number; v: number;
  /** Taxa de guinada (rad/s). */
  r: number;
  esterco: number;
  /** Curvatura da trajetória atual (1/m), com sinal. */
  curvatura: number;

  velocidade: number;
  marcha: number;
  rpm: number;
  aceleradorEfetivo: number;
  modoAero: ModoAero;

  energiaMJ: number;
  overtakeAtivo: boolean;
  overtakeRestante: number;
  combustivelKg: number;

  composto: Composto;
  desgastePneu: number;
  voltasNoPneu: number;

  /** Progresso na pista. */
  s: number;
  lateral: number;
  indicePista: number;
  volta: number;
  foraDaPista: boolean;
  travandoRodas: boolean;
  derrapando: number;
  colidiuAgora: boolean;
  noPitLane: boolean;

  gForceLong: number;
  gForceLat: number;

  /** Telemetria interna — usada pelo HUD de depuração e pelos testes. */
  tel: {
    fMotor: number; fFreio: number; fx: number; arrasto: number;
    usoLat: number; capTras: number; cargaTras: number; cargaDiant: number;
    alphaF: number; alphaR: number; delta: number; downforce: number;
  };
}

const massaBase = MASSA_CARRO + MASSA_PILOTO;

export function criarEstadoCarro(pista: Pista, indice = 0, offsetLateral = 0): EstadoCarro {
  const i = indice % pista.n;
  const x = pista.px[i] + pista.nx[i] * offsetLateral;
  const z = pista.pz[i] + pista.nz[i] * offsetLateral;
  return {
    x, y: pista.py[i], z,
    yaw: Math.atan2(pista.tx[i], pista.tz[i]),
    u: 0, v: 0, r: 0, esterco: 0, curvatura: 0,
    velocidade: 0, marcha: 1, rpm: 0, aceleradorEfetivo: 0, modoAero: 'curva',
    energiaMJ: ENERGIA_MAX_MJ, overtakeAtivo: false, overtakeRestante: 0,
    combustivelKg: COMBUSTIVEL_MAX_KG * 0.35,
    composto: 'macio', desgastePneu: 0, voltasNoPneu: 0,
    s: pista.s[i], lateral: offsetLateral, indicePista: i, volta: 0,
    foraDaPista: false, travandoRodas: false, derrapando: 0, colidiuAgora: false,
    noPitLane: false,
    gForceLong: 0, gForceLat: 0,
    tel: { fMotor: 0, fFreio: 0, fx: 0, arrasto: 0, usoLat: 0, capTras: 0,
           cargaTras: 0, cargaDiant: 0, alphaF: 0, alphaR: 0, delta: 0, downforce: 0 },
  };
}

export interface ContextoFisica {
  pista: Pista;
  assistencias: Assistencias;
  /** Fração de vácuo recebido do carro à frente (0–1). */
  vacuo: number;
  /** Fração de ar sujo (0–1). */
  arSujo: number;
  /** Circuitos de rua punem a saída de pista com muro. */
  temMuros: boolean;
  limitadorPit: boolean;
}

/** Aderência efetiva do pneu considerando composto e desgaste. */
export function gripPneu(estado: EstadoCarro) {
  const spec = PNEUS[estado.composto];
  // queda suave até o "penhasco", depois acelera
  const d = estado.desgastePneu;
  const penhasco = d > 0.85 ? (d - 0.85) * 2.2 : 0;
  return spec.gripBase * Math.max(0.55, 1 - d * 0.22 - penhasco);
}

/**
 * Curvatura máxima que o carro consegue descrever agora. É o envelope real
 * (aderência, peso e downforce) e é o que o piloto precisa saber para comandar
 * a trajetória sem pedir o impossível.
 */
export function curvaturaMaxima(estado: EstadoCarro, foraDaPista = estado.foraDaPista) {
  const m = massaBase + estado.combustivelKg;
  const vel = Math.max(0, estado.u);
  const q = 0.5 * RHO_AR * vel * vel;
  const grip = gripPneu(estado) * (foraDaPista ? GRIP_FORA_DA_PISTA : 1);
  const downforce = q * CLA_CURVA;
  const pesoTotal = m * GRAVIDADE;
  const aLatMax = (MU_LATERAL * grip * (pesoTotal + downforce)) / m;
  return vel > 4 ? aLatMax / (vel * vel) : 0.34;
}

export function massaAtual(estado: EstadoCarro) {
  return massaBase + estado.combustivelKg;
}

export function passoFisica(estado: EstadoCarro, entrada: EntradaControle, ctx: ContextoFisica, dt: number) {
  const { pista } = ctx;
  const m = massaAtual(estado);
  const vel = Math.max(0, estado.u);
  const q = 0.5 * RHO_AR * vel * vel;

  // ── Modo aerodinâmico (aero ativa 2026, automática) ────────────────────────
  const curvaturaAdiante = Math.abs(pista.amostrar(estado.s + Math.max(40, vel * 1.2)).curvatura);
  const emCurva = curvaturaAdiante > 1 / 340 || Math.abs(estado.curvatura) > 1 / 340 || entrada.freio > 0.05;
  estado.modoAero = emCurva ? 'curva' : 'reta';
  const fArrasto = estado.modoAero === 'reta' ? FATOR_ARRASTO_RETA : 1;
  const fDownforce = estado.modoAero === 'reta' ? FATOR_DOWNFORCE_RETA : 1;

  const perdaArSujo = 1 - AR_SUJO_PERDA_DOWNFORCE * ctx.arSujo;
  const downforce = q * CLA_CURVA * fDownforce * perdaArSujo;
  const arrasto = q * CDA_CURVA * fArrasto * (1 - VACUO_REDUCAO_ARRASTO * ctx.vacuo);

  // ── Cargas normais (estático + aero + transferência longitudinal) ──────────
  const pesoTotal = m * GRAVIDADE;
  const transferencia = (m * estado.gForceLong * GRAVIDADE * ALTURA_CG) / ENTRE_EIXOS;
  const cargaDiantNeutra = pesoTotal * DIST_PESO_DIANT + downforce * DIST_DOWNFORCE_DIANT;
  const cargaDiant = Math.max(300, cargaDiantNeutra - transferencia);
  const cargaTras = Math.max(300, pesoTotal * (1 - DIST_PESO_DIANT) + downforce * (1 - DIST_DOWNFORCE_DIANT) + transferencia);

  const grip = gripPneu(estado) * (estado.foraDaPista ? GRIP_FORA_DA_PISTA : 1);
  const muLat = MU_LATERAL * grip;
  const muLong = MU_LONGITUDINAL * grip;

  // ── Longitudinal ───────────────────────────────────────────────────────────
  // Acelerador automático: pleno sempre que não estiver freando.
  let acelerador = entrada.freio > 0.02 ? 0 : 1;
  if (ctx.limitadorPit && vel > PIT_VELOCIDADE_LIMITE) acelerador = 0;

  // Overtake Mode (2026): custa energia, dura poucos segundos.
  if (entrada.overtake && !estado.overtakeAtivo && estado.energiaMJ >= OVERTAKE_CUSTO_MJ) {
    estado.overtakeAtivo = true;
    estado.overtakeRestante = OVERTAKE_DURACAO;
    estado.energiaMJ -= OVERTAKE_CUSTO_MJ;
  }
  if (estado.overtakeAtivo) {
    estado.overtakeRestante -= dt;
    if (estado.overtakeRestante <= 0) estado.overtakeAtivo = false;
  }

  const potencia = POTENCIA_PICO_W + (estado.overtakeAtivo ? OVERTAKE_GANHO_W : 0);
  // F = P/v, limitada pela tração em baixa velocidade. Sem o piso em v, o
  // torque zeraria na partida e o carro ficaria preso para sempre.
  let fMotor = acelerador * Math.min(potencia / Math.max(vel, VEL_POTENCIA_PLENA * 0.24), FORCA_TRACAO_MAX);
  if (vel >= VEL_MAXIMA) fMotor = 0;

  // Bônus de tração na saída: quanto mais reto o carro quando o acelerador
  // volta, melhor a saída. Traduz "não pisar fundo atravessado".
  if (acelerador > 0 && vel > 5) {
    const kMaxRef = (muLat * (cargaDiant + cargaTras)) / m / Math.max(vel * vel, 1);
    const alinhamento = 1 - Math.min(1, Math.abs(estado.curvatura) / Math.max(kMaxRef, 1e-4));
    fMotor *= 0.87 + 0.13 * alinhamento;
  }

  // Freio: com ABS a força é limitada ao que o pneu aguenta.
  const capacidadeFreio = muLong * (cargaDiant + cargaTras);
  let fFreio = entrada.freio * capacidadeFreio * 1.25;
  if (ctx.assistencias.freioAssistido) fFreio = Math.min(fFreio, capacidadeFreio * 0.97);
  estado.travandoRodas = fFreio > capacidadeFreio && entrada.freio > 0.1;

  // ── Lateral: modelo cinemático com envelope ────────────────────────────────
  // A aceleração lateral máxima vem da física real (aderência, peso e
  // downforce), mas a trajetória é comandada por curvatura em vez de emergir de
  // deriva de pneu. Motivo: no modelo bicicleta completo, saturar o pneu
  // traseiro realimenta o próprio escorregamento, e o carro roda a cada
  // inversão de volante — ingovernável com um polegar.
  //
  // O trail braking sobrevive intacto: frear transfere carga à frente, o que
  // aumenta a curvatura disponível via `bonusRotacao`. Soltar o freio devagar
  // mantém o bônus; soltar de uma vez o elimina.
  const aLatMax = (muLat * (cargaDiant + cargaTras)) / m;
  const kMax = vel > 4 ? aLatMax / (vel * vel) : 0.34;
  const bonusRotacao = Math.max(-0.12, Math.min(0.26,
    (cargaDiant / Math.max(cargaDiantNeutra, 1) - 1) * 0.42));

  const kComandada = entrada.direcao * kMax * (1 + bonusRotacao);
  const kPossivel = Math.max(-kMax, Math.min(kMax, kComandada));
  estado.curvatura += (kPossivel - estado.curvatura) * (1 - Math.exp(-dt / 0.115));

  const rAlvo = estado.u * estado.curvatura;
  estado.r += (rAlvo - estado.r) * (1 - Math.exp(-dt / 0.075));
  estado.r = Math.max(-2.8, Math.min(2.8, estado.r));

  const excesso = Math.max(0, Math.abs(kComandada) - kMax);
  const escorrega = Math.min(1, excesso / Math.max(kMax, 1e-4));
  const usoLat = Math.min(1, Math.abs(estado.curvatura) / Math.max(kMax, 1e-4));

  // deriva visual: o carro anda ligeiramente de lado quando está no limite
  const betaAlvo = -Math.sign(estado.curvatura || 1)
    * (escorrega * 0.16 + usoLat * 0.035) * Math.min(1, vel / 25);
  estado.v += (betaAlvo * Math.max(vel, 1) - estado.v) * (1 - Math.exp(-dt / 0.2));

  // ── Círculo de atrito no eixo traseiro ─────────────────────────────────────
  // Só entram forças que passam pelo PNEU. O arrasto age no corpo do carro e
  // não consome aderência.
  const capTras = muLong * cargaTras;
  const capLongRestante = Math.sqrt(Math.max(0, 1 - usoLat * usoLat)) * capTras;
  // Piso de tração: com o pneu saturado lateralmente o círculo zeraria a
  // tração e o carro nunca mais aceleraria. Aplicar torque gera escorregamento
  // longitudinal que reduz o lateral — o piso modela essa redistribuição.
  const margemTracao = Math.max(capTras * 0.28, capLongRestante * 0.98);
  let patinagem = 0;
  if (fMotor > margemTracao) {
    patinagem = Math.min(1, (fMotor - margemTracao) / Math.max(capTras, 1));
    fMotor = margemTracao;
  }
  estado.derrapando = Math.max(escorrega, patinagem * 0.5, usoLat > 0.93 ? (usoLat - 0.93) / 0.07 : 0);

  // ── Esterço (visual) ───────────────────────────────────────────────────────
  // Não comanda mais a física: é o ângulo que as rodas precisam ter para
  // descrever a curvatura atual. Serve ao render e à sensação.
  {
    const esterGeometrico = Math.atan(estado.curvatura * ENTRE_EIXOS);
    const contraDeriva = -Math.atan2(estado.v, Math.max(Math.abs(estado.u), 3)) * 0.7;
    const alvo = Math.max(-ESTERCO_MAX_RAD * 1.6,
      Math.min(ESTERCO_MAX_RAD * 1.6, esterGeometrico + contraDeriva));
    estado.esterco += (alvo - estado.esterco) * (1 - Math.exp(-dt / ESTERCO_SUAVIZACAO));
  }

  // ── Integração ─────────────────────────────────────────────────────────────
  let fx = fMotor - fFreio - arrasto;
  fx -= 0.014 * pesoTotal * Math.sign(estado.u);

  const du = fx / m;
  estado.u += du * dt;
  if (estado.u < 0) estado.u = 0;
  // preço de andar de lado
  if (escorrega > 0.01) estado.u -= estado.u * escorrega * 1.6 * dt;

  estado.gForceLong = du / GRAVIDADE;
  estado.gForceLat = (estado.u * estado.r) / GRAVIDADE;

  estado.yaw += estado.r * dt;
  const cos = Math.cos(estado.yaw), sen = Math.sin(estado.yaw);
  // yaw = 0 aponta para +Z; o eixo local X é a lateral direita
  estado.x += (estado.u * sen + estado.v * cos) * dt;
  estado.z += (estado.u * cos - estado.v * sen) * dt;
  estado.velocidade = Math.hypot(estado.u, estado.v);

  // ── Progresso na pista ─────────────────────────────────────────────────────
  const proj = pista.projetar(estado.x, estado.z, estado.indicePista);
  const sAnterior = estado.s;
  estado.indicePista = proj.indice;
  estado.s = proj.s;
  estado.lateral = proj.lateral;
  estado.y = pista.alturaEm(estado.x, estado.z, proj.indice);
  estado.foraDaPista = Math.abs(proj.lateral) > pista.largura / 2;

  if (sAnterior > pista.comprimento * 0.75 && estado.s < pista.comprimento * 0.25) {
    estado.volta++;
    estado.voltasNoPneu++;
    estado.desgastePneu = Math.min(1, estado.desgastePneu + 1 / PNEUS[estado.composto].vidaVoltas);
    estado.combustivelKg = Math.max(0, estado.combustivelKg - CONSUMO_KG_POR_VOLTA);
  }

  // ── Muros ──────────────────────────────────────────────────────────────────
  estado.colidiuAgora = false;
  // Nos circuitos de rua o muro fica um pouco mais afastado do que na
  // realidade. É licença deliberada: com o traçado assistido e um polegar só,
  // muro colado transforma cada erro pequeno em batida, e o jogo deixa de ser
  // divertido muito antes de deixar de ser fiel.
  const limiteMuro = pista.largura / 2 + (ctx.temMuros ? 3.4 : 14);
  if (Math.abs(proj.lateral) > limiteMuro) {
    const sinal = Math.sign(proj.lateral);
    const sobra = Math.abs(proj.lateral) - limiteMuro;
    estado.x -= pista.nx[proj.indice] * sinal * sobra;
    estado.z -= pista.nz[proj.indice] * sinal * sobra;
    estado.u *= ctx.temMuros ? 0.55 : 0.82;
    estado.v = 0;
    estado.r *= 0.3;
    estado.curvatura *= 0.3;
    estado.colidiuAgora = true;
  }

  // ── Recuperação de energia na frenagem ─────────────────────────────────────
  if (entrada.freio > 0.05 && estado.u > 8) {
    estado.energiaMJ = Math.min(ENERGIA_MAX_MJ, estado.energiaMJ + dt * 0.42 * entrada.freio);
  }

  // ── Telemetria ─────────────────────────────────────────────────────────────
  const tel = estado.tel;
  tel.fMotor = fMotor; tel.fFreio = fFreio; tel.fx = fx; tel.arrasto = arrasto;
  tel.usoLat = usoLat; tel.capTras = capTras; tel.cargaTras = cargaTras;
  tel.cargaDiant = cargaDiant; tel.alphaF = 0; tel.alphaR = betaAlvo;
  tel.delta = estado.esterco; tel.downforce = downforce;

  estado.aceleradorEfetivo = acelerador;
  const fracVel = Math.min(1, estado.velocidade / VEL_MAXIMA);
  estado.marcha = Math.max(1, Math.min(8, Math.ceil(fracVel * 8)));
  const faixa = (fracVel * 8) % 1;
  estado.rpm = 0.42 + 0.58 * (faixa === 0 ? 1 : faixa);
}

/** Reposiciona o carro na pista após rodar ou sair feio. */
export function recolocarNaPista(estado: EstadoCarro, pista: Pista) {
  const i = estado.indicePista;
  const off = Math.max(-pista.largura / 3, Math.min(pista.largura / 3, estado.lateral));
  estado.x = pista.px[i] + pista.nx[i] * off;
  estado.z = pista.pz[i] + pista.nz[i] * off;
  estado.y = pista.py[i];
  estado.yaw = Math.atan2(pista.tx[i], pista.tz[i]);
  estado.u = Math.min(estado.u, 22);
  estado.v = 0;
  estado.r = 0;
  estado.esterco = 0;
  estado.curvatura = 0;
}
