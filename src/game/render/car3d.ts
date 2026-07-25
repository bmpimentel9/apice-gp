/**
 * Carro de Fórmula 1 2026, gerado inteiramente por código.
 *
 * Geometria montada a partir das dimensões do regulamento 2026: entre-eixos
 * 3,40 m, largura 1,90 m, pneu dianteiro 705×280 mm e traseiro 710×375 mm.
 *
 * A câmera é de perseguição, então a modelagem prioriza o que se vê DE TRÁS, na
 * ordem em que o olho registra: pneus traseiros, asa traseira, difusor, halo,
 * airbox. O difusor com canais visíveis e a "cintura de vespa" atrás do cockpit
 * são os dois detalhes que mais separam um F1 de um carro de corrida genérico —
 * e eram exatamente os que faltavam na versão anterior, feita só de caixas.
 *
 * Eixos locais: +Z é a frente, +X é a direita, +Y é para cima. Origem no centro
 * do entre-eixos, no plano do chão.
 */
import {
  BufferGeometry, Float32BufferAttribute, Mesh, Group, MeshPhysicalMaterial,
  MeshLambertMaterial, Color, CircleGeometry, MeshBasicMaterial, DoubleSide,
} from 'three';
import type { Equipe } from '../data/teams';

type V3 = [number, number, number];

class Malha {
  pos: number[] = [];
  cor: number[] = [];
  idx: number[] = [];

  face(vs: V3[], cor: Color) {
    const base = this.pos.length / 3;
    for (const v of vs) {
      this.pos.push(v[0], v[1], v[2]);
      this.cor.push(cor.r, cor.g, cor.b);
    }
    for (let i = 1; i < vs.length - 1; i++) this.idx.push(base, base + i, base + i + 1);
  }

  /**
   * Prisma de seção retangular com largura, altura e deslocamento independentes
   * em cada extremidade. É a peça-base de tudo: permite afilar o nariz, abrir o
   * airbox e criar a cintura sem geometria especial.
   */
  secao(
    z0: number, z1: number,
    l0: number, l1: number,
    b0: number, b1: number,
    t0: number, t1: number,
    cor: Color, dx = 0,
  ) {
    const a: V3 = [-l0 / 2 + dx, b0, z0], b: V3 = [l0 / 2 + dx, b0, z0];
    const c: V3 = [l0 / 2 + dx, t0, z0], d: V3 = [-l0 / 2 + dx, t0, z0];
    const e: V3 = [-l1 / 2 + dx, b1, z1], f: V3 = [l1 / 2 + dx, b1, z1];
    const g: V3 = [l1 / 2 + dx, t1, z1], h: V3 = [-l1 / 2 + dx, t1, z1];
    const topo = cor.clone().multiplyScalar(1.06);
    const baixo = cor.clone().multiplyScalar(0.5);
    const lado = cor.clone().multiplyScalar(0.86);
    this.face([e, f, g, h], topo);   // frente
    this.face([b, a, d, c], lado);   // trás
    this.face([d, h, g, c], topo);   // topo
    this.face([a, b, f, e], baixo);  // base
    this.face([a, e, h, d], lado);   // esquerda
    this.face([f, b, c, g], lado);   // direita
  }

  /** Placa fina — asas, strakes, placas de extremidade. */
  placa(z0: number, z1: number, larg: number, y0: number, y1: number, esp: number, cor: Color, dx = 0) {
    this.secao(z0, z1, larg, larg, y0, y1, y0 + esp, y1 + esp, cor, dx);
  }

  geometria() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.cor, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

export interface Carro3D {
  grupo: Group;
  rodas: Group[];
  flap: Mesh;
  definirModoAero(reta: boolean): void;
  definirEsterco(rad: number): void;
  definirInclinacao(mergulho: number, rolagem: number): void;
}

// Dimensões do regulamento 2026
const PNEU_D_DIANT = 0.705;
const PNEU_L_DIANT = 0.28;
const PNEU_D_TRAS = 0.71;
const PNEU_L_TRAS = 0.375;
const ENTRE_EIXOS = 3.4;
const BITOLA_DIANT = 1.56;
const BITOLA_TRAS = 1.5;

/** Roda com aro de 18": cilindro de 16 lados, que já não denuncia low-poly. */
function criarRoda(diametro: number, largura: number, corAro: Color) {
  const m = new Malha();
  const lados = 16;
  const r = diametro / 2;
  const rAro = r * 0.64; // 18" dentro de um pneu de 705 mm
  const pneu = new Color('#16171A');
  const pneuLado = new Color('#101114');
  const meia = largura / 2;

  for (let i = 0; i < lados; i++) {
    const a1 = (i / lados) * Math.PI * 2;
    const a2 = ((i + 1) / lados) * Math.PI * 2;
    const y1 = Math.sin(a1) * r, z1 = Math.cos(a1) * r;
    const y2 = Math.sin(a2) * r, z2 = Math.cos(a2) * r;
    // banda de rodagem, ligeiramente abaulada
    const bojo = 1.015;
    m.face([
      [-meia, y1 * bojo, z1 * bojo], [meia, y1 * bojo, z1 * bojo],
      [meia, y2 * bojo, z2 * bojo], [-meia, y2 * bojo, z2 * bojo],
    ], pneu);
    // flanco
    const ya1 = Math.sin(a1) * rAro, za1 = Math.cos(a1) * rAro;
    const ya2 = Math.sin(a2) * rAro, za2 = Math.cos(a2) * rAro;
    m.face([[meia, y1, z1], [meia, y2, z2], [meia, ya2, za2], [meia, ya1, za1]], pneuLado);
    m.face([[-meia, y2, z2], [-meia, y1, z1], [-meia, ya1, za1], [-meia, ya2, za2]], pneuLado);
    // aro
    m.face([[meia * 0.96, ya1, za1], [meia * 0.96, ya2, za2], [0, ya2 * 0.2, za2 * 0.2], [0, ya1 * 0.2, za1 * 0.2]], corAro);
    m.face([[-meia * 0.96, ya2, za2], [-meia * 0.96, ya1, za1], [0, ya1 * 0.2, za1 * 0.2], [0, ya2 * 0.2, za2 * 0.2]], corAro);
  }
  const mesh = new Mesh(m.geometria(), new MeshLambertMaterial({ vertexColors: true }));
  mesh.frustumCulled = false;
  return mesh;
}

export function criarCarro3D(equipe: Equipe, numero: number): Carro3D {
  const cor = new Color(equipe.cor);
  const cor2 = new Color(equipe.corSecundaria);
  const escuro = cor.clone().multiplyScalar(0.42);
  // fibra de carbono crua: assoalho, strakes, pilões e halo
  const carbono = new Color('#1A1C20');
  const carbonoClaro = new Color('#26292F');
  const aro = new Color('#3A3D44');

  const corpo = new Malha();

  // ── Assoalho ────────────────────────────────────────────────────────────
  corpo.secao(-2.30, 1.05, 1.55, 1.42, 0.028, 0.045, 0.11, 0.16, carbono);

  // ── Difusor: o elemento mais visível de trás ────────────────────────────
  // Rampa ascendente com dois strakes formando três canais. Sem ele o carro
  // fica "liso" por trás, que é o erro nº 1 de quem modela F1 sem referência.
  corpo.secao(-2.86, -2.30, 1.02, 1.30, 0.09, 0.03, 0.30, 0.13, carbonoClaro);
  for (const dx of [-0.30, 0.30]) {
    corpo.secao(-2.86, -2.30, 0.035, 0.035, 0.09, 0.03, 0.30, 0.13, carbono, dx);
  }
  // placas laterais do difusor
  for (const dx of [-0.52, 0.52]) {
    corpo.secao(-2.86, -2.30, 0.04, 0.04, 0.06, 0.03, 0.34, 0.16, carbono, dx);
  }

  // ── Monocoque: estreita atrás do cockpit (a "cintura de vespa") ─────────
  corpo.secao(1.05, 1.95, 0.62, 0.34, 0.16, 0.22, 0.50, 0.40, cor);   // frente do chassi
  corpo.secao(0.10, 1.05, 0.66, 0.62, 0.14, 0.16, 0.60, 0.50, cor);   // cockpit
  corpo.secao(-0.75, 0.10, 0.60, 0.40, 0.13, 0.13, 0.66, 0.58, cor);  // cintura
  corpo.secao(-1.85, -0.75, 0.40, 0.26, 0.12, 0.12, 0.58, 0.40, cor); // rumo à traseira
  corpo.secao(-2.34, -1.85, 0.26, 0.16, 0.11, 0.11, 0.40, 0.30, escuro);

  // ── Nariz afilado + asa dianteira de três elementos ─────────────────────
  corpo.secao(1.95, 2.62, 0.34, 0.14, 0.22, 0.19, 0.40, 0.27, cor);
  corpo.secao(2.62, 2.92, 0.14, 0.09, 0.19, 0.16, 0.27, 0.21, cor2);
  // pilões que ligam o nariz à asa
  for (const dx of [-0.15, 0.15]) corpo.secao(2.55, 2.86, 0.05, 0.05, 0.10, 0.08, 0.20, 0.17, carbono, dx);
  // três elementos, envergadura 1,60 m
  corpo.placa(2.68, 3.02, 1.60, 0.055, 0.045, 0.022, cor2);
  corpo.placa(2.60, 2.86, 1.60, 0.10, 0.085, 0.02, cor);
  corpo.placa(2.54, 2.74, 1.58, 0.15, 0.13, 0.018, cor2);
  // placas de extremidade
  for (const dx of [-0.80, 0.80]) corpo.secao(2.52, 3.04, 0.028, 0.028, 0.05, 0.04, 0.30, 0.24, carbono, dx);

  // ── Sidepods com undercut ───────────────────────────────────────────────
  for (const lado of [-1, 1]) {
    // entrada de ar alta e estreita (padrão 2026)
    corpo.secao(0.30, 0.86, 0.30, 0.40, 0.30, 0.26, 0.56, 0.48, cor2, lado * 0.60);
    // corpo do sidepod, afinando e descendo até a traseira
    corpo.secao(-1.15, 0.30, 0.52, 0.30, 0.14, 0.13, 0.50, 0.30, cor, lado * 0.56);
    // undercut: a aba inferior que "flutua" sobre o assoalho
    corpo.secao(-1.05, 0.62, 0.30, 0.20, 0.10, 0.09, 0.20, 0.16, escuro, lado * 0.70);
    // defletor de esteira, à frente do sidepod (2026 removeu o aro da roda)
    corpo.secao(1.05, 1.45, 0.04, 0.04, 0.12, 0.12, 0.34, 0.28, carbono, lado * 0.62);
  }

  // ── Airbox e cobertura do motor ─────────────────────────────────────────
  corpo.secao(-0.28, 0.16, 0.34, 0.30, 0.62, 0.66, 0.94, 0.90, cor);   // entrada
  corpo.secao(-1.55, -0.28, 0.30, 0.22, 0.58, 0.40, 0.90, 0.62, cor);  // barbatana
  corpo.secao(-2.40, -1.55, 0.22, 0.10, 0.40, 0.30, 0.62, 0.40, escuro);

  // ── Halo ────────────────────────────────────────────────────────────────
  // Arco em titânio de 50 mm. É o item que mais identifica um F1 moderno,
  // visível de trás mesmo a distância.
  const passosHalo = 9;
  for (let i = 0; i < passosHalo; i++) {
    const a1 = (i / passosHalo) * Math.PI;
    const a2 = ((i + 1) / passosHalo) * Math.PI;
    const r = 0.34;
    const x1 = Math.cos(a1) * r, z1 = 0.42 + Math.sin(a1) * 0.30;
    const x2 = Math.cos(a2) * r, z2 = 0.42 + Math.sin(a2) * 0.30;
    const y1 = 0.70 + Math.sin(a1) * 0.10;
    const y2 = 0.70 + Math.sin(a2) * 0.10;
    corpo.face([
      [x1, y1, z1], [x2, y2, z2], [x2, y2 + 0.05, z2], [x1, y1 + 0.05, z1],
    ], carbono);
    corpo.face([
      [x1 - 0.025, y1, z1], [x1 + 0.025, y1, z1], [x2 + 0.025, y2, z2], [x2 - 0.025, y2, z2],
    ], carbonoClaro);
  }
  // pilar central inclinado para a frente
  corpo.secao(0.72, 0.90, 0.07, 0.07, 0.56, 0.72, 0.64, 0.80, carbono);

  // ── Asa traseira 2026: três elementos móveis, sem beam wing ─────────────
  for (const dx of [-0.20, 0.20]) corpo.secao(-2.72, -2.52, 0.05, 0.05, 0.36, 0.34, 0.82, 0.86, carbono, dx);
  corpo.placa(-2.86, -2.58, 0.95, 0.86, 0.88, 0.028, cor2);         // plano principal
  // placas de extremidade separadas (mudança de 2026)
  for (const dx of [-0.50, 0.50]) corpo.secao(-2.92, -2.50, 0.03, 0.03, 0.60, 0.58, 1.02, 1.00, carbono, dx);

  // ── Detalhes ────────────────────────────────────────────────────────────
  corpo.secao(-2.50, -2.36, 0.09, 0.09, 0.16, 0.16, 0.25, 0.25, new Color('#59606B')); // escapamento
  for (const lado of [-1, 1]) {
    corpo.secao(0.82, 0.96, 0.11, 0.11, 0.60, 0.60, 0.68, 0.68, carbono, lado * 0.34); // retrovisor
  }
  corpo.secao(0.14, 0.26, 0.07, 0.07, 0.92, 0.92, 0.99, 0.99, carbono); // câmera onboard

  /**
   * Pintura automotiva: metalness alta com verniz por cima. É o que dá o
   * reflexo nítido do céu (via environment map) e separa "carro pintado" de
   * "bloco colorido".
   */
  const meshCorpo = new Mesh(corpo.geometria(), new MeshPhysicalMaterial({
    vertexColors: true,
    metalness: 0.45,
    roughness: 0.34,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.15,
  }));
  meshCorpo.frustumCulled = false;

  // ── Flap ativo da asa traseira (abre em Straight Mode) ──────────────────
  const flapMalha = new Malha();
  flapMalha.placa(-0.13, 0.13, 0.93, -0.02, -0.01, 0.024, cor);
  flapMalha.placa(-0.13, 0.13, 0.91, 0.06, 0.07, 0.022, cor2);
  const flap = new Mesh(flapMalha.geometria(), new MeshPhysicalMaterial({
    vertexColors: true, metalness: 0.45, roughness: 0.34, clearcoat: 0.9,
  }));
  flap.position.set(0, 1.0, -2.74);
  flap.frustumCulled = false;

  // ── Rodas ───────────────────────────────────────────────────────────────
  const grupo = new Group();
  const rodas: Group[] = [];
  const posRodas: Array<[number, number, boolean]> = [
    [-BITOLA_DIANT / 2, ENTRE_EIXOS / 2, true],
    [BITOLA_DIANT / 2, ENTRE_EIXOS / 2, true],
    [-BITOLA_TRAS / 2, -ENTRE_EIXOS / 2, false],
    [BITOLA_TRAS / 2, -ENTRE_EIXOS / 2, false],
  ];
  for (const [x, z, diant] of posRodas) {
    const g = new Group();
    g.add(criarRoda(diant ? PNEU_D_DIANT : PNEU_D_TRAS, diant ? PNEU_L_DIANT : PNEU_L_TRAS, aro));
    g.position.set(x, (diant ? PNEU_D_DIANT : PNEU_D_TRAS) / 2, z);
    grupo.add(g);
    rodas.push(g);
  }

  // ── Sombra projetada ────────────────────────────────────────────────────
  // A própria malha do carro achatada no plano do chão. Custa um draw call e
  // devolve a SILHUETA correta — asa, pneus, difusor — no lugar do disco
  // genérico, que é um dos sinais mais óbvios de gráfico barato.
  const sombraMesh = new Mesh(corpo.geometria(), new MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false,
  }));
  sombraMesh.frustumCulled = false;
  sombraMesh.renderOrder = 3;

  const sombra = new Group();
  sombra.add(sombraMesh);
  // achata no chão e desloca na direção oposta ao sol
  sombra.scale.set(1.04, 0.001, 1.04);
  sombra.position.set(0.5, 0.018, -0.35);

  // mancha de contato sob os pneus, que a projeção achatada não cobre
  const contato = new Mesh(
    new CircleGeometry(1.45, 16),
    new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false, side: DoubleSide }),
  );
  contato.rotation.x = -Math.PI / 2;
  contato.position.y = 0.012;
  contato.scale.set(1, 1.95, 1);
  contato.renderOrder = 2;
  sombra.add(contato);

  const chassi = new Group();
  chassi.add(meshCorpo, flap);
  grupo.add(chassi, sombra);

  void numero;

  return {
    grupo,
    rodas,
    flap,
    definirModoAero(reta: boolean) {
      const alvo = reta ? -0.9 : 0;
      flap.rotation.x += (alvo - flap.rotation.x) * 0.16;
    },
    definirEsterco(rad: number) {
      rodas[0].rotation.y = rad;
      rodas[1].rotation.y = rad;
    },
    definirInclinacao(mergulho: number, rolagem: number) {
      chassi.rotation.x = mergulho;
      chassi.rotation.z = rolagem;
    },
  };
}
