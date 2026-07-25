/**
 * Controle em retrato.
 *
 * Esquema: acelerador automático, direção por arraste relativo na metade
 * inferior e freio em botão dedicado. O arraste é RELATIVO — qualquer toque
 * ancora um ponto zero e o deslocamento a partir dali comanda a direção. Isso
 * elimina a necessidade de acertar uma posição exata com o polegar, funciona
 * para destros e canhotos, e sobrevive ao dedo deslizando durante a curva.
 *
 * Três detalhes que a especificação original não previa e que quebram o jogo se
 * faltarem: devolver a direção ao centro quando o dedo sai da tela, reancorar o
 * ponto zero quando o curso satura, e ignorar toques na faixa superior (que é
 * onde o jogador olha, não onde toca).
 */

export interface EstadoEntrada {
  direcao: number;
  freio: number;
  overtake: boolean;
  /** Só para exibição: posição do polegar no slider, -1..1. */
  posicaoSlider: number;
  tocando: boolean;
}

export interface ConfigEntrada {
  /** Espelha os controles para canhotos. */
  canhoto: boolean;
  /** Modo alternativo de dois botões, para quem não se adapta ao arraste. */
  modoBotoes: boolean;
  sensibilidade: number;
}

const DEADZONE_PX = 6;
/** Curso, em fração da largura da tela, para atingir esterço máximo. */
const CURSO = 0.4;
const SUAVIZACAO = 0.08; // s
const ZONA_INPUT_TOPO = 0.5; // acima disso, a tela é só para olhar

export class Entrada {
  estado: EstadoEntrada = { direcao: 0, freio: 0, overtake: false, posicaoSlider: 0, tocando: false };
  config: ConfigEntrada = { canhoto: false, modoBotoes: false, sensibilidade: 1 };

  private alvoDirecao = 0;
  private ancora = 0;
  private ponteiroDirecao: number | null = null;
  private ponteiroFreio: number | null = null;
  private largura = 1;
  private altura = 1;
  private teclas = new Set<string>();
  private overtakePedido = false;
  private el: HTMLElement | null = null;

  /** Regiões de toque, em px, calculadas no redimensionamento. */
  private botaoFreio = { x: 0, y: 0, r: 0 };
  private botaoOvertake = { x: 0, y: 0, r: 0 };

  conectar(el: HTMLElement) {
    this.el = el;
    el.addEventListener('pointerdown', this.aoDescer, { passive: false });
    el.addEventListener('pointermove', this.aoMover, { passive: false });
    el.addEventListener('pointerup', this.aoSubir, { passive: false });
    el.addEventListener('pointercancel', this.aoSubir, { passive: false });
    el.addEventListener('pointerleave', this.aoSubir, { passive: false });
    window.addEventListener('keydown', this.aoTeclaDesce);
    window.addEventListener('keyup', this.aoTeclaSobe);
    window.addEventListener('blur', this.limpar);
  }

  desconectar() {
    const el = this.el;
    if (el) {
      el.removeEventListener('pointerdown', this.aoDescer);
      el.removeEventListener('pointermove', this.aoMover);
      el.removeEventListener('pointerup', this.aoSubir);
      el.removeEventListener('pointercancel', this.aoSubir);
      el.removeEventListener('pointerleave', this.aoSubir);
    }
    window.removeEventListener('keydown', this.aoTeclaDesce);
    window.removeEventListener('keyup', this.aoTeclaSobe);
    window.removeEventListener('blur', this.limpar);
  }

  redimensionar(largura: number, altura: number, margemInferior: number) {
    this.largura = largura;
    this.altura = altura;
    const raio = 46;
    const margemX = 26;
    const baseY = altura - margemInferior - 62;
    const ladoFreio = this.config.canhoto ? -1 : 1;
    this.botaoFreio = {
      x: ladoFreio > 0 ? largura - margemX - raio : margemX + raio,
      y: baseY, r: raio,
    };
    this.botaoOvertake = {
      x: ladoFreio > 0 ? margemX + raio * 0.82 : largura - margemX - raio * 0.82,
      y: baseY, r: raio * 0.82,
    };
  }

  get regioes() {
    return { freio: this.botaoFreio, overtake: this.botaoOvertake };
  }

  private dentro(x: number, y: number, b: { x: number; y: number; r: number }) {
    // alvo de toque generoso: o raio visual mais uma margem de erro
    return Math.hypot(x - b.x, y - b.y) < b.r + 16;
  }

  private aoDescer = (e: PointerEvent) => {
    e.preventDefault();
    const x = e.clientX, y = e.clientY;
    if (this.dentro(x, y, this.botaoFreio)) {
      this.ponteiroFreio = e.pointerId;
      return;
    }
    if (this.dentro(x, y, this.botaoOvertake)) {
      this.overtakePedido = true;
      return;
    }
    // a metade superior é para olhar a pista, não para comandar
    if (y < this.altura * ZONA_INPUT_TOPO) return;
    if (this.ponteiroDirecao === null) {
      this.ponteiroDirecao = e.pointerId;
      this.ancora = x;
      this.estado.tocando = true;
    }
  };

  private aoMover = (e: PointerEvent) => {
    if (e.pointerId !== this.ponteiroDirecao) return;
    e.preventDefault();
    const cursoPx = this.largura * CURSO;
    let d = e.clientX - this.ancora;
    if (Math.abs(d) < DEADZONE_PX) d = 0;
    else d -= Math.sign(d) * DEADZONE_PX;

    let f = d / cursoPx;
    // Reancoragem: sem isso, arrastes sucessivos na mesma direção esgotam o
    // curso e o jogador fica sem esterço no meio da curva.
    if (Math.abs(f) > 1) {
      this.ancora += (Math.abs(f) - 1) * Math.sign(f) * cursoPx;
      f = Math.sign(f);
    }
    this.estado.posicaoSlider = f;

    // resposta não-linear: precisão fina no começo do curso para acertar o
    // apex, agressividade no fim para as curvas lentas
    const sinal = Math.sign(f);
    const a = Math.abs(f);
    const curva = a < 0.15 ? a * 0.42 : 0.063 + (a - 0.15) ** 1.35 * 1.32;
    this.alvoDirecao = Math.max(-1, Math.min(1, sinal * curva * this.config.sensibilidade));
  };

  private aoSubir = (e: PointerEvent) => {
    if (e.pointerId === this.ponteiroFreio) this.ponteiroFreio = null;
    if (e.pointerId === this.ponteiroDirecao) {
      this.ponteiroDirecao = null;
      this.alvoDirecao = 0;
      this.estado.posicaoSlider = 0;
      this.estado.tocando = false;
    }
  };

  private limpar = () => {
    this.ponteiroDirecao = null;
    this.ponteiroFreio = null;
    this.alvoDirecao = 0;
    this.estado.posicaoSlider = 0;
    this.estado.tocando = false;
    this.teclas.clear();
  };

  private aoTeclaDesce = (e: KeyboardEvent) => {
    this.teclas.add(e.key.toLowerCase());
    if (e.key === ' ' || e.key.toLowerCase() === 'x') this.overtakePedido = true;
  };
  private aoTeclaSobe = (e: KeyboardEvent) => { this.teclas.delete(e.key.toLowerCase()); };

  /** Chamado uma vez por quadro, com o dt real. */
  atualizar(dt: number) {
    // teclado (desenvolvimento e desktop)
    let alvo = this.alvoDirecao;
    const esq = this.teclas.has('arrowleft') || this.teclas.has('a');
    const dir = this.teclas.has('arrowright') || this.teclas.has('d');
    if (esq || dir) alvo = (dir ? 1 : 0) - (esq ? 1 : 0);
    const freandoTecla = this.teclas.has('arrowdown') || this.teclas.has('s') || this.teclas.has('shift');

    const k = 1 - Math.exp(-dt / SUAVIZACAO);
    this.estado.direcao += (alvo - this.estado.direcao) * k;
    if (Math.abs(this.estado.direcao) < 0.002) this.estado.direcao = 0;

    const querFreio = this.ponteiroFreio !== null || freandoTecla;
    // rampa de 120 ms: evita travar a roda com um toque acidental
    const alvoFreio = querFreio ? 1 : 0;
    const kf = 1 - Math.exp(-dt / (querFreio ? 0.12 : 0.05));
    this.estado.freio += (alvoFreio - this.estado.freio) * kf;
    if (this.estado.freio < 0.01) this.estado.freio = 0;

    this.estado.overtake = this.overtakePedido;
    this.overtakePedido = false;
  }
}
