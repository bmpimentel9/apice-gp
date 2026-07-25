/**
 * Carro de Fórmula 1 gerado por código — silhueta 2026 (nariz afilado, sidepods
 * côncavos, halo, asa traseira com flap ativo).
 *
 * Sem nenhum asset externo: a geometria inteira é montada aqui, com faces
 * independentes para dar sombreado facetado. Isso mantém o visual "vetorial
 * premium" e cabe em pouco mais de 200 triângulos por carro.
 *
 * Eixos locais: +Z é a frente, +X é a direita, +Y é para cima.
 */
import {
  BufferGeometry, Float32BufferAttribute, Mesh, Group, MeshLambertMaterial,
  Color, CircleGeometry, MeshBasicMaterial,
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

  /** Caixa com largura e altura independentes na frente e atrás (afilamento). */
  caixa(z0: number, z1: number, larg0: number, larg1: number, y0: number, y1: number, cor: Color, desloc = 0) {
    const a: V3 = [-larg0 / 2 + desloc, y0, z0], b: V3 = [larg0 / 2 + desloc, y0, z0];
    const c: V3 = [larg0 / 2 + desloc, y1, z0], d: V3 = [-larg0 / 2 + desloc, y1, z0];
    const e: V3 = [-larg1 / 2 + desloc, y0, z1], f: V3 = [larg1 / 2 + desloc, y0, z1];
    const g: V3 = [larg1 / 2 + desloc, y1, z1], h: V3 = [-larg1 / 2 + desloc, y1, z1];
    this.face([e, f, g, h], cor);          // frente
    this.face([b, a, d, c], cor);          // trás
    this.face([d, h, g, c], cor);          // topo
    this.face([a, b, f, e], cor);          // base
    this.face([a, e, h, d], cor);          // esquerda
    this.face([f, b, c, g], cor);          // direita
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
  /** Flap da asa traseira: abre em Straight Mode. */
  flap: Mesh;
  definirModoAero(reta: boolean): void;
  definirEsterco(rad: number): void;
  definirInclinacao(mergulho: number, rolagem: number): void;
}

const RAIO_RODA = 0.36;

function criarRoda(corPneu: Color, corAro: Color) {
  const m = new Malha();
  const lados = 10;
  const larg = 0.38;
  for (let i = 0; i < lados; i++) {
    const a1 = (i / lados) * Math.PI * 2;
    const a2 = ((i + 1) / lados) * Math.PI * 2;
    const y1 = Math.sin(a1) * RAIO_RODA, z1 = Math.cos(a1) * RAIO_RODA;
    const y2 = Math.sin(a2) * RAIO_RODA, z2 = Math.cos(a2) * RAIO_RODA;
    // banda de rodagem
    m.face([[-larg / 2, y1, z1], [larg / 2, y1, z1], [larg / 2, y2, z2], [-larg / 2, y2, z2]], corPneu);
    // laterais
    const r2 = RAIO_RODA * 0.55;
    m.face([[larg / 2, y1, z1], [larg / 2, y2, z2],
            [larg / 2, Math.sin(a2) * r2, Math.cos(a2) * r2], [larg / 2, Math.sin(a1) * r2, Math.cos(a1) * r2]], corAro);
    m.face([[-larg / 2, y2, z2], [-larg / 2, y1, z1],
            [-larg / 2, Math.sin(a1) * r2, Math.cos(a1) * r2], [-larg / 2, Math.sin(a2) * r2, Math.cos(a2) * r2]], corAro);
  }
  const mesh = new Mesh(m.geometria(), new MeshLambertMaterial({ vertexColors: true }));
  mesh.frustumCulled = false;
  return mesh;
}

export function criarCarro3D(equipe: Equipe, numero: number): Carro3D {
  const cor = new Color(equipe.cor);
  const cor2 = new Color(equipe.corSecundaria);
  const escuro = new Color(equipe.cor).multiplyScalar(0.45);
  const preto = new Color('#141518');
  const aro = new Color('#2A2C31');

  const corpo = new Malha();

  // ── Assoalho e monocoque ────────────────────────────────────────────────
  corpo.caixa(-2.5, -0.4, 1.05, 1.15, 0.06, 0.30, escuro);       // assoalho traseiro
  corpo.caixa(-0.4, 1.0, 1.1, 0.78, 0.06, 0.46, cor);            // seção central
  corpo.caixa(1.0, 1.85, 0.72, 0.40, 0.10, 0.40, cor);           // afilamento do nariz
  corpo.caixa(1.85, 2.45, 0.38, 0.26, 0.13, 0.32, cor2);         // ponta do nariz

  // ── Sidepods, com a curva côncava característica de 2026 ────────────────
  for (const lado of [-1, 1]) {
    corpo.caixa(-1.5, 0.55, 0.52, 0.62, 0.10, 0.52, cor, lado * 0.66);
    corpo.caixa(-2.2, -1.5, 0.42, 0.52, 0.10, 0.40, escuro, lado * 0.6);
  }

  // ── Cockpit e airbox ────────────────────────────────────────────────────
  corpo.caixa(-0.35, 0.62, 0.56, 0.50, 0.46, 0.66, preto);        // abertura
  corpo.caixa(-1.5, -0.35, 0.54, 0.62, 0.30, 0.92, cor);          // airbox / capô do motor
  corpo.caixa(-2.4, -1.5, 0.5, 0.34, 0.30, 0.62, escuro);         // tampa traseira

  // ── Halo ────────────────────────────────────────────────────────────────
  const halo = new Color('#1C1E22');
  corpo.caixa(0.55, 0.72, 0.70, 0.70, 0.62, 0.70, halo);                    // arco frontal
  for (const lado of [-1, 1]) {
    corpo.caixa(-0.36, 0.66, 0.07, 0.07, 0.52, 0.68, halo, lado * 0.33);    // laterais
  }
  corpo.caixa(0.66, 0.80, 0.10, 0.10, 0.48, 0.68, halo);                    // pilar central

  // ── Asa dianteira ───────────────────────────────────────────────────────
  corpo.caixa(2.15, 2.62, 1.9, 1.9, 0.055, 0.10, cor2);                     // plano principal
  corpo.caixa(2.05, 2.30, 1.9, 1.9, 0.10, 0.16, cor);                       // segundo elemento
  for (const lado of [-1, 1]) {
    corpo.caixa(2.05, 2.66, 0.06, 0.06, 0.06, 0.34, cor2, lado * 0.92);     // placas de extremidade
  }

  // ── Suportes da asa traseira ────────────────────────────────────────────
  for (const lado of [-1, 1]) {
    corpo.caixa(-2.5, -2.28, 0.08, 0.08, 0.30, 0.86, escuro, lado * 0.34);
  }
  corpo.caixa(-2.55, -2.25, 1.4, 1.4, 0.86, 0.94, cor2);                    // plano fixo

  const meshCorpo = new Mesh(corpo.geometria(), new MeshLambertMaterial({ vertexColors: true }));
  meshCorpo.frustumCulled = false;

  // ── Flap ativo da asa traseira (anima em Straight Mode) ─────────────────
  const flapMalha = new Malha();
  flapMalha.caixa(-0.14, 0.14, 1.34, 1.34, -0.035, 0.035, cor);
  const flap = new Mesh(flapMalha.geometria(), new MeshLambertMaterial({ vertexColors: true }));
  flap.position.set(0, 1.03, -2.42);
  flap.frustumCulled = false;

  // ── Rodas ───────────────────────────────────────────────────────────────
  const grupo = new Group();
  const rodas: Group[] = [];
  const posRodas: Array<[number, number, boolean]> = [
    [-0.86, 1.7, true], [0.86, 1.7, true],    // dianteiras
    [-0.9, -1.7, false], [0.9, -1.7, false],  // traseiras
  ];
  for (const [x, z, diant] of posRodas) {
    const g = new Group();
    const r = criarRoda(preto, aro);
    if (!diant) r.scale.set(1.18, 1.06, 1.06);
    g.add(r);
    g.position.set(x, RAIO_RODA * (diant ? 1 : 1.06), z);
    grupo.add(g);
    rodas.push(g);
  }

  // ── Sombra de contato: um disco escuro, mais barato que sombra real ─────
  const sombra = new Mesh(
    new CircleGeometry(1.6, 14),
    new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false }),
  );
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.y = 0.02;
  sombra.scale.set(1, 1.85, 1);
  sombra.renderOrder = 3;

  const chassi = new Group();
  chassi.add(meshCorpo, flap);
  grupo.add(chassi, sombra);

  void numero;

  let flapAlvo = 0;
  return {
    grupo,
    rodas,
    flap,
    definirModoAero(reta: boolean) {
      flapAlvo = reta ? 1 : 0;
      // rotação do flap: fechado em curva, aberto em reta
      flap.rotation.x += (flapAlvo * -0.85 - flap.rotation.x) * 0.18;
    },
    definirEsterco(rad: number) {
      rodas[0].rotation.y = rad;
      rodas[1].rotation.y = rad;
    },
    definirInclinacao(mergulho: number, rolagem: number) {
      // squat e dive: vende o peso do carro sem simular suspensão
      chassi.rotation.x = mergulho;
      chassi.rotation.z = rolagem;
    },
  };
}
