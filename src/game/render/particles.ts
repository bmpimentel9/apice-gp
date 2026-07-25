/**
 * Partículas: poeira na escapatória, fumaça de pneu na travada e faíscas do
 * assoalho.
 *
 * Um único buffer de pontos com pool fixo — nada é alocado durante a corrida.
 * É o efeito que mais vende velocidade e peso por unidade de custo: um carro
 * que levanta poeira ao pisar fora comunica erro sem precisar de texto.
 */
import {
  BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial,
  AdditiveBlending, NormalBlending, Color,
} from 'three';

const MAX = 260;

const VERT = `
  attribute float aTam;
  attribute float aVida;
  attribute vec3 aCor;
  varying float vVida;
  varying vec3 vCor;
  void main() {
    vVida = aVida;
    vCor = aCor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aTam * (300.0 / max(-mv.z, 1.0));
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = `
  precision mediump float;
  varying float vVida;
  varying vec3 vCor;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    if (r > 0.5) discard;
    float alfa = (1.0 - r * 2.0) * vVida;
    gl_FragColor = vec4(vCor, alfa);
  }
`;

interface Particula {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  vida: number; vidaMax: number;
  tam: number;
  r: number; g: number; b: number;
  gravidade: number;
}

export class SistemaParticulas {
  readonly pontos: Points;
  private lista: Particula[] = [];
  private proxima = 0;
  private posArr = new Float32Array(MAX * 3);
  private tamArr = new Float32Array(MAX);
  private vidaArr = new Float32Array(MAX);
  private corArr = new Float32Array(MAX * 3);
  private geo: BufferGeometry;

  constructor(aditivo = false) {
    this.geo = new BufferGeometry();
    this.geo.setAttribute('position', new Float32BufferAttribute(this.posArr, 3));
    this.geo.setAttribute('aTam', new Float32BufferAttribute(this.tamArr, 1));
    this.geo.setAttribute('aVida', new Float32BufferAttribute(this.vidaArr, 1));
    this.geo.setAttribute('aCor', new Float32BufferAttribute(this.corArr, 3));
    const mat = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
      blending: aditivo ? AdditiveBlending : NormalBlending,
    });
    this.pontos = new Points(this.geo, mat);
    this.pontos.frustumCulled = false;
    for (let i = 0; i < MAX; i++) {
      this.lista.push({
        x: 0, y: -9999, z: 0, vx: 0, vy: 0, vz: 0,
        vida: 0, vidaMax: 1, tam: 1, r: 1, g: 1, b: 1, gravidade: -2,
      });
    }
  }

  emitir(
    x: number, y: number, z: number,
    espalhamento: number, vel: number, cor: Color,
    tam: number, duracao: number, quantidade: number, gravidade = -2,
  ) {
    for (let k = 0; k < quantidade; k++) {
      const p = this.lista[this.proxima];
      this.proxima = (this.proxima + 1) % MAX;
      p.x = x + (Math.random() - 0.5) * espalhamento;
      p.y = y + Math.random() * 0.35;
      p.z = z + (Math.random() - 0.5) * espalhamento;
      p.vx = (Math.random() - 0.5) * vel;
      p.vy = Math.random() * vel * 0.7 + 0.4;
      p.vz = (Math.random() - 0.5) * vel;
      p.vida = 1;
      p.vidaMax = duracao * (0.7 + Math.random() * 0.6);
      p.tam = tam * (0.7 + Math.random() * 0.7);
      p.r = cor.r; p.g = cor.g; p.b = cor.b;
      p.gravidade = gravidade;
    }
  }

  atualizar(dt: number) {
    for (let i = 0; i < MAX; i++) {
      const p = this.lista[i];
      if (p.vida <= 0) {
        this.posArr[i * 3 + 1] = -9999;
        this.vidaArr[i] = 0;
        continue;
      }
      p.vida -= dt / p.vidaMax;
      p.vx *= 1 - dt * 1.5;
      p.vz *= 1 - dt * 1.5;
      p.vy += p.gravidade * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      this.posArr[i * 3] = p.x;
      this.posArr[i * 3 + 1] = p.y;
      this.posArr[i * 3 + 2] = p.z;
      this.tamArr[i] = p.tam;
      this.vidaArr[i] = Math.max(0, p.vida);
      this.corArr[i * 3] = p.r;
      this.corArr[i * 3 + 1] = p.g;
      this.corArr[i * 3 + 2] = p.b;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aTam.needsUpdate = true;
    this.geo.attributes.aVida.needsUpdate = true;
    this.geo.attributes.aCor.needsUpdate = true;
  }

  limpar() {
    for (const p of this.lista) { p.vida = 0; p.y = -9999; }
  }
}

export const COR_POEIRA = new Color('#B49A6E');
export const COR_FUMACA = new Color('#D8D8D4');
export const COR_FAISCA = new Color('#FFB040');
