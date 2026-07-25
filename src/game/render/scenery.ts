/**
 * Cenário procedural: arquibancadas, árvores, prédios, postes, muros de pneu,
 * bandeiras e placas de frenagem.
 *
 * É o que faltava para o jogo parar de parecer uma fita de asfalto no vazio.
 * Objeto lateral é o que dá **escala** — sem nada por perto, 300 km/h e 100 km/h
 * têm exatamente a mesma aparência, porque não há referência para o olho medir
 * o movimento.
 *
 * Tudo em `InstancedMesh`, uma chamada por tipo: o cenário inteiro custa menos
 * de dez draw calls, mesmo com centenas de objetos.
 */
import {
  BufferGeometry, Float32BufferAttribute, InstancedMesh, Group, Object3D,
  MeshLambertMaterial, Color, DoubleSide, MeshBasicMaterial,
} from 'three';
import type { Pista } from '../sim/track';
import { AMBIENTES, CORES, ruido, type HoraDoDia } from './palette';

type V3 = [number, number, number];

class Construtor {
  pos: number[] = [];
  cor: number[] = [];
  idx: number[] = [];

  face(vs: V3[], c: Color) {
    const base = this.pos.length / 3;
    for (const v of vs) { this.pos.push(v[0], v[1], v[2]); this.cor.push(c.r, c.g, c.b); }
    for (let i = 1; i < vs.length - 1; i++) this.idx.push(base, base + i, base + i + 1);
  }

  caixa(lx: number, ly: number, lz: number, c: Color, oy = 0, escalaTopo = 1) {
    const x = lx / 2, z = lz / 2, xt = x * escalaTopo, zt = z * escalaTopo;
    const a: V3 = [-x, oy, -z], b: V3 = [x, oy, -z], cc: V3 = [x, oy, z], d: V3 = [-x, oy, z];
    const e: V3 = [-xt, oy + ly, -zt], f: V3 = [xt, oy + ly, -zt];
    const g: V3 = [xt, oy + ly, zt], h: V3 = [-xt, oy + ly, zt];
    const escura = c.clone().multiplyScalar(0.72);
    const clara = c.clone().multiplyScalar(1.12);
    this.face([e, f, g, h], clara);
    this.face([a, d, cc, b], escura);
    this.face([a, b, f, e], c);
    this.face([cc, d, h, g], escura);
    this.face([b, cc, g, f], c);
    this.face([d, a, e, h], escura);
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

// ── Geometrias base ─────────────────────────────────────────────────────────

function geoArvore(amb: number) {
  const c = new Construtor();
  const tronco = new Color('#4A3524').multiplyScalar(amb);
  const copaA = new Color('#2C6B39').multiplyScalar(amb);
  const copaB = new Color('#357C42').multiplyScalar(amb);
  c.caixa(0.5, 2.2, 0.5, tronco, 0);
  c.caixa(3.4, 3.0, 3.4, copaA, 2.0, 0.55);
  c.caixa(2.4, 2.4, 2.4, copaB, 4.4, 0.3);
  return c.geometria();
}

function geoArquibancada(amb: number) {
  const c = new Construtor();
  const estrutura = new Color('#5A6068').multiplyScalar(amb);
  const teto = new Color('#3A4048').multiplyScalar(amb);
  // degraus, que sugerem público sem custar nada
  for (let i = 0; i < 5; i++) {
    const cor = new Color(i % 2 === 0 ? '#6E757E' : '#565C64').multiplyScalar(amb);
    c.caixa(22, 1.5, 3.2 - i * 0.1, cor, i * 1.4, 1);
    // "público": faixa colorida sobre cada degrau
    const publico = new Color(i % 3 === 0 ? '#B9C4CF' : i % 3 === 1 ? '#8FA0B4' : '#A5B0BE').multiplyScalar(amb * 0.94);
    c.caixa(21, 0.55, 2.1, publico, i * 1.4 + 1.5, 1);
  }
  c.caixa(24, 0.6, 12, teto, 8.2, 1);
  c.caixa(1, 8.4, 1, estrutura, 0, 1);
  return c.geometria();
}

function geoPredio(amb: number) {
  const c = new Construtor();
  const corpo = new Color('#4C5361').multiplyScalar(amb);
  c.caixa(14, 26, 14, corpo, 0, 0.94);
  // faixas de janelas
  for (let i = 1; i < 7; i++) {
    const jan = new Color('#8FA6C4').multiplyScalar(amb * 1.06);
    c.caixa(14.3, 1.5, 14.3, jan, i * 3.6, 0.94);
  }
  return c.geometria();
}

function geoPoste(amb: number, aceso: boolean) {
  const c = new Construtor();
  const metal = new Color('#7C838C').multiplyScalar(amb);
  c.caixa(0.42, 11, 0.42, metal, 0);
  c.caixa(2.6, 0.5, 0.9, metal, 10.6, 1);
  const lampada = aceso ? new Color('#FFF3D0') : new Color('#3A4048').multiplyScalar(amb);
  c.caixa(2.2, 0.36, 0.7, lampada, 10.3, 1);
  return c.geometria();
}

function geoMuroPneus(amb: number) {
  const c = new Construtor();
  for (let i = 0; i < 4; i++) {
    const cor = new Color(i % 2 === 0 ? '#1A1B1E' : '#E8E8E4').multiplyScalar(amb);
    c.caixa(3.6, 0.7, 1.5, cor, i * 0.68, 1);
  }
  return c.geometria();
}

/** Placa de distância de frenagem: um poste com o número. */
function geoPlaca(amb: number, nivel: number) {
  const c = new Construtor();
  const poste = new Color('#5A6068').multiplyScalar(amb);
  c.caixa(0.16, 1.6, 0.16, poste, 0);
  const fundo = new Color(nivel === 0 ? '#E2241B' : nivel === 1 ? '#F5C518' : '#F3F1E7');
  c.caixa(1.5, 1.1, 0.14, fundo, 1.4, 1);
  // barras que indicam a contagem, legíveis mesmo pequenas
  for (let i = 0; i <= nivel; i++) {
    const barra = new Color('#14161B');
    c.caixa(0.2, 0.72, 0.2, barra, 1.6, 1);
    c.pos.splice(c.pos.length - 72);
    c.cor.splice(c.cor.length - 72);
    c.idx.splice(c.idx.length - 36);
    // desenha a barra deslocada no eixo X
    const desloc = -0.42 + i * 0.4;
    const antes = c.pos.length / 3;
    c.caixa(0.18, 0.72, 0.22, barra, 1.6, 1);
    for (let k = antes; k < c.pos.length / 3; k++) c.pos[k * 3] += desloc;
  }
  return c.geometria();
}

interface Instancia { x: number; y: number; z: number; rot: number; escala: number; }

function montarInstancias(geo: BufferGeometry, lista: Instancia[], mat: MeshLambertMaterial | MeshBasicMaterial) {
  if (lista.length === 0) return null;
  const mesh = new InstancedMesh(geo, mat, lista.length);
  const dummy = new Object3D();
  lista.forEach((it, i) => {
    dummy.position.set(it.x, it.y, it.z);
    dummy.rotation.set(0, it.rot, 0);
    dummy.scale.setScalar(it.escala);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

export function gerarCenario(pista: Pista, hora: HoraDoDia): Group {
  const amb = AMBIENTES[hora];
  const luzAmbiente = 0.55 + amb.luz * 0.45;
  const urbano = pista.dados.id === 'principado' || pista.dados.id === 'corniche';
  const noite = hora === 'noite';

  const arvores: Instancia[] = [];
  const arquibancadas: Instancia[] = [];
  const predios: Instancia[] = [];
  const postes: Instancia[] = [];
  const pneus: Instancia[] = [];
  const placas: Array<Instancia & { nivel: number }> = [];

  const meia = pista.largura / 2;
  const n = pista.n;

  // ── Objetos ao longo do traçado ──────────────────────────────────────────
  for (let i = 0; i < n; i += 3) {
    const s = pista.s[i];
    const r1 = ruido(i * 1.7);
    const r2 = ruido(i * 3.1 + 40);
    const curva = Math.abs(pista.curvatura[i]) > 1 / 160;

    for (const lado of [-1, 1]) {
      const rl = ruido(i * 5.3 + (lado > 0 ? 11 : 77));
      const base = meia + (urbano ? 6 : 20);
      const dist = base + rl * (urbano ? 10 : 34);
      const x = pista.px[i] + pista.nx[i] * lado * dist;
      const z = pista.pz[i] + pista.nz[i] * lado * dist;
      const y = pista.py[i] - 1.2;
      const rot = rl * Math.PI * 2;

      if (urbano) {
        // cidade dos dois lados, com alturas variadas
        if (r1 > 0.42) predios.push({ x, y, z, rot, escala: 0.55 + rl * 1.5 });
      } else {
        // arquibancada nas retas, árvores no resto
        if (!curva && r1 > 0.86) {
          arquibancadas.push({
            x: pista.px[i] + pista.nx[i] * lado * (meia + 17),
            y, z: pista.pz[i] + pista.nz[i] * lado * (meia + 17),
            rot: Math.atan2(pista.tx[i], pista.tz[i]) + (lado > 0 ? 0 : Math.PI),
            escala: 0.85 + rl * 0.4,
          });
        } else if (r2 > 0.34) {
          arvores.push({ x, y, z, rot, escala: 0.7 + rl * 0.9 });
        }
      }

      // muro de pneus na parte externa das curvas fortes
      if (curva && Math.sign(pista.curvatura[i]) !== lado && r1 > 0.5) {
        pneus.push({
          x: pista.px[i] + pista.nx[i] * lado * (meia + (urbano ? 3.6 : 6.5)),
          y: pista.py[i] - 0.1,
          z: pista.pz[i] + pista.nz[i] * lado * (meia + (urbano ? 3.6 : 6.5)),
          rot: Math.atan2(pista.tx[i], pista.tz[i]),
          escala: 1,
        });
      }

      // postes de luz — indispensáveis no circuito noturno
      if ((noite && i % 12 === 0) || (!noite && urbano && i % 30 === 0)) {
        postes.push({
          x: pista.px[i] + pista.nx[i] * lado * (meia + 3.4),
          y: pista.py[i],
          z: pista.pz[i] + pista.nz[i] * lado * (meia + 3.4),
          rot: Math.atan2(pista.tx[i], pista.tz[i]) + (lado > 0 ? Math.PI / 2 : -Math.PI / 2),
          escala: 1,
        });
      }
    }
    void s;
  }

  // ── Placas de frenagem antes das curvas fortes ───────────────────────────
  // São referência visual de verdade: o jogador aprende "freio na placa 2".
  const passo = pista.comprimento / n;
  for (let i = 0; i < n; i++) {
    const forte = Math.abs(pista.curvatura[i]) > 1 / 95;
    const anterior = Math.abs(pista.curvatura[(i - 1 + n) % n]) > 1 / 95;
    if (!forte || anterior) continue; // só na entrada da curva
    for (const [nivel, metros] of [[0, 50], [1, 100], [2, 150]] as const) {
      const j = (i - Math.round(metros / passo) + n * 2) % n;
      // do lado de fora da curva, onde o piloto olha
      const lado = pista.curvatura[i] > 0 ? -1 : 1;
      placas.push({
        x: pista.px[j] + pista.nx[j] * lado * (meia + 2.4),
        y: pista.py[j],
        z: pista.pz[j] + pista.nz[j] * lado * (meia + 2.4),
        rot: Math.atan2(pista.tx[j], pista.tz[j]) + Math.PI / 2,
        escala: 1.5,
        nivel,
      });
    }
  }

  const matLambert = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  const grupo = new Group();

  const adicionar = (geo: BufferGeometry, lista: Instancia[]) => {
    const m = montarInstancias(geo, lista, matLambert);
    if (m) grupo.add(m);
  };

  if (arvores.length) adicionar(geoArvore(luzAmbiente), arvores);
  if (arquibancadas.length) adicionar(geoArquibancada(luzAmbiente), arquibancadas);
  if (predios.length) adicionar(geoPredio(luzAmbiente), predios);
  if (pneus.length) adicionar(geoMuroPneus(luzAmbiente), pneus);
  if (postes.length) {
    const m = montarInstancias(geoPoste(luzAmbiente, noite), postes,
      noite ? new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }) : matLambert);
    if (m) grupo.add(m);
  }

  // placas: uma malha por nível, porque a geometria difere
  for (const nivel of [0, 1, 2]) {
    const desteNivel = placas.filter((p) => p.nivel === nivel);
    if (!desteNivel.length) continue;
    const m = montarInstancias(geoPlaca(luzAmbiente, nivel), desteNivel,
      new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }));
    if (m) grupo.add(m);
  }

  return grupo;
}

/** Nuvens: quads achatados bem alto, só para o céu não ficar liso. */
export function gerarNuvens(hora: HoraDoDia): Group | null {
  if (hora === 'noite') return null;
  const amb = AMBIENTES[hora];
  const c = new Construtor();
  const cor = new Color(hora === 'tarde' ? '#FFD9BC' : '#FFFFFF').multiplyScalar(0.96);
  const escura = new Color(hora === 'tarde' ? '#C9A5A0' : '#D6E2EE');
  for (let i = 0; i < 26; i++) {
    const ang = ruido(i * 7.3) * Math.PI * 2;
    const dist = 2000 + ruido(i * 3.7) * 2200;
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;
    const y = 300 + ruido(i * 11.1) * 260;
    const l = 260 + ruido(i * 5.5) * 340;
    const alt = 26 + ruido(i * 2.2) * 34;
    const antes = c.pos.length / 3;
    c.caixa(l, alt, l * 0.62, cor, 0, 0.7);
    // desloca a nuvem inteira
    for (let k = antes; k < c.pos.length / 3; k++) {
      c.pos[k * 3] += x; c.pos[k * 3 + 1] += y; c.pos[k * 3 + 2] += z;
    }
    void escura;
  }
  void CORES;
  const mesh = new InstancedMesh(c.geometria(), new MeshBasicMaterial({
    vertexColors: true, side: DoubleSide, transparent: true, opacity: 0.82, depthWrite: false,
  }), 1);
  const d = new Object3D();
  d.updateMatrix();
  mesh.setMatrixAt(0, d.matrix);
  mesh.frustumCulled = false;
  mesh.renderOrder = -0.5;
  void amb;
  const g = new Group();
  g.add(mesh);
  return g;
}
