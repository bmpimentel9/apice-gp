/**
 * Geração procedural do mundo: asfalto, kerbs, linha de borracha, escapatória,
 * terreno, muros e grid de largada.
 *
 * Tudo vira UMA malha por material, com a iluminação assada nas cores dos
 * vértices. O orçamento de quadro definido no projeto é de no máximo 60 draw
 * calls, e a pista inteira consome três.
 */
import {
  BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Group,
  DoubleSide, Color,
} from 'three';
import type { Pista } from '../sim/track';
import { AMBIENTES, CORES, corComLuz, ruidoSuave, type HoraDoDia } from './palette';

interface Construtor {
  pos: number[];
  cor: number[];
  idx: number[];
}

const novoConstrutor = (): Construtor => ({ pos: [], cor: [], idx: [] });

function addQuad(
  c: Construtor,
  p1: [number, number, number], p2: [number, number, number],
  p3: [number, number, number], p4: [number, number, number],
  cor1: [number, number, number], cor2 = cor1, cor3 = cor2, cor4 = cor3,
) {
  const base = c.pos.length / 3;
  c.pos.push(...p1, ...p2, ...p3, ...p4);
  c.cor.push(...cor1, ...cor2, ...cor3, ...cor4);
  c.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function finalizar(c: Construtor, material: MeshBasicMaterial) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(c.pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(c.cor, 3));
  g.setIndex(c.idx);
  g.computeBoundingSphere();
  const m = new Mesh(g, material);
  m.frustumCulled = false;
  return m;
}

export interface MundoGerado {
  grupo: Group;
  triangulos: number;
}

export function gerarMundo(pista: Pista, hora: HoraDoDia): MundoGerado {
  const amb = AMBIENTES[hora];
  const n = pista.n;
  const W = pista.largura;
  const meia = W / 2;
  const temMuros = pista.dados.id === 'principado' || pista.dados.id === 'corniche';

  const asfalto = novoConstrutor();
  const detalhe = novoConstrutor(); // kerbs, linhas, largada — cores vivas
  const terreno = novoConstrutor();

  // vetores auxiliares por índice
  const ponto = (i: number, off: number, alturaExtra = 0): [number, number, number] => [
    pista.px[i] + pista.nx[i] * off,
    pista.py[i] + alturaExtra,
    pista.pz[i] + pista.nz[i] * off,
  ];

  /** Sombreado assado: inclinação da pista contra a direção do sol. */
  const luzEm = (i: number) => {
    const inc = pista.inclinacao[i];
    const [sx, sy, sz] = amb.sol;
    // normal aproximada da pista considerando a inclinação longitudinal
    const nx2 = -pista.tx[i] * Math.sin(inc);
    const ny2 = Math.cos(inc);
    const nz2 = -pista.tz[i] * Math.sin(inc);
    const d = nx2 * sx + ny2 * sy + nz2 * sz;
    return 0.55 + 0.45 * Math.max(0, d);
  };

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const l1 = luzEm(i), l2 = luzEm(j);
    const k1 = pista.curvatura[i];
    const emCurva = Math.abs(k1) > 1 / 150;

    // ── Asfalto, em três faixas para poder pintar a linha de borracha ───────
    const offLinha1 = pista.offsetLinha[i];
    const offLinha2 = pista.offsetLinha[j];
    // largura da marca de borracha: mais larga onde a curva é rápida
    const larguraBorracha = 1.6 + Math.min(2.4, Math.abs(k1) * 260);

    const tomBase = (i: number) => 0.94 + ruidoSuave(i * 0.34) * 0.12;

    const faixas: Array<[number, number, boolean]> = [
      [-meia, offLinha1 - larguraBorracha, false],
      [offLinha1 - larguraBorracha, offLinha1 + larguraBorracha, true],
      [offLinha1 + larguraBorracha, meia, false],
    ];
    const faixas2: Array<[number, number]> = [
      [-meia, offLinha2 - larguraBorracha],
      [offLinha2 - larguraBorracha, offLinha2 + larguraBorracha],
      [offLinha2 + larguraBorracha, meia],
    ];

    for (let f = 0; f < 3; f++) {
      const [a1, b1, ehBorracha] = faixas[f];
      const [a2, b2] = faixas2[f];
      if (b1 - a1 < 0.05 && b2 - a2 < 0.05) continue;
      const base = ehBorracha ? CORES.borracha : CORES.asfalto;
      const t1 = tomBase(i), t2 = tomBase(j);
      const c1 = corComLuz(base, l1 * t1, amb);
      const c2 = corComLuz(base, l2 * t2, amb);
      addQuad(asfalto, ponto(i, a1), ponto(i, b1), ponto(j, b2), ponto(j, a2), c1, c1, c2, c2);
    }

    // ── Linhas brancas de limite de pista ───────────────────────────────────
    const cLinha1 = corComLuz(CORES.linha, l1, amb);
    const cLinha2 = corComLuz(CORES.linha, l2, amb);
    for (const lado of [-1, 1]) {
      const a = lado * (meia - 0.16);
      const b = lado * meia;
      addQuad(detalhe,
        ponto(i, a, 0.012), ponto(i, b, 0.012), ponto(j, b, 0.012), ponto(j, a, 0.012),
        cLinha1, cLinha1, cLinha2, cLinha2);
    }

    // ── Kerbs (zebras) — só nas curvas, alternando vermelho e branco ────────
    if (emCurva) {
      const ladoInterno = k1 > 0 ? 1 : -1;
      const alterna = Math.floor(pista.s[i] / 2.6) % 2 === 0;
      const corKerb = alterna ? CORES.kerbA : CORES.kerbB;
      const forca = Math.min(1, (Math.abs(k1) - 1 / 150) * 200);
      const largKerb = 0.9 + forca * 0.8;

      for (const lado of [ladoInterno, -ladoInterno]) {
        // o kerb externo só aparece nas curvas mais fortes
        if (lado !== ladoInterno && forca < 0.4) continue;
        const a = lado * meia;
        const b = lado * (meia + largKerb);
        // topo do kerb ligeiramente elevado: dá volume sem geometria extra
        const c1 = corComLuz(corKerb, l1 * 1.05, amb);
        const c2 = corComLuz(corKerb, l2 * 1.05, amb);
        addQuad(detalhe,
          ponto(i, a, 0.02), ponto(i, b, 0.11), ponto(j, b, 0.11), ponto(j, a, 0.02),
          c1, c1, c2, c2);
        // face lateral escura: o bisel falso que dá relevo
        const cs1 = corComLuz(corKerb, l1 * 0.42, amb);
        addQuad(detalhe,
          ponto(i, b, 0.11), ponto(i, b, 0), ponto(j, b, 0), ponto(j, b, 0.11),
          cs1, cs1, cs1, cs1);
      }
    }

    // ── Escapatória e terreno ───────────────────────────────────────────────
    const inicioEscapatoria = meia + (emCurva ? 1.9 : 0.4);
    const larguraEscapatoria = temMuros ? 1.6 : 16;
    const larguraTerreno = temMuros ? 26 : 52;

    for (const lado of [-1, 1]) {
      const a = lado * inicioEscapatoria;
      const b = lado * (inicioEscapatoria + larguraEscapatoria);
      const corEsc = temMuros ? CORES.concreto : emCurva ? CORES.brita : CORES.grama;
      const c1 = corComLuz(corEsc, l1 * 0.96, amb);
      const c2 = corComLuz(corEsc, l2 * 0.96, amb);
      addQuad(terreno, ponto(i, a, -0.04), ponto(i, b, -0.16), ponto(j, b, -0.16), ponto(j, a, -0.04), c1, c1, c2, c2);

      // terreno amplo, com faixas de corte de grama para dar escala
      const c = lado * (inicioEscapatoria + larguraEscapatoria + larguraTerreno);
      const listra = Math.floor(pista.s[i] / 26) % 2 === 0;
      const corT = temMuros ? CORES.concreto : listra ? CORES.grama : CORES.gramaEscura;
      const ct1 = corComLuz(corT, l1 * 0.9, amb);
      const ct2 = corComLuz(corT, l2 * 0.9, amb);
      addQuad(terreno, ponto(i, b, -0.16), ponto(i, c, -1.4), ponto(j, c, -1.4), ponto(j, b, -0.16), ct1, ct1, ct2, ct2);
    }

    // ── Muros dos circuitos de rua ──────────────────────────────────────────
    if (temMuros) {
      for (const lado of [-1, 1]) {
        const a = lado * (meia + 2.0);
        const cm1 = corComLuz(CORES.muro, l1 * 0.8, amb);
        const cm2 = corComLuz(CORES.muro, l2 * 0.8, amb);
        addQuad(detalhe, ponto(i, a, 0), ponto(i, a, 1.1), ponto(j, a, 1.1), ponto(j, a, 0), cm1, cm1, cm2, cm2);
        // faixa branca no topo
        const cf1 = corComLuz(CORES.muroFaixa, l1, amb);
        const cf2 = corComLuz(CORES.muroFaixa, l2, amb);
        addQuad(detalhe, ponto(i, a, 1.1), ponto(i, a, 1.35), ponto(j, a, 1.35), ponto(j, a, 1.1), cf1, cf1, cf2, cf2);
      }
    }
  }

  // ── Linha de largada e grid ───────────────────────────────────────────────
  {
    const l = luzEm(0);
    const cBranco = corComLuz(CORES.largada, l * 1.1, amb);
    // linha de chegada quadriculada
    const passos = 14;
    for (let q = 0; q < passos; q++) {
      const o1 = -meia + (W * q) / passos;
      const o2 = -meia + (W * (q + 1)) / passos;
      if (q % 2 !== 0) continue;
      addQuad(detalhe,
        ponto(0, o1, 0.016), ponto(0, o2, 0.016), ponto(1, o2, 0.016), ponto(1, o1, 0.016),
        cBranco, cBranco, cBranco, cBranco);
    }
    // marcas de grid alternadas, recuando da linha
    for (let g = 0; g < 10; g++) {
      const idx = (pista.n - 3 - g * 4 + pista.n) % pista.n;
      const lado = g % 2 === 0 ? -1 : 1;
      const off = lado * (meia * 0.42);
      const lg = luzEm(idx);
      const cg = corComLuz(CORES.largada, lg, amb);
      addQuad(detalhe,
        ponto(idx, off - 1.1, 0.014), ponto(idx, off + 1.1, 0.014),
        ponto((idx + 1) % pista.n, off + 1.1, 0.014), ponto((idx + 1) % pista.n, off - 1.1, 0.014),
        cg, cg, cg, cg);
    }
  }

  const matOpaco = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });
  const grupo = new Group();
  const meshTerreno = finalizar(terreno, matOpaco);
  const meshAsfalto = finalizar(asfalto, matOpaco);
  const meshDetalhe = finalizar(detalhe, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }));
  meshTerreno.renderOrder = 0;
  meshAsfalto.renderOrder = 1;
  meshDetalhe.renderOrder = 2;
  grupo.add(meshTerreno, meshAsfalto, meshDetalhe);

  const triangulos = (terreno.idx.length + asfalto.idx.length + detalhe.idx.length) / 3;
  return { grupo, triangulos };
}

/** Céu como gradiente vertical — uma esfera invertida, sem textura. */
export function gerarCeu(hora: HoraDoDia) {
  const amb = AMBIENTES[hora];
  const c = novoConstrutor();
  const raio = 4000;
  const segmentos = 24, aneis = 8;
  const topo = new Color(amb.ceuTopo);
  const horizonte = new Color(amb.ceuHorizonte);

  for (let a = 0; a < aneis; a++) {
    const f1 = a / aneis, f2 = (a + 1) / aneis;
    const y1 = Math.sin((f1 * Math.PI) / 2) * raio * 0.85 - raio * 0.06;
    const y2 = Math.sin((f2 * Math.PI) / 2) * raio * 0.85 - raio * 0.06;
    const r1 = Math.cos((f1 * Math.PI) / 2) * raio;
    const r2 = Math.cos((f2 * Math.PI) / 2) * raio;
    // O expoente comprime o gradiente para perto do horizonte. Com a câmera a
    // 4 m do chão, os anéis altos da esfera ficam fora do campo de visão — e
    // com um gradiente linear o jogador só via a cor do horizonte, perdendo
    // todo o drama do céu.
    const cor1 = horizonte.clone().lerp(topo, f1 ** 0.32);
    const cor2 = horizonte.clone().lerp(topo, f2 ** 0.32);
    const t1: [number, number, number] = [cor1.r, cor1.g, cor1.b];
    const t2: [number, number, number] = [cor2.r, cor2.g, cor2.b];
    for (let s = 0; s < segmentos; s++) {
      const a1 = (s / segmentos) * Math.PI * 2;
      const a2 = ((s + 1) / segmentos) * Math.PI * 2;
      addQuad(c,
        [Math.cos(a1) * r1, y1, Math.sin(a1) * r1],
        [Math.cos(a2) * r1, y1, Math.sin(a2) * r1],
        [Math.cos(a2) * r2, y2, Math.sin(a2) * r2],
        [Math.cos(a1) * r2, y2, Math.sin(a1) * r2],
        t1, t1, t2, t2);
    }
  }
  const mesh = finalizar(c, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, fog: false, depthWrite: false }));
  mesh.renderOrder = -1;
  return mesh;
}
