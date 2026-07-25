/**
 * Renderizador: cena, câmera de perseguição e pós-processamento.
 *
 * A câmera é a peça mais importante do jogo em retrato. Numa tela 9:19,5 sobra
 * pouca visão à frente, então ela faz três coisas ao mesmo tempo:
 *  1. mantém o carro no terço inferior, liberando ~60% da tela para o que vem;
 *  2. sobe e recua com a velocidade (o inverso do instinto de "aproximar para
 *     dar velocidade"), abrindo campo de visão justamente quando há menos tempo
 *     de reação;
 *  3. antecipa a curva antes do comando do jogador, para que a curva apareça em
 *     tela antes de chegar.
 */
import {
  Scene, PerspectiveCamera, WebGLRenderer, FogExp2, Group, Vector3, Color,
  DirectionalLight, HemisphereLight, WebGLRenderTarget, OrthographicCamera,
  ShaderMaterial, PlaneGeometry, Mesh, LinearFilter, LinearSRGBColorSpace,
  ColorManagement, PMREMGenerator, SphereGeometry, BackSide, DepthTexture, Vector2,
} from 'three';

/**
 * Gestão de cor desligada de propósito.
 *
 * Com ela ativa, o Three converte cada cor hex de sRGB para linear na entrada e
 * de volta na saída. Para renderização fisicamente correta isso é o certo — mas
 * aqui a iluminação é toda assada à mão em cores escolhidas a dedo, e a
 * conversão dupla afundava a cena inteira (o asfalto saía quase preto). Sem
 * gestão de cor, o que está no código é exatamente o que aparece na tela.
 */
ColorManagement.enabled = false;
import type { Pista } from '../sim/track';
import type { EstadoCarro } from '../sim/car';
import { gerarMundo, gerarCeu } from './world';
import { criarCarro3D, type Carro3D } from './car3d';
import { gerarCenario, gerarNuvens } from './scenery';
import { SistemaParticulas, COR_POEIRA, COR_FUMACA, COR_FAISCA } from './particles';
import { AMBIENTES, type HoraDoDia } from './palette';
import { VEL_MAXIMA } from '../sim/constants';
import type { Equipe } from '../data/teams';

const fragPos = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/**
 * Passe único de pós-processamento.
 *
 * A ordem das operações não é arbitrária: distorção de calor precisa deformar a
 * UV antes de qualquer leitura de cor; o desfoque e a aberração cromática saem
 * do MESMO laço de amostras (a aberração fica de graça); o tone mapping só pode
 * vir depois do brilho somado, senão o realce estoura sem rolloff; a vinheta
 * vem depois do grading, senão o brilho vaza para os cantos escuros; e o grão é
 * sempre por último, porque antes do tone mapping ele some nos realces.
 *
 * O tone mapping é feito À MÃO aqui: o `toneMapping` do renderizador não é
 * aplicado quando se desenha para um render target, que é exatamente o caso.
 */
/** Piso de retração: abaixo disso a câmera entra dentro do carro. */
const RECUO_MINIMO = 4.5;

const fragCor = `
  precision mediump float;
  varying vec2 vUv;
  uniform sampler2D tCena;
  uniform sampler2D tProfundidade;
  uniform float uVelocidade;   // 0..1, já com curva exponencial aplicada
  uniform float uIntensidade;  // 0..1, respeita "reduzir movimento"
  uniform float uTempo;
  uniform float uImpacto;
  uniform float uFrenagem;     // 0..1, pulso curto ao frear forte
  uniform vec3 uTint;
  uniform vec3 uNeblina;
  uniform vec2 uCentro;

  const int AMOSTRAS = 7;

  // ACES filmica (aproximação de Narkowicz): rolloff suave nos realces
  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }

  void main() {
    vec2 uv = vUv;
    vec2 dir = uv - uCentro;
    float dist = length(dir);

    // ── Desfoque radial + aberração cromática, no mesmo laço ──────────────
    // O centro fica protegido: é por ali que o jogador lê a pista e a curva.
    float mascara = smoothstep(0.2, 0.78, dist);
    float forca = uVelocidade * mascara * uIntensidade * 0.055
                + uImpacto * 0.03;
    float ruido = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);

    vec3 cor = vec3(0.0);
    for (int i = 0; i < AMOSTRAS; i++) {
      float t = (float(i) + ruido) / float(AMOSTRAS) - 0.5;
      vec2 o = dir * forca * t;
      // cada canal com raio ligeiramente diferente: a aberração sai de graça
      cor.r += texture2D(tCena, uv + o * 1.035).r;
      cor.g += texture2D(tCena, uv + o).g;
      cor.b += texture2D(tCena, uv + o * 0.965).b;
    }
    cor /= float(AMOSTRAS);

    // ── Linhas de velocidade: só no topo da faixa, para não virar papel de
    // parede. Efeito que o jogador percebe conscientemente é poluição.
    float topo = smoothstep(0.55, 1.0, uVelocidade);
    float bordas = smoothstep(0.34, 0.8, dist);
    float estrias = sin(atan(dir.y, dir.x) * 52.0 + uTempo * 30.0) * 0.5 + 0.5;
    cor += vec3(estrias * bordas * topo * uIntensidade * 0.09);

    // ── Perspectiva atmosférica ───────────────────────────────────────────
    float prof = texture2D(tProfundidade, uv).r;
    float longe = smoothstep(0.986, 0.9995, prof);
    float cinza = dot(cor, vec3(0.299, 0.587, 0.114));
    cor = mix(cor, mix(vec3(cinza), uNeblina, 0.55), longe * 0.42);

    // ── Tone mapping ──────────────────────────────────────────────────────
    cor = aces(cor * 0.94);

    // ── Grading ───────────────────────────────────────────────────────────
    // O tone mapping comprime os realces e lava o céu; a saturação devolve o
    // contraste de cor sem estourar de novo os brancos.
    float luma = dot(cor, vec3(0.299, 0.587, 0.114));
    cor = mix(vec3(luma), cor, 1.24);
    cor = mix(cor, cor * uTint, 0.13);
    cor *= 1.05;

    // ── Vinheta ───────────────────────────────────────────────────────────
    // Presa a EVENTO (frenagem, impacto) e não à velocidade contínua: uma
    // vinheta que só aperta com a velocidade vira fundo e o cérebro filtra.
    float aperto = 0.3 + uFrenagem * 0.4 * uIntensidade + uImpacto * 0.3;
    float vinheta = 1.0 - dist * aperto;
    cor *= clamp(vinheta, 0.0, 1.0);

    // ── Grão, sempre por último ───────────────────────────────────────────
    float g = fract(sin(dot(uv * vec2(1.0 + uTempo * 0.0001, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
    cor += (g - 0.5) * 0.02;

    gl_FragColor = vec4(cor, 1.0);
  }
`;

export interface OpcoesRender {
  reduzirMovimento: boolean;
  qualidade: number; // 0..1
}

export class Renderizador {
  readonly cena = new Scene();
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  private alvoRT: WebGLRenderTarget;
  private cenaPos = new Scene();
  private cameraPos = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private matPos: ShaderMaterial;
  private mundo?: Group;
  private cenario?: Group;
  private nuvens?: Group;
  private ceu?: Mesh;
  private poeira = new SistemaParticulas(false);
  private faiscas = new SistemaParticulas(true);
  private carros = new Map<string, Carro3D>();
  private pista?: Pista;
  private hora: HoraDoDia = 'dia';

  // estado suavizado da câmera
  private luzChave!: DirectionalLight;
  private luzPreenchimento!: HemisphereLight;
  private luzContra!: DirectionalLight;
  private camPos = new Vector3();
  private camAlvo = new Vector3();
  private iniciada = false;
  private tempo = 0;
  private impacto = 0;
  private recuoSuave = 14;
  private temMuros = false;
  private esperaExtensao = 0;
  private deslocEvento = 0;
  private frenagemSuave = 0;
  opcoes: OpcoesRender = { reduzirMovimento: false, qualidade: 1 };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      // Em GPU tile-based (todas as da Apple) o resolve de MSAA é praticamente
      // gratuito, e serrilhado em malha low-poly é o sinal nº 1 de amadorismo.
      canvas, antialias: true, powerPreference: 'high-performance',
      alpha: false, stencil: false, depth: true,
    });
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.setClearColor(0x0a0e18, 1);

    this.camera = new PerspectiveCamera(62, 1, 0.4, 4600);

    // Três luzes, e só os carros as recebem — a cena estática é assada.
    // Chave + preenchimento + contra-luz é o setup clássico de fotografia de
    // produto, e é o que separa a silhueta do carro do fundo.
    this.luzChave = new DirectionalLight(0xfff4e0, 1.5);
    this.luzChave.position.set(60, 120, 40);
    this.cena.add(this.luzChave);
    // HemisphereLight custa quase nada: interpola céu/chão pela normal, sem
    // posição nem sombra. Substitui a ambiente chapada com muito mais volume.
    this.luzPreenchimento = new HemisphereLight(0xaeceff, 0x3a2f22, 0.9);
    this.cena.add(this.luzPreenchimento);
    this.luzContra = new DirectionalLight(0xbfd8ff, 0.85);
    this.luzContra.position.set(-40, 30, -70);
    this.cena.add(this.luzContra);

    // O MSAA do canvas não se propaga para um render target: sem `samples`, o
    // passe de pós-processamento devolveria a cena serrilhada.
    this.alvoRT = new WebGLRenderTarget(2, 2, {
      minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true, samples: 4,
    });
    // textura de profundidade: alimenta a perspectiva atmosférica
    this.alvoRT.depthTexture = new DepthTexture(2, 2);
    this.matPos = new ShaderMaterial({
      vertexShader: fragPos,
      fragmentShader: fragCor,
      uniforms: {
        tCena: { value: this.alvoRT.texture },
        uVelocidade: { value: 0 },
        uIntensidade: { value: 1 },
        uTempo: { value: 0 },
        uImpacto: { value: 0 },
        uTint: { value: new Color(1, 1, 1) },
        uNeblina: { value: new Color(0.7, 0.75, 0.82) },
        uFrenagem: { value: 0 },
        uCentro: { value: new Vector2(0.5, 0.4) },
        tProfundidade: { value: null },
      },
      depthTest: false, depthWrite: false,
    });
    this.matPos.uniforms.tProfundidade.value = this.alvoRT.depthTexture;
    this.cenaPos.add(new Mesh(new PlaneGeometry(2, 2), this.matPos));
    this.cena.add(this.poeira.pontos, this.faiscas.pontos);
  }

  carregarPista(pista: Pista, hora: HoraDoDia) {
    if (this.mundo) { this.cena.remove(this.mundo); this.descartar(this.mundo); }
    if (this.cenario) { this.cena.remove(this.cenario); this.descartar(this.cenario); }
    if (this.nuvens) { this.cena.remove(this.nuvens); }
    if (this.ceu) { this.cena.remove(this.ceu); }
    this.poeira.limpar();
    this.faiscas.limpar();
    this.pista = pista;
    this.hora = hora;
    const amb = AMBIENTES[hora];
    const { grupo } = gerarMundo(pista, hora, this.renderer);
    this.mundo = grupo;
    this.cena.add(grupo);
    this.cenario = gerarCenario(pista, hora);
    this.cena.add(this.cenario);
    this.ceu = gerarCeu(hora);
    this.cena.add(this.ceu);
    const nv = gerarNuvens(hora);
    if (nv) { this.nuvens = nv; this.cena.add(nv); }
    this.cena.fog = new FogExp2(new Color(amb.neblina).getHex(), amb.neblinaDensidade);

    // As luzes dos carros seguem o ambiente do circuito
    const [sx, sy, sz] = amb.sol;
    this.luzChave.position.set(sx * 120, sy * 120, sz * 120);
    this.luzChave.color.set(amb.corLuz);
    this.luzChave.intensity = hora === 'noite' ? 0.75 : 1.5;
    this.luzPreenchimento.color.set(amb.ceuHorizonte);
    this.luzPreenchimento.groundColor.set(amb.corSombra);
    this.luzPreenchimento.intensity = hora === 'noite' ? 0.55 : 0.95;
    this.luzContra.position.set(-sx * 90, 40, -sz * 90);
    this.luzContra.intensity = hora === 'noite' ? 1.1 : 0.85;

    // Reflexo do céu nos carros, gerado uma única vez a partir de uma cena de
    // gradiente — sem nenhum arquivo de imagem.
    this.gerarAmbienteReflexo(amb.ceuTopo, amb.ceuHorizonte);
    this.renderer.setClearColor(new Color(amb.neblina).getHex(), 1);
    this.matPos.uniforms.uTint.value = new Color(amb.corLuz);
    this.matPos.uniforms.uNeblina.value = new Color(amb.neblina);
    this.temMuros = pista.dados.id === 'principado' || pista.dados.id === 'corniche';
    this.recuoSuave = 14;
    this.iniciada = false;
  }

  /** PMREM a partir de um céu procedural: dá reflexo real à pintura do carro. */
  private gerarAmbienteReflexo(topo: string, horizonte: string) {
    const anterior = this.cena.environment as { dispose?: () => void } | null;
    anterior?.dispose?.();

    const pmrem = new PMREMGenerator(this.renderer);
    const cenaCeu = new Scene();
    const domo = new Mesh(
      new SphereGeometry(80, 12, 8),
      new ShaderMaterial({
        side: BackSide,
        uniforms: { uTopo: { value: new Color(topo) }, uBaixo: { value: new Color(horizonte) } },
        vertexShader: `varying float vY; void main(){ vY = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uTopo; uniform vec3 uBaixo; varying float vY;
          void main(){ gl_FragColor = vec4(mix(uBaixo, uTopo, pow(max(vY,0.0), 0.45)), 1.0); }`,
      }),
    );
    cenaCeu.add(domo);
    this.cena.environment = pmrem.fromScene(cenaCeu, 0.04, 1, 200).texture;
    pmrem.dispose();
    domo.geometry.dispose();
    (domo.material as ShaderMaterial).dispose();
  }

  garantirCarro(id: string, equipe: Equipe, numero: number) {
    let c = this.carros.get(id);
    if (!c) {
      c = criarCarro3D(equipe, numero, id === 'fantasma');
      this.carros.set(id, c);
      this.cena.add(c.grupo);
    }
    return c;
  }

  removerCarrosExceto(ids: Set<string>) {
    for (const [id, c] of this.carros) {
      if (!ids.has(id)) {
        this.cena.remove(c.grupo);
        this.descartar(c.grupo);
        this.carros.delete(id);
      }
    }
  }

  /** Posiciona um carro na cena a partir do estado da simulação. */
  atualizarCarro(id: string, estado: EstadoCarro, visivel = true) {
    const c = this.carros.get(id);
    if (!c) return;
    c.grupo.visible = visivel;
    if (!visivel) return;
    c.grupo.position.set(estado.x, estado.y, estado.z);
    c.grupo.rotation.y = estado.yaw;
    c.definirEsterco(estado.esterco * 1.6);
    c.definirModoAero(estado.modoAero === 'reta');
    const mergulho = Math.max(-0.035, Math.min(0.05, -estado.gForceLong * 0.014));
    const rolagem = Math.max(-0.05, Math.min(0.05, estado.gForceLat * 0.012));
    c.definirInclinacao(mergulho, rolagem);
    // giro das rodas
    const giro = (estado.velocidade / 0.36) * 0.016;
    for (const r of c.rodas) r.children[0].rotation.x -= giro;
  }

  pulsoImpacto(forca = 1) { this.impacto = Math.min(1, this.impacto + forca); }

  /**
   * Emite as partículas do carro do jogador. Poeira quando pisa fora, fumaça
   * quando trava a roda ou escorrega, faísca quando o assoalho raspa em alta
   * velocidade — os três sinais que o jogador lê sem olhar o HUD.
   */
  emitirDoCarro(estado: EstadoCarro, dt: number) {
    const atras = 2.2;
    const bx = estado.x - Math.sin(estado.yaw) * atras;
    const bz = estado.z - Math.cos(estado.yaw) * atras;

    if (estado.foraDaPista && estado.velocidade > 6) {
      const q = Math.min(4, Math.ceil(estado.velocidade * dt * 3));
      this.poeira.emitir(bx, estado.y + 0.1, bz, 1.6, 2.4, COR_POEIRA, 26, 0.85, q, -2.2);
    }
    if (estado.derrapando > 0.25 && estado.velocidade > 10) {
      const q = Math.min(3, Math.ceil(estado.derrapando * 3 * dt * 40));
      this.poeira.emitir(bx, estado.y + 0.16, bz, 1.3, 1.5, COR_FUMACA, 20, 0.6, q, -0.7);
    }
    if (estado.velocidade > 62 && Math.random() < dt * 12) {
      this.faiscas.emitir(bx, estado.y + 0.06, bz, 0.7, 3.2, COR_FAISCA, 7, 0.34, 2, -7);
    }
  }

  /**
   * Atualiza a câmera de perseguição. `dt` real para suavização independente
   * de taxa de quadros.
   */
  atualizarCamera(estado: EstadoCarro, dt: number) {
    const pista = this.pista;
    if (!pista) return;
    const bruta = Math.min(1, estado.velocidade / VEL_MAXIMA);
    // Curva exponencial: quase nada até a metade da faixa, e a maior parte da
    // mudança reservada para o terço final. Sem isso, 300 km/h parece só "um
    // pouco mais" que 150 — os efeitos já estão meio ligados desde cedo e
    // saturam antes do topo.
    const frac = Math.pow(bruta, 1.8);

    // ── 1. Pose ideal ────────────────────────────────────────────────────
    // A câmera reage a EVENTO, não só a velocidade: frear puxa para a frente
    // e acelerar empurra para trás, imitando a transferência de peso. É o
    // contraste entre os dois estados que faz sentir a velocidade que se tinha.
    const g = estado.gForceLong;
    const alvoEvento = Math.max(-1, Math.min(1, -g / 18));
    const tauEvento = alvoEvento > this.deslocEvento ? 0.16 : 0.45;
    this.deslocEvento += (alvoEvento - this.deslocEvento) * (1 - Math.exp(-dt / tauEvento));

    const recuoIdeal = 13.5 + frac * 7.5 - this.deslocEvento * 1.1;
    const alturaIdeal = 5.0 + frac * 2.2 - this.deslocEvento * 0.3;

    // Antecipação de curva escalada pela curvatura: peso baixo em reta, alto
    // em curva fechada. Peso fixo ou erra a curva ou embrulha o estômago.
    const iAqui = Math.min(pista.n - 1, Math.floor((estado.s / pista.comprimento) * pista.n));
    const curvatura = Math.abs(pista.curvatura[iAqui]);
    const raio = curvatura > 1e-5 ? 1 / curvatura : 9999;
    const fechada = Math.max(0, Math.min(1, (60 - raio) / 45));
    const pesoTangente = 0.22 + fechada * 0.23;
    // em curva de raio pequeno a mira encurta: olhar longe demais faz a câmera
    // apontar para depois da curva, e o jogador perde a referência
    const distMira = (24 + frac * 18) * (1 - fechada * 0.4);

    const dirX = Math.sin(estado.yaw), dirZ = Math.cos(estado.yaw);
    const adiante = pista.amostrar(estado.s + 26 + frac * 52);
    const mistX = dirX * (1 - pesoTangente) + adiante.tx * pesoTangente;
    const mistZ = dirZ * (1 - pesoTangente) + adiante.tz * pesoTangente;
    const norma = Math.hypot(mistX, mistZ) || 1;
    const eixoX = mistX / norma, eixoZ = mistZ / norma;

    // ── 2. Resolução de oclusão ──────────────────────────────────────────
    // Em vez de raycast contra a malha, o teste usa a representação
    // matemática do traçado: projeta a posição desejada e mede o deslocamento
    // lateral. Se estourar o corredor, o braço encurta. Custa quase nada e
    // resolve túnel, muro e curva fechada de rua.
    const folga = pista.largura / 2 + (this.temMuros ? 1.2 : 8.5);
    let recuoLivre = recuoIdeal;
    const passos = 6;
    for (let k = 0; k <= passos; k++) {
      const teste = recuoIdeal - (recuoIdeal - RECUO_MINIMO) * (k / passos);
      const tx = estado.x - eixoX * teste;
      const tz = estado.z - eixoZ * teste;
      const proj = pista.projetar(tx, tz, estado.indicePista);
      if (Math.abs(proj.lateral) <= folga) { recuoLivre = teste; break; }
      recuoLivre = RECUO_MINIMO;
    }

    // Histerese: só volta a estender depois de uma folga extra e de um tempo
    // mínimo. Sem isso a câmera pisca entre retraída e estendida na borda.
    const precisaRetrair = recuoLivre < this.recuoSuave - 0.05;
    if (precisaRetrair) {
      this.esperaExtensao = 0.18;
    } else {
      this.esperaExtensao = Math.max(0, this.esperaExtensao - dt);
    }
    const alvoRecuo = this.esperaExtensao > 0 ? Math.min(recuoLivre, this.recuoSuave) : recuoLivre;

    // Assimetria deliberada: retrai depressa, volta devagar. Perder o carro de
    // vista mesmo por um quadro é grave; já um zoom-out abrupto chama atenção
    // para a própria câmera.
    const tauRecuo = alvoRecuo < this.recuoSuave ? 0.09 : 0.5;
    this.recuoSuave += (alvoRecuo - this.recuoSuave) * (1 - Math.exp(-dt / tauRecuo));

    const fracRetraida = this.recuoSuave / recuoIdeal;
    const altura = alturaIdeal * Math.max(0.6, fracRetraida);

    const alvoPos = new Vector3(
      estado.x - eixoX * this.recuoSuave,
      estado.y + altura,
      estado.z - eixoZ * this.recuoSuave,
    );
    const mira = new Vector3(
      estado.x + eixoX * distMira,
      estado.y + 0.35,
      estado.z + eixoZ * distMira,
    );

    // ── 3. Filtro temporal, com constante por eixo ───────────────────────
    // A lateral é a mais rápida do sistema: se ela for tão lenta quanto a
    // longitudinal, o carro sai do quadro antes de a câmera acompanhar — que é
    // exatamente como se "perde o carro" em curva fechada.
    if (!this.iniciada) {
      this.camPos.copy(alvoPos);
      this.camAlvo.copy(mira);
      this.iniciada = true;
    } else {
      const dx = alvoPos.x - this.camPos.x;
      const dy = alvoPos.y - this.camPos.y;
      const dz = alvoPos.z - this.camPos.z;
      // decompõe em longitudinal (eixo da mira) e lateral (perpendicular)
      const dLong = dx * eixoX + dz * eixoZ;
      const dLat = dx * eixoZ - dz * eixoX;
      const kLong = 1 - Math.exp(-dt / 0.14);
      const kLat = 1 - Math.exp(-dt / 0.08);
      const kAlt = 1 - Math.exp(-dt / 0.1);
      const long = dLong * kLong;
      const lat = dLat * kLat;
      this.camPos.x += long * eixoX + lat * eixoZ;
      this.camPos.z += long * eixoZ - lat * eixoX;
      this.camPos.y += dy * kAlt;
      this.camAlvo.lerp(mira, 1 - Math.exp(-dt / 0.11));
    }

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camAlvo);

    // ── 4. FOV ───────────────────────────────────────────────────────────
    // Numa tela 9:19,5 o FOV do Three.js é VERTICAL, então 62° verticais viram
    // só ~31° horizontais: é uma teleobjetiva. Por isso o campo de visão vem
    // de afastar a câmera, não de abrir o ângulo.
    //
    // Quando o braço retrai por obstáculo, o FOV fecha na mesma proporção: o
    // carro mantém o tamanho aparente e a retração não vira um solavanco de
    // zoom.
    // Faixa mais ampla que antes: base mais fechada e topo mais aberto, para
    // que o topo da faixa de velocidade tenha para onde crescer.
    const fovBase = 57 + frac * 26 + (estado.overtakeAtivo ? 4 : 0);
    const fovAlvo = fovBase - (1 - fracRetraida) * 8 - this.frenagemSuave * 9;
    // cai rápido, sobe devagar: o "soco" da frenagem é o que prova a velocidade
    const tauFov = fovAlvo < this.camera.fov ? 0.14 : 0.5;
    this.camera.fov += (fovAlvo - this.camera.fov) * (1 - Math.exp(-dt / tauFov));

    if (!this.opcoes.reduzirMovimento) {
      const tremor = (estado.foraDaPista ? 0.05 : 0) + estado.derrapando * 0.035 + this.impacto * 0.22;
      if (tremor > 0.001) {
        this.camera.position.x += (Math.random() - 0.5) * tremor;
        this.camera.position.y += (Math.random() - 0.5) * tremor;
      }
    }
    this.camera.updateProjectionMatrix();

    if (this.ceu) this.ceu.position.set(this.camera.position.x, 0, this.camera.position.z);
    if (this.nuvens) this.nuvens.position.set(this.camera.position.x, 0, this.camera.position.z);

    // pulso de frenagem: entra rápido, sai devagar
    const alvoFrenagem = Math.max(0, Math.min(1, -g / 16));
    this.frenagemSuave += (alvoFrenagem - this.frenagemSuave)
      * (1 - Math.exp(-dt / (alvoFrenagem > this.frenagemSuave ? 0.09 : 0.4)));

    // tremor contínuo de alta velocidade, separado do tremor de zebra
    if (!this.opcoes.reduzirMovimento && frac > 0.25) {
      const t = (frac - 0.25) * 0.09;
      this.camera.position.x += (Math.random() - 0.5) * t;
      this.camera.position.y += (Math.random() - 0.5) * t * 0.7;
    }

    this.matPos.uniforms.uVelocidade.value = frac;
    this.matPos.uniforms.uFrenagem.value = this.frenagemSuave;
    this.matPos.uniforms.uImpacto.value = this.impacto;
    this.matPos.uniforms.uIntensidade.value = this.opcoes.reduzirMovimento ? 0.25 : 1;
    this.impacto *= Math.exp(-dt / 0.13);
  }

  redimensionar(largura: number, altura: number, dpr: number) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(largura, altura, false);
    this.camera.aspect = largura / altura;
    this.camera.updateProjectionMatrix();
    const escala = this.opcoes.qualidade;
    this.alvoRT.setSize(Math.max(2, Math.floor(largura * dpr * escala)), Math.max(2, Math.floor(altura * dpr * escala)));
  }

  desenhar(dt: number) {
    this.tempo += dt;
    this.poeira.atualizar(dt);
    this.faiscas.atualizar(dt);
    this.matPos.uniforms.uTempo.value = this.tempo;
    this.renderer.setRenderTarget(this.alvoRT);
    this.renderer.render(this.cena, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.cenaPos, this.cameraPos);
  }

  private descartar(obj: Group | Mesh) {
    obj.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as { dispose?: () => void } | undefined;
      if (mat?.dispose) mat.dispose();
    });
  }

  destruir() {
    this.alvoRT.dispose();
    this.renderer.dispose();
  }
}
