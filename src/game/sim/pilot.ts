/**
 * Piloto virtual — controlador que dirige o modelo físico.
 *
 * Usado em dois lugares: pelos carros de IA e pelos testes automatizados. Se
 * este piloto consegue completar uma volta perto do tempo teórico, a física é
 * dirigível; se ele roda, o jogador também rodaria.
 *
 * Método: pure pursuit sobre a linha de corrida + controle de velocidade pelo
 * perfil ótimo pré-calculado.
 */
import type { Pista } from './track';
import type { EstadoCarro, EntradaControle } from './car';
import { curvaturaMaxima } from './car';

export interface AjustePiloto {
  /** 1.0 = ritmo teórico. 0.97 = 3% mais lento. */
  ritmo: number;
  /** Agressividade na frenagem (1 = no limite). */
  coragem: number;
  /** Ruído de condução, em fração. */
  imprecisao: number;
  /** Deslocamento lateral preferido, para não andar todos na mesma linha. */
  offsetPreferido: number;
}

export const PILOTO_PADRAO: AjustePiloto = {
  ritmo: 1, coragem: 1, imprecisao: 0, offsetPreferido: 0,
};

export class Piloto {
  private faseRuido = Math.random() * 1000;
  private direcaoAnterior = 0;

  constructor(readonly pista: Pista, public ajuste: AjustePiloto = { ...PILOTO_PADRAO }) {}

  calcular(estado: EstadoCarro, t: number): EntradaControle {
    const pista = this.pista;

    // ── Pure pursuit sobre a linha de corrida ────────────────────────────────
    // Com trajetória comandada por curvatura, a conta é exata: a curvatura que
    // leva ao ponto de mira é k = 2·sen(erro)/distância. Basta normalizá-la
    // pelo envelope do carro para obter o comando.
    const distMira = Math.min(75, Math.max(11, estado.velocidade * 0.55 + 9));
    const iMira = this.indicePorArco(estado.s + distMira);
    const [alvoX, alvoZ] = this.pontoAlvo(iMira);

    const dx = alvoX - estado.x;
    const dz = alvoZ - estado.z;
    const dist = Math.max(Math.hypot(dx, dz), 3);

    let erro = Math.atan2(dx, dz) - estado.yaw;
    while (erro > Math.PI) erro -= Math.PI * 2;
    while (erro < -Math.PI) erro += Math.PI * 2;

    const kNecessaria = (2 * Math.sin(erro)) / dist;
    const kMax = curvaturaMaxima(estado);
    let direcao = kNecessaria / Math.max(kMax, 1e-5);

    if (this.ajuste.imprecisao > 0) {
      const n = Math.sin(t * 1.7 + this.faseRuido) * Math.sin(t * 0.63 + this.faseRuido * 1.3);
      direcao += n * this.ajuste.imprecisao * 0.09;
    }

    direcao = Math.max(-1, Math.min(1, direcao));
    this.direcaoAnterior = direcao;

    const freio = this.decidirFreio(estado);
    return { direcao, freio, overtake: false };
  }

  /**
   * Decide o freio comparando a velocidade atual com a MÁXIMA que ainda permite
   * frear a tempo para cada ponto à frente.
   *
   * Formular como "desaceleração necessária" e pedir freio proporcional é um
   * erro: quase sempre existe alguma curva na janela, então o piloto pediria um
   * freio residual permanente — e como o acelerador é automático, qualquer
   * freio corta a tração e o carro nunca acelera.
   */
  private decidirFreio(estado: EstadoCarro) {
    const pista = this.pista;
    const v = Math.max(estado.velocidade, 1);

    // desaceleração disponível: cresce com a velocidade por causa do downforce
    const aFreio = (16 + v * 0.28) * this.ajuste.coragem;

    const janela = Math.min(pista.comprimento * 0.45, (v * v) / (2 * aFreio) + 40);
    let vPermitida = Infinity;

    for (let d = 4; d < janela; d += 6) {
      const i = this.indicePorArco(estado.s + d);
      const vAlvo = pista.velocidadeOtima[i] * this.ajuste.ritmo;
      // velocidade máxima agora para ainda chegar em vAlvo daqui a d metros
      const vLim = Math.sqrt(vAlvo * vAlvo + 2 * aFreio * d);
      if (vLim < vPermitida) vPermitida = vLim;
    }
    // e o limite do próprio ponto onde estamos
    const iAqui = this.indicePorArco(estado.s + 2);
    vPermitida = Math.min(vPermitida, pista.velocidadeOtima[iAqui] * this.ajuste.ritmo);

    if (v <= vPermitida * 0.985) return 0; // pode acelerar à vontade
    if (v <= vPermitida * 1.005) return 0.03; // só tira o pé (lift and coast)
    return Math.max(0.12, Math.min(1, (v - vPermitida) / 5));
  }

  private indicePorArco(s: number) {
    const pista = this.pista;
    const sm = ((s % pista.comprimento) + pista.comprimento) % pista.comprimento;
    return Math.min(pista.n - 1, Math.floor((sm / pista.comprimento) * pista.n));
  }

  private pontoAlvo(i: number): [number, number] {
    const pista = this.pista;
    const off = pista.offsetLinha[i] + this.ajuste.offsetPreferido;
    const limite = pista.largura / 2 - 1.2;
    const o = Math.max(-limite, Math.min(limite, off));
    return [pista.px[i] + pista.nx[i] * o, pista.pz[i] + pista.nz[i] * o];
  }
}
