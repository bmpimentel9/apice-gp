/**
 * Sessão de corrida: treino, classificação e GP.
 *
 * Os rivais NÃO rodam física completa. Cada um é um "tempo-alvo com ruído":
 * avança pelo traçado usando o perfil de velocidade ótimo escalado pelo seu
 * ritmo, pneu e combustível. É a arquitetura que o painel técnico recomendou
 * para celular — vinte carros com física completa custariam caro e não
 * ficariam mais convincentes, porque o que faz uma corrida parecer viva é a
 * disputa (defesa, vácuo, erro), não a dinâmica de cada suspensão.
 *
 * O jogador, esse sim, roda a física inteira.
 */
import type { Pista } from './track';
import {
  PNEUS, type Composto, SC_CHANCE_POR_VOLTA, SC_DURACAO_VOLTAS, SC_REDUCAO_RITMO,
  PIT_PERDA_TOTAL, IA_RUIDO_VOLTA, IA_TAXA_ERRO, OVERTAKE_GAP_MAX,
  VACUO_ALCANCE, CONSUMO_KG_POR_VOLTA, LARGADA_ESPERA_MIN, LARGADA_ESPERA_MAX,
  LARGADA_QUEIMA, AVISOS_ATE_PENALIDADE,
} from './constants';
import { EQUIPES, PILOTOS, type Piloto, type Equipe, equipePorId } from '../data/teams';

export type ModoSessao = 'treino' | 'volta-rapida' | 'classificacao' | 'corrida';
export type FaseCorrida = 'formacao' | 'luzes' | 'correndo' | 'bandeira' | 'terminada';

export interface Rival {
  id: string;
  piloto: Piloto;
  equipe: Equipe;
  /** Distância total percorrida, em metros (não reinicia por volta). */
  distancia: number;
  lateral: number;
  lateralAlvo: number;
  velocidade: number;
  volta: number;
  composto: Composto;
  desgaste: number;
  combustivel: number;
  ritmo: number;
  penalidade: number;
  parou: boolean;
  noPit: boolean;
  tempoPitRestante: number;
  overtakeAtivo: number;
  faseRuido: number;
  /** Posição no mundo, derivada do traçado. */
  x: number; y: number; z: number; yaw: number;
  terminou: boolean;
  tempoTotal: number;
}

export interface ResultadoPiloto {
  id: string;
  nome: string;
  sigla: string;
  equipe: Equipe;
  posicao: number;
  volta: number;
  distancia: number;
  intervalo: number;
  ehJogador: boolean;
  composto: Composto;
  parou: boolean;
  terminou: boolean;
}

export interface EstadoSessao {
  modo: ModoSessao;
  fase: FaseCorrida;
  voltasTotais: number;
  tempo: number;
  luzesAcesas: number;
  esperaLargada: number;
  largadaQueimada: boolean;
  tempoReacao: number | null;
  safetyCar: boolean;
  voltasSafetyCar: number;
  avisosLimite: number;
  penalidadeJogador: number;
}

export class Sessao {
  estado: EstadoSessao;
  rivais: Rival[] = [];
  private tempoLargada = 0;
  private sorteioFeito = false;

  constructor(
    readonly pista: Pista,
    modo: ModoSessao,
    voltas: number,
    readonly aleatorio: () => number = Math.random,
  ) {
    this.estado = {
      modo,
      fase: modo === 'corrida' ? 'formacao' : 'correndo',
      voltasTotais: voltas,
      tempo: 0,
      luzesAcesas: 0,
      esperaLargada: 0,
      largadaQueimada: false,
      tempoReacao: null,
      safetyCar: false,
      voltasSafetyCar: 0,
      avisosLimite: 0,
      penalidadeJogador: 0,
    };
  }

  /** Monta o grid. `posJogador` é a posição de largada do jogador (1-based). */
  montarGrid(posJogador: number) {
    this.rivais = [];
    const ordenados = [...PILOTOS].sort((a, b) => {
      const ea = equipePorId(a.equipeId).desempenho + a.habilidade * 0.1;
      const eb = equipePorId(b.equipeId).desempenho + b.habilidade * 0.1;
      return eb - ea;
    });

    let slot = 0;
    for (const piloto of ordenados) {
      slot++;
      if (slot === posJogador) slot++; // o jogador ocupa a sua vaga
      const equipe = equipePorId(piloto.equipeId);
      // ritmo relativo: carro + piloto, com dispersão pequena e realista
      const forca = equipe.desempenho * 0.82 + piloto.habilidade * 0.18;
      const ritmo = 0.9 + forca * 0.093;
      // largada escalonada: 8 m entre fileiras, alternando o lado
      const recuo = (slot - 1) * 8.4;
      const lado = slot % 2 === 0 ? 1 : -1;
      const lateral = lado * this.pista.largura * 0.2;
      this.rivais.push({
        id: piloto.id,
        piloto, equipe,
        distancia: -recuo,
        lateral, lateralAlvo: lateral,
        velocidade: 0,
        volta: 0,
        composto: slot <= 10 ? 'macio' : 'medio',
        desgaste: 0,
        combustivel: 40,
        ritmo,
        penalidade: 0,
        parou: false, noPit: false, tempoPitRestante: 0,
        overtakeAtivo: 0,
        faseRuido: this.aleatorio() * 1000,
        x: 0, y: 0, z: 0, yaw: 0,
        terminou: false, tempoTotal: 0,
      });
    }
    for (const r of this.rivais) this.posicionar(r);
  }

  private posicionar(r: Rival) {
    const s = ((r.distancia % this.pista.comprimento) + this.pista.comprimento) % this.pista.comprimento;
    const am = this.pista.amostrar(s);
    r.x = am.x + am.nx * r.lateral;
    r.y = am.y;
    r.z = am.z + am.nz * r.lateral;
    r.yaw = Math.atan2(am.tx, am.tz);
  }

  /** Sorteia o tempo de retenção das luzes. Chamar ao entrar em `luzes`. */
  iniciarLargada() {
    if (this.sorteioFeito) return;
    this.estado.esperaLargada = LARGADA_ESPERA_MIN + this.aleatorio() * (LARGADA_ESPERA_MAX - LARGADA_ESPERA_MIN);
    this.sorteioFeito = true;
  }

  /** Avanço da sequência de largada. Devolve true quando as luzes apagam. */
  atualizarLargada(dt: number) {
    const e = this.estado;
    if (e.fase !== 'luzes') return false;
    this.tempoLargada += dt;
    const acesas = Math.min(5, Math.floor(this.tempoLargada));
    e.luzesAcesas = acesas;
    if (acesas >= 5 && this.tempoLargada >= 5 + e.esperaLargada) {
      e.fase = 'correndo';
      e.tempo = 0;
      return true;
    }
    return false;
  }

  /** Registra o toque do jogador na largada e devolve o tempo de reação. */
  registrarLargadaJogador(): number | null {
    const e = this.estado;
    if (e.fase !== 'luzes') return null;
    const t = this.tempoLargada - (5 + e.esperaLargada);
    e.tempoReacao = t;
    if (t < -0.001) {
      e.largadaQueimada = true;
      e.penalidadeJogador += 5;
    } else if (t < LARGADA_QUEIMA) {
      // reação humana abaixo de 100 ms é considerada antecipação
      e.largadaQueimada = true;
      e.penalidadeJogador += 5;
    }
    return t;
  }

  /** Um passo da simulação dos rivais. */
  atualizar(dt: number, distanciaJogador: number) {
    const e = this.estado;
    if (e.fase !== 'correndo') return;
    e.tempo += dt;

    const comp = this.pista.comprimento;

    // ── Safety car ────────────────────────────────────────────────────────
    if (e.safetyCar) {
      e.voltasSafetyCar -= dt / 60;
      if (e.voltasSafetyCar <= 0) e.safetyCar = false;
    }

    for (const r of this.rivais) {
      if (r.terminou) continue;

      // parada nos boxes
      if (r.noPit) {
        r.tempoPitRestante -= dt;
        r.velocidade = 0;
        if (r.tempoPitRestante <= 0) {
          r.noPit = false;
          r.desgaste = 0;
          r.parou = true;
          r.composto = r.composto === 'macio' ? 'duro' : 'macio';
        }
        continue;
      }

      const s = ((r.distancia % comp) + comp) % comp;
      const idx = Math.min(this.pista.n - 1, Math.floor((s / comp) * this.pista.n));
      let v = this.pista.velocidadeOtima[idx] * r.ritmo;

      // pneu, combustível e ruído de condução
      const spec = PNEUS[r.composto];
      v *= spec.gripBase * (1 - r.desgaste * 0.09);
      v *= 1 - (r.combustivel - 20) * 0.00035;
      const ruido = Math.sin(e.tempo * 0.9 + r.faseRuido) * Math.sin(e.tempo * 0.31 + r.faseRuido * 1.7);
      v *= 1 + ruido * (IA_RUIDO_VOLTA / 90);

      if (e.safetyCar) v *= 1 - SC_REDUCAO_RITMO;

      // ── Disputa: vácuo, ar sujo e ultrapassagem ─────────────────────────
      const frente = this.carroAFrente(r);
      if (frente) {
        const gap = frente.distancia - r.distancia;
        if (gap > 0 && gap < VACUO_ALCANCE) {
          const proximidade = 1 - gap / VACUO_ALCANCE;
          // ganho de vácuo na reta, perda de aderência em curva
          const curvatura = Math.abs(this.pista.curvatura[idx]);
          if (curvatura < 1 / 400) v *= 1 + proximidade * 0.05;
          else v *= 1 - proximidade * 0.035;

          // tenta a ultrapassagem quando é claramente mais rápido
          if (gap < 14 && curvatura < 1 / 260) {
            const maisRapido = r.ritmo > frente.ritmo * 0.998;
            if (maisRapido) {
              r.lateralAlvo = -Math.sign(frente.lateral || 1) * this.pista.largura * 0.26;
              if (r.overtakeAtivo <= 0 && this.aleatorio() < 0.02) r.overtakeAtivo = 3.5;
            }
          }
          // evita atravessar o carro da frente
          if (gap < 6) v = Math.min(v, frente.velocidade * 0.99);
        } else {
          r.lateralAlvo = this.laterlLinha(idx);
        }
      } else {
        r.lateralAlvo = this.laterlLinha(idx);
      }

      if (r.overtakeAtivo > 0) {
        r.overtakeAtivo -= dt;
        v *= 1.035;
      }

      // erro humano ocasional
      if (this.aleatorio() < IA_TAXA_ERRO * dt * 0.5) v *= 0.86;

      r.velocidade += (v - r.velocidade) * (1 - Math.exp(-dt / 0.6));
      r.distancia += r.velocidade * dt;
      r.lateral += (r.lateralAlvo - r.lateral) * (1 - Math.exp(-dt / 0.9));

      const voltaNova = Math.floor(r.distancia / comp);
      if (voltaNova > r.volta) {
        r.volta = voltaNova;
        r.desgaste = Math.min(1, r.desgaste + 1 / PNEUS[r.composto].vidaVoltas);
        r.combustivel = Math.max(0, r.combustivel - CONSUMO_KG_POR_VOLTA);
        // decisão de pit: janela em torno do meio da prova, ou pneu acabando
        const meio = this.estado.voltasTotais / 2;
        const deveParar = !r.parou && (r.desgaste > 0.62 || (r.volta >= Math.floor(meio) && this.aleatorio() < 0.5));
        if (deveParar && r.volta < this.estado.voltasTotais - 1) {
          r.noPit = true;
          r.tempoPitRestante = PIT_PERDA_TOTAL * (0.9 + this.aleatorio() * 0.2);
        }
        if (r.volta >= this.estado.voltasTotais) {
          r.terminou = true;
          r.tempoTotal = e.tempo;
        }
      }
      this.posicionar(r);
    }

    // ── Sorteio de safety car ─────────────────────────────────────────────
    if (!e.safetyCar && e.modo === 'corrida') {
      const voltaJogador = Math.floor(distanciaJogador / comp);
      if (voltaJogador >= 1 && voltaJogador < this.estado.voltasTotais - 1) {
        if (this.aleatorio() < (SC_CHANCE_POR_VOLTA * dt) / 60) {
          e.safetyCar = true;
          e.voltasSafetyCar = SC_DURACAO_VOLTAS;
        }
      }
    }
  }

  private laterlLinha(idx: number) {
    return this.pista.offsetLinha[idx] * 0.85;
  }

  private carroAFrente(r: Rival): Rival | null {
    let melhor: Rival | null = null;
    let menorGap = Infinity;
    for (const o of this.rivais) {
      if (o === r || o.noPit || o.terminou) continue;
      const gap = o.distancia - r.distancia;
      if (gap > 0 && gap < menorGap) { menorGap = gap; melhor = o; }
    }
    return melhor;
  }

  /** Classificação atual, já com o jogador inserido. */
  classificacao(distanciaJogador: number, voltaJogador: number, compostoJogador: Composto, parouJogador: boolean, terminouJogador: boolean): ResultadoPiloto[] {
    const lista: ResultadoPiloto[] = this.rivais.map((r) => ({
      id: r.id,
      nome: r.piloto.nome,
      sigla: r.piloto.sigla,
      equipe: r.equipe,
      posicao: 0,
      volta: r.volta,
      distancia: r.distancia,
      intervalo: 0,
      ehJogador: false,
      composto: r.composto,
      parou: r.parou,
      terminou: r.terminou,
    }));
    lista.push({
      id: 'voce', nome: 'Você', sigla: 'VCE',
      equipe: EQUIPES.find((e) => e.id === 'papaia')!,
      posicao: 0, volta: voltaJogador, distancia: distanciaJogador,
      intervalo: 0, ehJogador: true, composto: compostoJogador,
      parou: parouJogador, terminou: terminouJogador,
    });

    lista.sort((a, b) => b.distancia - a.distancia);
    const lider = lista[0]?.distancia ?? 0;
    lista.forEach((p, i) => {
      p.posicao = i + 1;
      // intervalo aproximado em segundos, usando o ritmo médio da prova
      const ritmoMedio = this.pista.comprimento / Math.max(this.pista.tempoTeorico, 1);
      p.intervalo = (lider - p.distancia) / ritmoMedio;
    });
    return lista;
  }

  /** Registra saída de pista do jogador e devolve true se gerou penalidade. */
  registrarLimitePista(): boolean {
    const e = this.estado;
    e.avisosLimite++;
    if (e.avisosLimite >= AVISOS_ATE_PENALIDADE) {
      e.avisosLimite = 0;
      e.penalidadeJogador += 5;
      return true;
    }
    return false;
  }

  /** O jogador pode usar o Overtake Mode? Só a menos de 1 s do carro à frente. */
  overtakeDisponivel(distanciaJogador: number): boolean {
    const ritmoMedio = this.pista.comprimento / Math.max(this.pista.tempoTeorico, 1);
    for (const r of this.rivais) {
      if (r.terminou || r.noPit) continue;
      const gap = (r.distancia - distanciaJogador) / ritmoMedio;
      if (gap > 0 && gap <= OVERTAKE_GAP_MAX) return true;
    }
    return false;
  }

  /** Vácuo e ar sujo recebidos pelo jogador. */
  aeroJogador(distanciaJogador: number, sJogador: number) {
    let vacuo = 0, arSujo = 0;
    const idx = Math.min(this.pista.n - 1, Math.floor((sJogador / this.pista.comprimento) * this.pista.n));
    const emCurva = Math.abs(this.pista.curvatura[idx]) > 1 / 400;
    for (const r of this.rivais) {
      if (r.terminou || r.noPit) continue;
      const gap = r.distancia - distanciaJogador;
      if (gap > 2 && gap < VACUO_ALCANCE) {
        const p = 1 - gap / VACUO_ALCANCE;
        if (emCurva) arSujo = Math.max(arSujo, p);
        else vacuo = Math.max(vacuo, p);
      }
    }
    return { vacuo, arSujo };
  }
}

/** Número de voltas recomendado: comprime a narrativa de um GP em 6-8 minutos. */
export function voltasRecomendadas(pista: Pista) {
  const alvoSegundos = 400;
  const v = Math.round(alvoSegundos / pista.tempoTeorico);
  return Math.max(6, Math.min(14, v));
}
