/**
 * Carro de Fórmula 1 2026, gerado inteiramente por código.
 *
 * Dimensões do regulamento 2026: entre-eixos 3,40 m, largura 1,90 m, pneu
 * dianteiro 705×280 mm e traseiro 710×375 mm, aro de 18".
 *
 * A construção é por **lofting de seções em gota** com vértices soldados, e não
 * por caixas empilhadas. A diferença é grande: um F1 não tem seção transversal
 * retangular em lugar nenhum, e faces com vértices próprios impedem qualquer
 * suavização de sombreado — mesmo pedindo suave, tudo saía facetado. Aqui a
 * carroceria é uma casca contínua e suave; asas, placas e strakes ficam
 * facetados de propósito, porque são chapa fina, não superfície esculpida.
 *
 * A ordem de detalhe segue o que se enxerga numa câmera de perseguição: pneus
 * traseiros, asa traseira, difusor, halo, airbox.
 *
 * Eixos locais: +Z é a frente, +X é a direita, +Y é para cima. Origem no centro
 * do entre-eixos, no plano do chão.
 */
import {
  Mesh, Group, MeshPhysicalMaterial, MeshLambertMaterial, Color,
  CircleGeometry, MeshBasicMaterial, DoubleSide, BufferGeometry,
  Float32BufferAttribute,
} from 'three';
import type { Equipe } from '../data/teams';
import { MalhaLoft, contornoGota, contornoChato, type V3 } from './loft';

export interface Carro3D {
  grupo: Group;
  rodas: Group[];
  flap: Mesh;
  definirModoAero(reta: boolean): void;
  definirEsterco(rad: number): void;
  definirInclinacao(mergulho: number, rolagem: number): void;
}

// Regulamento 2026
const PNEU_D_DIANT = 0.705;
const PNEU_L_DIANT = 0.28;
const PNEU_D_TRAS = 0.71;
const PNEU_L_TRAS = 0.375;
const ENTRE_EIXOS = 3.4;
const BITOLA_DIANT = 1.56;
const BITOLA_TRAS = 1.5;

/**
 * Pneu com cinco anéis de largura: flanco, ombro, banda, ombro, flanco.
 *
 * Um cilindro de raio único parece cano — o ombro arredondado e o leve bojo na
 * banda de rodagem são o que fazem ler como borracha. O achatamento nos graus
 * inferiores simula a deformação de carga sem física nenhuma.
 */
function criarRoda(diametro: number, largura: number, corAro: Color, fantasma = false) {
  const m = new MalhaLoft();
  const lados = 22;
  const r = diametro / 2;
  const rAro = r * 0.64;
  const meia = largura / 2;
  const pneu = new Color('#1A1B1F');
  const pneuOmbro = new Color('#141518');

  const perfis: Array<[number, number, Color]> = [
    [-meia, 0.962, pneuOmbro],
    [-meia * 0.7, 1.0, pneuOmbro],
    [0, 1.03, pneu],
    [meia * 0.7, 1.0, pneuOmbro],
    [meia, 0.962, pneuOmbro],
  ];

  const aneis: number[][] = [];
  for (const [z, fator, c] of perfis) {
    const contorno: V3[] = [];
    for (let i = 0; i < lados; i++) {
      const a = (i / lados) * Math.PI * 2;
      const x = Math.cos(a) * r * fator;
      let y = Math.sin(a) * r * fator;
      // achatamento de contato com o solo
      const piso = -r * 0.982;
      if (y < piso) y = piso + (y - piso) * 0.28;
      contorno.push([x, y, 0]);
    }
    aneis.push(m.anel(contorno, z, c));
  }
  for (let i = 0; i < aneis.length - 1; i++) m.costurar(aneis[i], aneis[i + 1]);

  const aroContorno: V3[] = [];
  for (let i = 0; i < lados; i++) {
    const a = (i / lados) * Math.PI * 2;
    aroContorno.push([Math.cos(a) * rAro, Math.sin(a) * rAro, 0]);
  }
  for (const lado of [-1, 1]) {
    const flanco = m.anel(aroContorno, lado * meia * 0.97, corAro);
    m.costurar(aneis[lado > 0 ? 4 : 0], flanco);
    const centro = m.anel(
      aroContorno.map(([x, y]) => [x * 0.22, y * 0.22, 0] as V3),
      lado * meia * 0.88, corAro.clone().multiplyScalar(0.62),
    );
    m.costurar(flanco, centro);
    m.tampar(centro, lado < 0);
  }

  const mesh = new Mesh(m.geometria(true), fantasma
    ? new MeshBasicMaterial({ color: 0xc0b0e8, transparent: true, opacity: 0.22, depthWrite: false })
    : new MeshLambertMaterial({ vertexColors: true }));
  mesh.frustumCulled = false;
  return mesh;
}

/** Tubo de seção poligonal seguindo um caminho — usado no halo. */
function tuboArco(m: MalhaLoft, pontos: V3[], raio: number, cor: Color, lados = 6) {
  const aneis: number[][] = [];
  for (let k = 0; k < pontos.length; k++) {
    const p = pontos[k];
    const prox = pontos[Math.min(k + 1, pontos.length - 1)];
    const ant = pontos[Math.max(k - 1, 0)];
    let ux = prox[0] - ant[0], uy = prox[1] - ant[1], uz = prox[2] - ant[2];
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;

    // dois vetores perpendiculares à tangente, estáveis
    let ax = 0, ay = 1, az = 0;
    if (Math.abs(uy) > 0.92) { ax = 1; ay = 0; az = 0; }
    let n1x = uy * az - uz * ay;
    let n1y = uz * ax - ux * az;
    let n1z = ux * ay - uy * ax;
    const n1l = Math.hypot(n1x, n1y, n1z) || 1;
    n1x /= n1l; n1y /= n1l; n1z /= n1l;
    const n2x = uy * n1z - uz * n1y;
    const n2y = uz * n1x - ux * n1z;
    const n2z = ux * n1y - uy * n1x;

    const base = m.pos.length / 3;
    const ids: number[] = [];
    for (let i = 0; i < lados; i++) {
      const a = (i / lados) * Math.PI * 2;
      const c = Math.cos(a) * raio, s = Math.sin(a) * raio;
      m.pos.push(p[0] + n1x * c + n2x * s, p[1] + n1y * c + n2y * s, p[2] + n1z * c + n2z * s);
      m.cor.push(cor.r, cor.g, cor.b);
      ids.push(base + i);
    }
    aneis.push(ids);
  }
  for (let i = 0; i < aneis.length - 1; i++) m.costurar(aneis[i], aneis[i + 1]);
}

export function criarCarro3D(equipe: Equipe, numero: number, fantasma = false): Carro3D {
  const cor = new Color(equipe.cor);
  const cor2 = new Color(equipe.corSecundaria);
  const escuro = cor.clone().multiplyScalar(0.4);
  const carbono = new Color('#1A1C20');
  const carbonoClaro = new Color('#282B31');
  const aro = new Color('#3C3F46');

  // ── Carroceria: casca contínua, sombreamento suave ────────────────────────
  const casca = new MalhaLoft();

  // Corpo principal. A cintura estreitando depois do cockpit e o undercut
  // crescente dão a silhueta de "vespa", que é o que mais muda a leitura
  // lateral do carro por polígono gasto.
  const corpo: Array<[number, number, number, number, number, number, Color]> = [
    // z, largura, yBase, yTopo, achatamento, undercut, cor
    [2.90, 0.12, 0.17, 0.23, 0.15, 0, cor2],
    [2.62, 0.22, 0.18, 0.29, 0.2, 0, cor2],
    [2.20, 0.33, 0.19, 0.37, 0.25, 0, cor],
    [1.72, 0.44, 0.19, 0.45, 0.3, 0, cor],
    [1.20, 0.58, 0.17, 0.51, 0.35, 0.05, cor],
    [0.62, 0.67, 0.15, 0.57, 0.4, 0.1, cor],
    [0.06, 0.68, 0.14, 0.6, 0.45, 0.18, cor],
    [-0.46, 0.58, 0.13, 0.6, 0.5, 0.34, cor],
    [-1.02, 0.45, 0.12, 0.56, 0.55, 0.46, cor],
    [-1.62, 0.35, 0.12, 0.49, 0.6, 0.42, cor],
    [-2.14, 0.26, 0.11, 0.4, 0.65, 0.34, escuro],
    [-2.4, 0.19, 0.11, 0.33, 0.7, 0.28, escuro],
  ];
  casca.solido(corpo.map(([z, l, b, t, a, u, c]) => ({
    z, contorno: contornoGota(l, b, t, a, u, 14), cor: c,
  })));

  // Airbox e cobertura do motor
  casca.solido([
    { z: 0.2, contorno: contornoGota(0.32, 0.6, 0.94, 0.3, 0, 12), cor },
    { z: -0.2, contorno: contornoGota(0.31, 0.58, 0.93, 0.35, 0, 12), cor },
    { z: -0.9, contorno: contornoGota(0.26, 0.48, 0.8, 0.5, 0, 12), cor },
    { z: -1.6, contorno: contornoGota(0.2, 0.4, 0.63, 0.6, 0, 12), cor },
    { z: -2.3, contorno: contornoGota(0.13, 0.32, 0.45, 0.7, 0, 12), cor: escuro },
  ]);

  // Sidepods: entrada alta e estreita com undercut acentuado (padrão 2026)
  for (const lado of [-1, 1]) {
    casca.solido([
      { z: 0.92, contorno: contornoGota(0.26, 0.28, 0.5, 0.3, 0.15, 12), cor: cor2, dx: lado * 0.58 },
      { z: 0.56, contorno: contornoGota(0.42, 0.2, 0.54, 0.35, 0.35, 12), cor, dx: lado * 0.6 },
      { z: -0.1, contorno: contornoGota(0.5, 0.16, 0.5, 0.45, 0.5, 12), cor, dx: lado * 0.58 },
      { z: -0.8, contorno: contornoGota(0.42, 0.14, 0.4, 0.55, 0.5, 12), cor, dx: lado * 0.54 },
      { z: -1.4, contorno: contornoGota(0.28, 0.13, 0.3, 0.6, 0.4, 12), cor: escuro, dx: lado * 0.48 },
    ]);
  }

  const materialPintura = () => fantasma
    ? new MeshBasicMaterial({
        color: 0xd8c8ff, transparent: true, opacity: 0.3,
        depthWrite: false, side: DoubleSide,
      })
    : new MeshPhysicalMaterial({
        vertexColors: true, metalness: 0.42, roughness: 0.33,
        clearcoat: 0.9, clearcoatRoughness: 0.12, envMapIntensity: 1.15,
      });

  const meshCasca = new Mesh(casca.geometria(true), materialPintura());
  meshCasca.frustumCulled = false;

  // ── Peças de chapa: aresta viva de propósito ──────────────────────────────
  const chapa = new MalhaLoft();

  // Assoalho
  chapa.solido([
    { z: 1.05, contorno: contornoChato(1.42, 0.03, 0.1), cor: carbono },
    { z: -0.4, contorno: contornoChato(1.55, 0.026, 0.11), cor: carbono },
    { z: -2.05, contorno: contornoChato(1.5, 0.026, 0.12), cor: carbono },
  ]);

  // Difusor com rampa CURVA. É o maior elemento visível de trás, e um plano
  // inclinado reto no lugar dele denuncia geometria preguiçosa na hora.
  const rampa: Array<[number, number, number, number]> = [
    [-2.05, 1.44, 0.026, 0.1],
    [-2.34, 1.34, 0.038, 0.15],
    [-2.58, 1.2, 0.062, 0.22],
    [-2.76, 1.08, 0.092, 0.28],
    [-2.9, 1.0, 0.125, 0.32],
  ];
  chapa.solido(rampa.map(([z, l, b, t]) => ({
    z, contorno: contornoChato(l, b, t, 0.015), cor: carbonoClaro,
  })));
  for (const dx of [-0.32, 0.32]) {
    chapa.solido(rampa.map(([z, , b, t]) => ({
      z, contorno: contornoChato(0.03, b, t + 0.01, 0.005), cor: carbono, dx,
    })));
  }
  for (const dx of [-0.53, 0.53]) {
    chapa.solido(rampa.map(([z, , b, t]) => ({
      z, contorno: contornoChato(0.035, b - 0.01, t + 0.04, 0.005), cor: carbono, dx,
    })));
  }

  // Asa dianteira: três elementos com bordo chanfrado
  const asaD: Array<[number, number, number, number, Color]> = [
    [2.66, 3.02, 0.05, 0.075, cor2],
    [2.58, 2.86, 0.095, 0.12, cor],
    [2.52, 2.74, 0.14, 0.163, cor2],
  ];
  for (const [z0, z1, y0, y1, c] of asaD) {
    chapa.solido([
      { z: z0, contorno: contornoChato(1.6, y0, y1, 0.008), cor: c },
      { z: z1, contorno: contornoChato(1.6, y0 - 0.012, y1 - 0.012, 0.008), cor: c },
    ]);
  }
  // placas de extremidade encurvadas
  for (const lado of [-1, 1]) {
    chapa.solido([
      { z: 2.5, contorno: contornoChato(0.03, 0.04, 0.26, 0.006), cor: carbono, dx: lado * 0.795 },
      { z: 2.78, contorno: contornoChato(0.03, 0.04, 0.3, 0.006), cor: carbono, dx: lado * 0.815 },
      { z: 3.04, contorno: contornoChato(0.03, 0.05, 0.24, 0.006), cor: carbono, dx: lado * 0.8 },
    ]);
  }
  for (const lado of [-1, 1]) {
    chapa.solido([
      { z: 2.52, contorno: contornoChato(0.045, 0.09, 0.19, 0.008), cor: carbono, dx: lado * 0.15 },
      { z: 2.86, contorno: contornoChato(0.045, 0.075, 0.16, 0.008), cor: carbono, dx: lado * 0.15 },
    ]);
  }

  // Asa traseira: plano principal e placas separadas (mudança de 2026)
  chapa.solido([
    { z: -2.58, contorno: contornoChato(0.95, 0.855, 0.885, 0.01), cor: cor2 },
    { z: -2.88, contorno: contornoChato(0.95, 0.845, 0.875, 0.01), cor: cor2 },
  ]);
  for (const lado of [-1, 1]) {
    chapa.solido([
      { z: -2.5, contorno: contornoChato(0.028, 0.58, 1.0, 0.006), cor: carbono, dx: lado * 0.495 },
      { z: -2.94, contorno: contornoChato(0.028, 0.56, 1.02, 0.006), cor: carbono, dx: lado * 0.495 },
    ]);
    chapa.solido([
      { z: -2.72, contorno: contornoChato(0.05, 0.34, 0.85, 0.008), cor: carbono, dx: lado * 0.2 },
      { z: -2.52, contorno: contornoChato(0.05, 0.36, 0.85, 0.008), cor: carbono, dx: lado * 0.2 },
    ]);
  }

  // Halo em TUBO. Como fita plana lia como adesivo; como tubo vira o ícone
  // reconhecível que é — e é visível de trás mesmo a distância.
  const arco: V3[] = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI;
    arco.push([Math.cos(a) * 0.34, 0.68 + Math.sin(a) * 0.115, 0.42 + Math.sin(a) * 0.3]);
  }
  tuboArco(chapa, arco, 0.028, carbono, 6);
  tuboArco(chapa, [[0, 0.56, 0.8], [0, 0.66, 0.755], [0, 0.755, 0.715]], 0.032, carbono, 6);

  // Defletores, retrovisores, escapamento, luz de chuva e câmera onboard
  for (const lado of [-1, 1]) {
    chapa.solido([
      { z: 1.02, contorno: contornoChato(0.03, 0.12, 0.32, 0.006), cor: carbono, dx: lado * 0.6 },
      { z: 1.46, contorno: contornoChato(0.03, 0.13, 0.27, 0.006), cor: carbono, dx: lado * 0.64 },
    ]);
    chapa.solido([
      { z: 0.8, contorno: contornoChato(0.1, 0.6, 0.68, 0.01), cor: carbono, dx: lado * 0.34 },
      { z: 0.96, contorno: contornoChato(0.11, 0.605, 0.685, 0.01), cor: carbono, dx: lado * 0.36 },
    ]);
  }
  chapa.solido([
    { z: -2.44, contorno: contornoChato(0.085, 0.155, 0.24, 0.02), cor: new Color('#6B7078') },
    { z: -2.32, contorno: contornoChato(0.075, 0.16, 0.235, 0.02), cor: new Color('#4A4F57') },
  ]);
  chapa.solido([
    { z: -2.46, contorno: contornoChato(0.05, 0.72, 0.77, 0.01), cor: new Color('#B3221C') },
    { z: -2.52, contorno: contornoChato(0.05, 0.72, 0.77, 0.01), cor: new Color('#B3221C') },
  ]);
  chapa.solido([
    { z: 0.12, contorno: contornoChato(0.07, 0.93, 0.99, 0.01), cor: carbono },
    { z: 0.26, contorno: contornoChato(0.07, 0.93, 0.99, 0.01), cor: carbono },
  ]);

  const meshChapa = new Mesh(chapa.geometria(false), fantasma
    ? new MeshBasicMaterial({
        color: 0xd8c8ff, transparent: true, opacity: 0.28,
        depthWrite: false, side: DoubleSide,
      })
    : new MeshPhysicalMaterial({
        vertexColors: true, metalness: 0.3, roughness: 0.45,
        clearcoat: 0.5, envMapIntensity: 0.9, side: DoubleSide,
      }));
  meshChapa.frustumCulled = false;

  // ── Flap ativo da asa traseira ────────────────────────────────────────────
  const flapM = new MalhaLoft();
  flapM.solido([
    { z: -0.13, contorno: contornoChato(0.93, -0.012, 0.014, 0.008), cor },
    { z: 0.13, contorno: contornoChato(0.93, -0.014, 0.012, 0.008), cor },
  ]);
  const flap = new Mesh(flapM.geometria(false), fantasma
    ? new MeshBasicMaterial({ color: 0xd8c8ff, transparent: true, opacity: 0.28, depthWrite: false })
    : new MeshPhysicalMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.4, clearcoat: 0.6 }));
  flap.position.set(0, 0.985, -2.73);
  flap.frustumCulled = false;

  // ── Rodas ─────────────────────────────────────────────────────────────────
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
    g.add(criarRoda(diant ? PNEU_D_DIANT : PNEU_D_TRAS, diant ? PNEU_L_DIANT : PNEU_L_TRAS, aro, fantasma));
    g.position.set(x, (diant ? PNEU_D_DIANT : PNEU_D_TRAS) / 2, z);
    grupo.add(g);
    rodas.push(g);
  }

  // ── Sombra ────────────────────────────────────────────────────────────────
  const sombra = new Group();
  if (!fantasma) {
    // a própria casca achatada no chão: devolve a silhueta correta por um
    // único draw call, em vez de um disco genérico
    const geoSombra = new BufferGeometry();
    geoSombra.setAttribute('position', new Float32BufferAttribute(casca.pos.slice(), 3));
    geoSombra.setIndex(casca.idx.slice());
    const sombraMesh = new Mesh(geoSombra, new MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false,
    }));
    sombraMesh.frustumCulled = false;
    sombraMesh.renderOrder = 3;
    sombra.add(sombraMesh);
    sombra.scale.set(1.05, 0.001, 1.05);
    sombra.position.set(0.5, 0.018, -0.35);

    const contato = new Mesh(
      new CircleGeometry(1.5, 18),
      new MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.22,
        depthWrite: false, side: DoubleSide,
      }),
    );
    contato.rotation.x = -Math.PI / 2;
    contato.position.set(-0.48, 12, 0.33);
    contato.scale.set(1, 1.9, 1000);
    contato.renderOrder = 2;
    sombra.add(contato);
  }

  const chassi = new Group();
  chassi.add(meshCasca, meshChapa, flap);
  if (fantasma) { meshCasca.renderOrder = 6; meshChapa.renderOrder = 6; }
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
