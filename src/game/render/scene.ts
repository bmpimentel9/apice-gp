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
  ColorManagement, PMREMGenerator, SphereGeometry, BackSide, DepthTexture,
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
 * Passe único de pós-processamento. Vinheta, grading, linhas de velocidade e
 * grão — na ordem de retorno por custo definida na direção de arte. Não há
 * bloom multi-passe: o brilho vem de geometria aditiva, que custa uma fração.
 */
const fragCor = `
  precision mediump float;
  varying vec2 vUv;
  uniform sampler2D tCena;
  uniform float uVelocidade;   // 0..1
  uniform float uIntensidade;  // 0..1, respeita "reduzir movimento"
  uniform float uTempo;
  uniform float uImpacto;      // pulso ao bater ou travar roda
  uniform vec3 uTint;
  uniform vec3 uNeblina;
  uniform sampler2D tProfundidade;

  void main() {
    vec2 uv = vUv;
    vec2 centro = vec2(0.5, 0.42);
    vec2 dir = uv - centro;
    float dist = length(dir);

    // aberração cromática só na velocidade — nunca constante
    float ab = uVelocidade * uIntensidade * 0.0055 + uImpacto * 0.01;
    vec3 cor;
    cor.r = texture2D(tCena, uv - dir * ab).r;
    cor.g = texture2D(tCena, uv).g;
    cor.b = texture2D(tCena, uv + dir * ab).b;

    // linhas de velocidade nas bordas
    float bordas = smoothstep(0.28, 0.72, dist);
    float estrias = sin(atan(dir.y, dir.x) * 46.0 + uTempo * 34.0) * 0.5 + 0.5;
    cor += vec3(estrias * bordas * uVelocidade * uVelocidade * uIntensidade * 0.1);

    // vinheta dinâmica: fecha com a velocidade
    float vinheta = 1.0 - dist * (0.34 + uVelocidade * 0.36 * uIntensidade);
    cor *= clamp(vinheta, 0.0, 1.0);

    // Perspectiva atmosférica: o fundo perde saturação e contrasta com o
    // primeiro plano. É o que faz uma imagem de pista "ler" como fotografia.
    float prof = texture2D(tProfundidade, uv).r;
    float longe = smoothstep(0.986, 0.9995, prof);
    float cinza = dot(cor, vec3(0.299, 0.587, 0.114));
    cor = mix(cor, mix(vec3(cinza), uNeblina, 0.55), longe * 0.42);

    // grading
    cor = mix(cor, cor * uTint, 0.14);
    cor = pow(max(cor, 0.0), vec3(1.06));
    cor *= 1.24;

    // grão sutil, disfarça o banding dos gradientes
    float g = fract(sin(dot(uv * vec2(1.0 + uTempo * 0.0001, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
    cor += (g - 0.5) * 0.022;

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
      c = criarCarro3D(equipe, numero);
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
    const frac = Math.min(1, estado.velocidade / VEL_MAXIMA);

    // A câmera sobe e recua com a velocidade — abre o campo de visão quando o
    // tempo de reação encolhe.
    const recuo = 12.6 + frac * 6.4;
    const altura = 5.0 + frac * 2.0;

    // A mira parte do CARRO e segue uma direção — não a posição absoluta da
    // pista. Mirar no traçado desloca o carro para o canto da tela sempre que
    // ele não está exatamente no centro da pista, que é quase sempre.
    const dirX = Math.sin(estado.yaw), dirZ = Math.cos(estado.yaw);
    const adiante = pista.amostrar(estado.s + 30 + frac * 55);
    const mistX = dirX * 0.42 + adiante.tx * 0.58;
    const mistZ = dirZ * 0.42 + adiante.tz * 0.58;
    const norma = Math.hypot(mistX, mistZ) || 1;
    const eixoX = mistX / norma, eixoZ = mistZ / norma;
    const distMira = 24 + frac * 18;

    // A câmera fica atrás do carro NA DIREÇÃO DA MIRA, e não na direção do
    // nariz. É isso que mantém o carro no centro horizontal da tela: com a
    // câmera alinhada ao nariz, qualquer ângulo entre carro e pista joga o
    // carro para o canto — e em curva ele chegava a sair de quadro.
    const alvoPos = new Vector3(
      estado.x - eixoX * recuo,
      estado.y + altura,
      estado.z - eixoZ * recuo,
    );

    // A mira fica BAIXA: é o que inclina a câmera para o chão e empurra o
    // horizonte para o terço superior, liberando tela para a pista à frente.
    const mira = new Vector3(
      estado.x + eixoX * distMira,
      estado.y + 0.15,
      estado.z + eixoZ * distMira,
    );

    if (!this.iniciada) {
      this.camPos.copy(alvoPos);
      this.camAlvo.copy(mira);
      this.iniciada = true;
    } else {
      // suavização exponencial independente de framerate
      const kp = 1 - Math.exp(-dt / 0.1);
      const ka = 1 - Math.exp(-dt / 0.16);
      this.camPos.lerp(alvoPos, kp);
      this.camAlvo.lerp(mira, ka);
    }

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camAlvo);

    // FOV cresce com a velocidade: o truque mais barato de sensação de rapidez
    const fovAlvo = 60 + frac * 16 + (estado.overtakeAtivo ? 4 : 0);
    this.camera.fov += (fovAlvo - this.camera.fov) * (1 - Math.exp(-dt / 0.25));

    // tremor: kerb, escorregamento e impacto
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

    this.matPos.uniforms.uVelocidade.value = frac;
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
