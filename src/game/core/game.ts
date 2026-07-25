/**
 * Motor do jogo: junta física, render, entrada, áudio e sessão.
 *
 * Timestep fixo com acumulador. A física roda sempre a 120 Hz, independente da
 * taxa de quadros da tela — o que importa porque o mesmo jogo roda a 60 Hz num
 * iPhone comum e a 120 Hz num ProMotion, e ninguém pode ganhar tempo de volta
 * por ter aparelho melhor.
 */
import { Pista, obterPista } from '../sim/track';
import { circuitoPorId, type DadosCircuito } from '../data/tracks';
import {
  criarEstadoCarro, passoFisica, recolocarNaPista,
  type EstadoCarro, type ContextoFisica,
} from '../sim/car';
import { Sessao, voltasRecomendadas, type ModoSessao, type ResultadoPiloto } from '../sim/race';
import { direcaoAssistida, lerFrenagem, avaliarCurva, freioDeSeguranca, type QualidadeCurva } from '../sim/driving';
import { Renderizador } from '../render/scene';
import { Entrada } from './input';
import { Audio } from './audio';
import { GravadorFantasma, LeitorFantasma, type Fantasma } from './ghost';
import { armazenamento } from './storage';
import {
  PASSO_FISICO, MAX_PASSOS_POR_QUADRO, NIVEIS, MEDALHAS, PNEUS,
  type Composto, type IdMedalha,
} from '../sim/constants';
import { equipePorId, PILOTO_JOGADOR, EQUIPES } from '../data/teams';

export interface QuadroHUD {
  velocidade: number;
  marcha: number;
  rpm: number;
  tempoVolta: number;
  melhorVolta: number | null;
  delta: number | null;
  volta: number;
  voltasTotais: number;
  posicao: number;
  totalCarros: number;
  energia: number;
  overtakeAtivo: boolean;
  overtakePronto: boolean;
  modoAero: 'reta' | 'curva';
  composto: Composto;
  desgastePneu: number;
  setor: number;
  foraDaPista: boolean;
  luzes: number;
  fase: string;
  safetyCar: boolean;
  penalidade: number;
  fps: number;
  /** Severidade da próxima curva (1 = rápida, 6 = grampo) e distância. */
  proximaCurva: { severidade: number; distancia: number; direcao: number } | null;
  /** Quanto freio a curva à frente pede agora (0–1) e se já está atrasado. */
  freioNecessario: number;
  freioAtrasado: boolean;
  /** Nota da última curva, para o retorno imediato ao jogador. */
  notaCurva: { qualidade: string; idade: number } | null;
  /** Posição do carro na largura da pista, -1 a 1. */
  posicaoNaPista: number;
}

export interface ResultadoVolta {
  tempo: number;
  setores: [number, number, number];
  recorde: boolean;
  medalha: IdMedalha | null;
  tempoIdeal: number;
}

export interface ResultadoCorrida {
  classificacao: ResultadoPiloto[];
  melhorVolta: number | null;
  posicaoFinal: number;
}

export interface CallbacksJogo {
  aoQuadro?: (h: QuadroHUD) => void;
  aoCompletarVolta?: (r: ResultadoVolta) => void;
  aoTerminarCorrida?: (r: ResultadoCorrida) => void;
  aoMudarFase?: (fase: string) => void;
}

export class Jogo {
  readonly entrada = new Entrada();
  readonly audio = new Audio();
  private render: Renderizador;
  private pista!: Pista;
  private circuito!: DadosCircuito;
  private carro!: EstadoCarro;
  private sessao!: Sessao;
  private ctxFisica!: ContextoFisica;

  private gravador!: GravadorFantasma;
  private fantasmaAlvo: LeitorFantasma | null = null;
  private carroFantasmaVisivel = false;

  private rodando = false;
  private acumulador = 0;
  private ultimoTempo = 0;
  private handle = 0;

  private tempoVolta = 0;
  private melhorVolta: number | null = null;
  private setoresParciais: number[] = [];
  private setorAtual = 0;
  private voltaValida = true;
  private distanciaTotal = 0;
  private voltaAnterior = 0;
  private aguardandoLargada = false;
  private terminou = false;

  private quadros = 0;
  private tempoAmostra = 0;
  private fps = 60;
  private quadrosLentos = 0;

  cb: CallbacksJogo = {};

  constructor(canvas: HTMLCanvasElement) {
    this.render = new Renderizador(canvas);
    const prefs = armazenamento.lerPrefs();
    this.entrada.config.canhoto = prefs.canhoto;
    this.entrada.config.modoBotoes = prefs.modoBotoes;
    this.entrada.config.sensibilidade = prefs.sensibilidade;
    this.render.opcoes.reduzirMovimento = prefs.reduzirMovimento;
    this.audio.volume = prefs.volume;
  }

  get renderizador() { return this.render; }
  get pistaAtual() { return this.pista; }
  get estadoCarro() { return this.carro; }
  get sessaoAtual() { return this.sessao; }

  carregar(circuitoId: string, modo: ModoSessao, opcoes: { assistencia?: string; fantasma?: Fantasma | null } = {}) {
    this.circuito = circuitoPorId(circuitoId);
    this.pista = obterPista(this.circuito);
    const voltas = modo === 'corrida' ? voltasRecomendadas(this.pista) : 1;
    this.sessao = new Sessao(this.pista, modo, voltas);

    const prefs = armazenamento.lerPrefs();
    const nivel = NIVEIS[opcoes.assistencia ?? prefs.assistencia] ?? NIVEIS.automatico;

    this.render.carregarPista(this.pista, this.circuito.hora);

    // grid e posição inicial
    const posJogador = modo === 'corrida' ? 8 : 1;
    if (modo === 'corrida') {
      this.sessao.montarGrid(posJogador);
      this.carro = criarEstadoCarro(this.pista, this.pista.n - Math.floor(((posJogador - 1) * 8.4) / 8), this.pista.largura * 0.2);
      this.sessao.estado.fase = 'luzes';
      this.sessao.iniciarLargada();
      this.aguardandoLargada = true;
    } else {
      this.carro = criarEstadoCarro(this.pista, 0, this.pista.offsetLinha[0]);
      // treino e volta rápida começam lançados: sem espera, sem menu
      this.carro.u = modo === 'treino' ? 42 : 0;
    }
    this.carro.composto = 'macio';

    this.ctxFisica = {
      pista: this.pista,
      assistencias: nivel,
      vacuo: 0, arSujo: 0,
      temMuros: this.circuito.id === 'principado' || this.circuito.id === 'corniche',
      limitadorPit: false,
    };

    this.gravador = new GravadorFantasma(this.pista);
    const fant = opcoes.fantasma ?? armazenamento.fantasmaSalvo(this.circuito.id);
    this.fantasmaAlvo = fant ? new LeitorFantasma(fant, this.pista) : null;
    this.melhorVolta = armazenamento.recorde(this.circuito.id)?.tempo ?? null;

    // carros na cena
    const ids = new Set<string>(['jogador']);
    this.render.garantirCarro('jogador', equipePorId(PILOTO_JOGADOR.equipeId), PILOTO_JOGADOR.numero);
    if (modo === 'corrida') {
      for (const r of this.sessao.rivais) {
        ids.add(r.id);
        this.render.garantirCarro(r.id, r.equipe, r.piloto.numero);
      }
    }
    if (this.fantasmaAlvo) {
      ids.add('fantasma');
      this.render.garantirCarro('fantasma', { ...EQUIPES[0], cor: '#A855F7', corSecundaria: '#6D28D9' }, 0);
      this.carroFantasmaVisivel = true;
    }
    this.render.removerCarrosExceto(ids);

    this.reiniciarVolta();
    this.terminou = false;
    this.distanciaTotal = 0;
    this.voltaAnterior = 0;
    this.ultimaCurva = null;
    this.vMinimaCurva = Infinity;
    this.emCurva = false;
  }

  private reiniciarVolta() {
    this.tempoVolta = 0;
    this.setoresParciais = [];
    this.setorAtual = 0;
    this.voltaValida = true;
    this.gravador.reiniciar();
  }

  /** Reinício instantâneo: um toque, sem recarregar a cena. */
  repetir() {
    const modo = this.sessao.estado.modo;
    this.carro = criarEstadoCarro(this.pista, 0, this.pista.offsetLinha[0]);
    this.carro.u = modo === 'treino' ? 42 : 0;
    this.carro.composto = 'macio';
    this.reiniciarVolta();
    this.distanciaTotal = 0;
    this.voltaAnterior = 0;
    this.terminou = false;
  }

  iniciar() {
    if (this.rodando) return;
    this.rodando = true;
    this.ultimoTempo = performance.now();
    this.handle = requestAnimationFrame(this.laco);
  }

  parar() {
    this.rodando = false;
    cancelAnimationFrame(this.handle);
  }

  redimensionar(largura: number, altura: number, margemInferior: number) {
    // limita o DPR: acima de 2 o ganho visual é nulo e o custo é enorme
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.render.redimensionar(largura, altura, dpr);
    this.entrada.redimensionar(largura, altura, margemInferior);
  }

  private laco = (agora: number) => {
    if (!this.rodando) return;
    this.handle = requestAnimationFrame(this.laco);

    let dt = (agora - this.ultimoTempo) / 1000;
    this.ultimoTempo = agora;
    // clamp: uma aba em segundo plano não pode gerar um salto de física
    if (dt > 0.25) dt = 0.25;

    this.medirDesempenho(dt);
    this.entrada.atualizar(dt);

    const e = this.sessao.estado;
    if (e.fase === 'luzes') {
      const apagou = this.sessao.atualizarLargada(dt);
      if (apagou) {
        this.aguardandoLargada = false;
        this.audio.bipe(1320, 0.3, 0.25);
        this.cb.aoMudarFase?.('correndo');
      } else if (Math.floor(e.luzesAcesas) > 0) {
        // um bipe por luz
        if (this.luzesBipadas < e.luzesAcesas) {
          this.luzesBipadas = e.luzesAcesas;
          this.audio.bipe(660, 0.1, 0.16);
        }
      }
    }

    this.acumulador += dt;
    let passos = 0;
    while (this.acumulador >= PASSO_FISICO && passos < MAX_PASSOS_POR_QUADRO) {
      this.passo(PASSO_FISICO);
      this.acumulador -= PASSO_FISICO;
      passos++;
    }
    if (passos >= MAX_PASSOS_POR_QUADRO) this.acumulador = 0;

    this.desenhar(dt);
  };

  private luzesBipadas = 0;

  private passo(dt: number) {
    const e = this.sessao.estado;
    const podeAndar = e.fase === 'correndo' || e.modo !== 'corrida';
    if (!podeAndar || this.terminou) return;

    // vácuo e ar sujo do jogador
    if (e.modo === 'corrida') {
      const aero = this.sessao.aeroJogador(this.distanciaTotal, this.carro.s);
      this.ctxFisica.vacuo = aero.vacuo;
      this.ctxFisica.arSujo = aero.arSujo;
    }

    // O comando do polegar vira "onde eu quero estar na pista"; quem cuida do
    // volante é a assistência de traçado.
    const assist = direcaoAssistida(this.carro, this.pista, this.entrada.estado.direcao, this.ctxFisica.assistencias, this.ctxFisica.temMuros);
    this.alvoLateral = assist.alvoLateral;
    const leituraFreio = lerFrenagem(this.carro, this.pista);
    const entrada = {
      direcao: assist.direcao,
      freio: freioDeSeguranca(this.entrada.estado.freio, leituraFreio, this.ctxFisica.assistencias),
      overtake: this.entrada.estado.overtake && (e.modo !== 'corrida' || this.sessao.overtakeDisponivel(this.distanciaTotal)),
    };

    const voltaAntes = this.carro.volta;
    const sAntes = this.carro.s;
    passoFisica(this.carro, entrada, this.ctxFisica, dt);

    this.tempoVolta += dt;
    this.distanciaTotal += Math.max(0, this.carro.s - sAntes) +
      (this.carro.volta > voltaAntes ? this.pista.comprimento : 0);

    this.gravador.amostrar(this.carro, this.tempoVolta);

    // ── Leitura do ponto de frenagem (o verbo do jogo) ──────────────────────
    this.frenagem = leituraFreio;

    // Acompanha a passagem por cada curva para dar a nota ao jogador.
    const iAqui = Math.min(this.pista.n - 1, Math.floor((this.carro.s / this.pista.comprimento) * this.pista.n));
    const curvaAqui = Math.abs(this.pista.curvatura[iAqui]) > 1 / 220;
    if (curvaAqui) {
      this.emCurva = true;
      this.vMinimaCurva = Math.min(this.vMinimaCurva, this.carro.velocidade);
    } else if (this.emCurva) {
      this.emCurva = false;
      if (isFinite(this.vMinimaCurva) && this.vMinimaCurva > 4) {
        const vOtima = this.pista.velocidadeOtima[iAqui];
        const q = avaliarCurva(this.vMinimaCurva, vOtima);
        this.ultimaCurva = { qualidade: q, em: this.tempoVolta };
        if (q === 'perfeito') this.audio.bipe(1760, 0.07, 0.09);
      }
      this.vMinimaCurva = Infinity;
    }

    // limites de pista
    if (this.carro.foraDaPista && Math.abs(this.carro.lateral) > this.pista.largura / 2 + 1.6) {
      if (this.voltaValida) {
        this.voltaValida = false;
        if (e.modo === 'corrida') this.sessao.registrarLimitePista();
      }
    }
    if (this.carro.colidiuAgora) {
      this.render.pulsoImpacto(0.7);
      this.audio.impacto(0.8);
    }

    // setores
    const setor = this.pista.setorDe(this.carro.s);
    if (setor !== this.setorAtual) {
      this.setoresParciais.push(this.tempoVolta);
      this.setorAtual = setor;
    }

    // volta completa
    if (this.carro.volta > voltaAntes) this.completarVolta();

    if (e.modo === 'corrida') {
      this.sessao.atualizar(dt, this.distanciaTotal);
    }

    // recolocar se o carro parar fora da pista
    if (this.carro.velocidade < 1.2 && this.carro.foraDaPista) {
      this.tempoParado += dt;
      if (this.tempoParado > 1.6) {
        recolocarNaPista(this.carro, this.pista);
        this.tempoParado = 0;
      }
    } else this.tempoParado = 0;
  }

  private tempoParado = 0;
  private alvoLateral = 0;
  private frenagem = { necessario: 0, distanciaAtePonto: Infinity, velocidadeAlvo: 0, atrasado: false };
  private vMinimaCurva = Infinity;
  private emCurva = false;
  private ultimaCurva: { qualidade: QualidadeCurva; em: number } | null = null;

  private completarVolta() {
    const tempo = this.tempoVolta;
    const e = this.sessao.estado;
    const setores: [number, number, number] = [
      this.setoresParciais[0] ?? tempo / 3,
      this.setoresParciais[1] ?? (tempo * 2) / 3,
      tempo,
    ];

    if (this.voltaValida) {
      const fantasma = this.gravador.finalizar(tempo);
      const recorde = armazenamento.registrarVolta(
        this.circuito.id, tempo, setores, fantasma, e.modo === 'corrida' ? 'corrida' : 'volta',
      );
      if (recorde) {
        this.melhorVolta = tempo;
        this.fantasmaAlvo = new LeitorFantasma(fantasma, this.pista);
      } else if (this.melhorVolta === null || tempo < this.melhorVolta) {
        this.melhorVolta = tempo;
      }

      const ideal = this.pista.tempoTeorico;
      let medalha: IdMedalha | null = null;
      for (const m of MEDALHAS) {
        if (tempo <= ideal * m.fator) medalha = m.id;
      }
      this.cb.aoCompletarVolta?.({ tempo, setores, recorde, medalha, tempoIdeal: ideal });
      this.audio.bipe(recorde ? 1480 : 990, 0.18, 0.2);
    }

    this.reiniciarVolta();

    // fim de prova
    if (e.modo === 'corrida' && this.carro.volta >= e.voltasTotais) {
      this.terminou = true;
      e.fase = 'terminada';
      const cls = this.sessao.classificacao(this.distanciaTotal, this.carro.volta, this.carro.composto, false, true);
      this.cb.aoTerminarCorrida?.({
        classificacao: cls,
        melhorVolta: this.melhorVolta,
        posicaoFinal: cls.find((c) => c.ehJogador)?.posicao ?? 20,
      });
    } else if (e.modo === 'volta-rapida' && this.carro.volta >= 1) {
      // volta rápida é um lançamento por vez: reinicia sozinha
      this.repetir();
    }
  }

  private medirDesempenho(dt: number) {
    this.quadros++;
    this.tempoAmostra += dt;
    if (this.tempoAmostra >= 0.5) {
      this.fps = this.quadros / this.tempoAmostra;
      this.quadros = 0;
      this.tempoAmostra = 0;
      // Degradação automática: se o quadro médio passar de 20 ms, o jogo baixa
      // a qualidade sozinho em vez de entregar uma corrida travada.
      if (this.fps < 48) {
        this.quadrosLentos++;
        if (this.quadrosLentos >= 4 && this.render.opcoes.qualidade > 0.62) {
          this.render.opcoes.qualidade = 0.62;
          this.quadrosLentos = 0;
          const c = this.render.renderer.domElement;
          this.render.redimensionar(c.clientWidth, c.clientHeight, Math.min(window.devicePixelRatio || 1, 1.5));
        }
      } else this.quadrosLentos = 0;
    }
  }

  private desenhar(dt: number) {
    const e = this.sessao.estado;
    this.render.atualizarCarro('jogador', this.carro);
    this.render.emitirDoCarro(this.carro, dt);
    this.render.atualizarCamera(this.carro, dt);

    if (e.modo === 'corrida') {
      // só desenha o que está por perto: o resto some na neblina de qualquer jeito
      for (const r of this.sessao.rivais) {
        const gap = Math.abs(r.distancia - this.distanciaTotal);
        const perto = gap < 260;
        this.render.atualizarCarro(r.id, {
          x: r.x, y: r.y, z: r.z, yaw: r.yaw,
          esterco: 0, modoAero: 'curva', velocidade: r.velocidade,
          gForceLong: 0, gForceLat: 0, derrapando: 0, foraDaPista: false,
          overtakeAtivo: r.overtakeAtivo > 0,
        } as unknown as EstadoCarro, perto && !r.noPit);
      }
    }

    if (this.fantasmaAlvo && this.carroFantasmaVisivel) {
      const p = this.fantasmaAlvo.posicaoEm(this.tempoVolta);
      this.render.atualizarCarro('fantasma', {
        x: p.x, y: p.y, z: p.z, yaw: p.yaw, esterco: 0, modoAero: 'curva',
        velocidade: 60, gForceLong: 0, gForceLat: 0, derrapando: 0,
        foraDaPista: false, overtakeAtivo: false,
      } as unknown as EstadoCarro, this.tempoVolta < this.fantasmaAlvo.fantasma.tempoTotal + 2);
    }

    this.render.desenhar(dt);
    this.audio.atualizar(
      this.carro.rpm, this.carro.velocidade, this.carro.aceleradorEfetivo,
      this.carro.derrapando, this.carro.overtakeAtivo,
    );

    this.cb.aoQuadro?.(this.montarHUD());
  }

  private montarHUD(): QuadroHUD {
    const e = this.sessao.estado;
    const cls = e.modo === 'corrida'
      ? this.sessao.classificacao(this.distanciaTotal, this.carro.volta, this.carro.composto, false, false)
      : null;
    const minha = cls?.find((c) => c.ehJogador);

    return {
      velocidade: this.carro.velocidade * 3.6,
      marcha: this.carro.marcha,
      rpm: this.carro.rpm,
      tempoVolta: this.tempoVolta,
      melhorVolta: this.melhorVolta,
      delta: this.fantasmaAlvo ? this.fantasmaAlvo.delta(this.carro.s, this.tempoVolta) : null,
      volta: this.carro.volta + 1,
      voltasTotais: e.voltasTotais,
      posicao: minha?.posicao ?? 1,
      totalCarros: cls?.length ?? 1,
      energia: this.carro.energiaMJ,
      overtakeAtivo: this.carro.overtakeAtivo,
      overtakePronto: e.modo !== 'corrida' || this.sessao.overtakeDisponivel(this.distanciaTotal),
      modoAero: this.carro.modoAero,
      composto: this.carro.composto,
      desgastePneu: this.carro.desgastePneu,
      setor: this.setorAtual + 1,
      foraDaPista: this.carro.foraDaPista,
      luzes: e.luzesAcesas,
      fase: e.fase,
      safetyCar: e.safetyCar,
      penalidade: e.penalidadeJogador,
      fps: this.fps,
      proximaCurva: this.proximaCurva(),
      freioNecessario: this.frenagem.necessario,
      freioAtrasado: this.frenagem.atrasado,
      notaCurva: this.ultimaCurva
        ? { qualidade: this.ultimaCurva.qualidade, idade: this.tempoVolta - this.ultimaCurva.em }
        : null,
      posicaoNaPista: Math.max(-1, Math.min(1, this.carro.lateral / (this.pista.largura / 2))),
    };
  }

  /**
   * Aviso de curva no estilo das anotações de rali. Em retrato, prever vale
   * mais que enxergar: o chevron aparece antes de a curva entrar em tela.
   */
  private proximaCurva() {
    const pista = this.pista;
    const v = Math.max(this.carro.velocidade, 12);
    const alcance = Math.min(320, v * 3.4 + 55);
    let melhor: { severidade: number; distancia: number; direcao: number } | null = null;
    for (let d = 22; d < alcance; d += 9) {
      const am = pista.amostrar(this.carro.s + d);
      const k = Math.abs(am.curvatura);
      if (k < 1 / 420) continue;
      const raio = 1 / k;
      // 1 = curva rápida de raio grande, 6 = grampo
      const sev = Math.max(1, Math.min(6, Math.round(7 - Math.log2(Math.max(raio, 12)) * 1.25)));
      if (!melhor || sev > melhor.severidade) {
        melhor = { severidade: sev, distancia: d, direcao: Math.sign(am.curvatura) };
      }
    }
    return melhor;
  }

  /** Toque do jogador durante as luzes de largada. */
  tocarLargada() {
    return this.sessao.registrarLargadaJogador();
  }

  fantasmaAtual(): Fantasma | null {
    return this.fantasmaAlvo?.fantasma ?? null;
  }

  compostoAtual() { return PNEUS[this.carro.composto]; }

  destruir() {
    this.parar();
    this.entrada.desconectar();
    this.audio.destruir();
    this.render.destruir();
  }
}
