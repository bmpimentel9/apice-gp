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
  DoubleSide, Color, type WebGLRenderer,
} from 'three';
import { obterTexturas } from './textures';
import type { Pista } from '../sim/track';
import { AMBIENTES, CORES, corComLuz, ruidoSuave, type HoraDoDia } from './palette';

interface Construtor {
  pos: number[];
  cor: number[];
  uv: number[];
  idx: number[];
}

const novoConstrutor = (): Construtor => ({ pos: [], cor: [], uv: [], idx: [] });

/** Escala das texturas: um azulejo a cada 7 m de pista. */
const ESCALA_UV = 1 / 7;

function addQuad(
  c: Construtor,
  p1: [number, number, number], p2: [number, number, number],
  p3: [number, number, number], p4: [number, number, number],
  cor1: [number, number, number], cor2 = cor1, cor3 = cor2, cor4 = cor3,
  uv?: [number, number, number, number],
) {
  const base = c.pos.length / 3;
  c.pos.push(...p1, ...p2, ...p3, ...p4);
  c.cor.push(...cor1, ...cor2, ...cor3, ...cor4);
  if (uv) {
    const [u0, v0, u1, v1] = uv;
    c.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
  } else {
    c.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
  }
  c.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function finalizar(c: Construtor, material: MeshBasicMaterial) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(c.pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(c.cor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(c.uv, 2));
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

export function gerarMundo(pista: Pista, hora: HoraDoDia, renderer: WebGLRenderer): MundoGerado {
  const amb = AMBIENTES[hora];
  const n = pista.n;
  const W = pista.largura;
  const meia = W / 2;
  const temMuros = pista.dados.id === 'principado' || pista.dados.id === 'corniche';

  const asfalto = novoConstrutor();
  const detalhe = novoConstrutor(); // kerbs, linhas, largada — cores vivas
  const grama = novoConstrutor();
  const brita = novoConstrutor();
  const concreto = novoConstrutor();

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
      const v0 = pista.s[i] * ESCALA_UV, v1 = (pista.s[i] + 8) * ESCALA_UV;
      addQuad(asfalto, ponto(i, a1), ponto(i, b1), ponto(j, b2), ponto(j, a2), c1, c1, c2, c2,
        [a1 * ESCALA_UV, v0, b1 * ESCALA_UV, v1]);
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
      const forca = Math.min(1, (Math.abs(k1) - 1 / 150) * 200);
      const largKerb = 1.6;

      for (const lado of [ladoInterno, -ladoInterno]) {
        // o kerb externo só aparece nas curvas mais fortes
        if (lado !== ladoInterno && forca < 0.4) continue;
        const a = lado * meia;
        const meioA = lado * (meia + 0.4);
        const b = lado * (meia + largKerb);

        // Padrão FIA: faixas de 0,8 m alternando vermelho e branco. O segmento
        // do traçado tem 8 m, então precisa ser SUBDIVIDIDO — pintar uma cor
        // por segmento faz a alternância cair sempre na mesma paridade e o
        // kerb inteiro sai de uma cor só.
        const sub = 10;
        for (let k = 0; k < sub; k++) {
          const t0 = k / sub, t1 = (k + 1) / sub;
          const sAqui = pista.s[i] + (pista.s[j] - pista.s[i] + (j === 0 ? pista.comprimento : 0)) * t0;
          const corKerb = Math.floor(sAqui / 0.8) % 2 === 0 ? CORES.kerbA : CORES.kerbB;
          const lerpP = (off: number, t: number, alt: number): [number, number, number] => [
            pista.px[i] + (pista.px[j] - pista.px[i]) * t + (pista.nx[i] + (pista.nx[j] - pista.nx[i]) * t) * off,
            pista.py[i] + (pista.py[j] - pista.py[i]) * t + alt,
            pista.pz[i] + (pista.pz[j] - pista.pz[i]) * t + (pista.nz[i] + (pista.nz[j] - pista.nz[i]) * t) * off,
          ];
          const lz = l1 + (l2 - l1) * t0;
          const c1 = corComLuz(corKerb, lz * 1.06, amb);
          // rampa: 0 a 50 mm nos primeiros 40 cm, depois plano
          addQuad(detalhe, lerpP(a, t0, 0.012), lerpP(meioA, t0, 0.05),
            lerpP(meioA, t1, 0.05), lerpP(a, t1, 0.012), c1, c1, c1, c1);
          addQuad(detalhe, lerpP(meioA, t0, 0.05), lerpP(b, t0, 0.055),
            lerpP(b, t1, 0.055), lerpP(meioA, t1, 0.05), c1, c1, c1, c1);
          // face lateral
          const cs = corComLuz(corKerb, lz * 0.4, amb);
          addQuad(detalhe, lerpP(b, t0, 0.055), lerpP(b, t0, -0.02),
            lerpP(b, t1, -0.02), lerpP(b, t1, 0.055), cs, cs, cs, cs);
        }
      }
    }

    // ── Escapatória: a sequência real de uma pista de F1 ───────────────────
    // kerb → apron de asfalto → grama artificial → brita/grama → terreno.
    // A faixa de grama artificial verde-saturado entre o kerb e a brita é um
    // dos detalhes mais característicos e mais baratos de reproduzir: existe
    // por segurança, e na TV vira uma linha verde inconfundível.
    const largKerbAqui = emCurva ? 1.6 : 0;
    const posApron = meia + largKerbAqui;
    const largApron = emCurva ? 1.2 : 0.5;
    const largArtificial = 1.5;
    const largEscapatoria = temMuros ? 1.4 : 15;
    const largTerreno = temMuros ? 26 : 50;

    for (const lado of [-1, 1]) {
      const uv0 = pista.s[i] * ESCALA_UV, uv1 = (pista.s[i] + 8) * ESCALA_UV;

      // apron: asfalto liso logo depois do kerb
      const a0 = lado * posApron;
      const a1p = lado * (posApron + largApron);
      const cA1 = corComLuz(CORES.asfaltoClaro, l1 * 0.98, amb);
      const cA2 = corComLuz(CORES.asfaltoClaro, l2 * 0.98, amb);
      addQuad(asfalto, ponto(i, a0, -0.01), ponto(i, a1p, -0.03), ponto(j, a1p, -0.03), ponto(j, a0, -0.01),
        cA1, cA1, cA2, cA2, [a0 * ESCALA_UV, uv0, a1p * ESCALA_UV, uv1]);

      // faixa de grama artificial
      const b0 = a1p;
      const b1p = lado * (posApron + largApron + largArtificial);
      const cG1 = corComLuz(CORES.gramaArtificial, l1, amb);
      const cG2 = corComLuz(CORES.gramaArtificial, l2, amb);
      addQuad(grama, ponto(i, b0, -0.03), ponto(i, b1p, -0.05), ponto(j, b1p, -0.05), ponto(j, b0, -0.03),
        cG1, cG1, cG2, cG2, [b0 * ESCALA_UV * 2, uv0 * 2, b1p * ESCALA_UV * 2, uv1 * 2]);

      // escapatória: brita nas curvas, grama nas retas, concreto no urbano
      const c0 = b1p;
      const c1p = lado * (posApron + largApron + largArtificial + largEscapatoria);
      const alvo = temMuros ? concreto : emCurva ? brita : grama;
      const corEsc = temMuros ? CORES.concreto : emCurva ? CORES.brita : CORES.grama;
      const cE1 = corComLuz(corEsc, l1 * 0.97, amb);
      const cE2 = corComLuz(corEsc, l2 * 0.97, amb);
      addQuad(alvo, ponto(i, c0, -0.05), ponto(i, c1p, -0.2), ponto(j, c1p, -0.2), ponto(j, c0, -0.05),
        cE1, cE1, cE2, cE2, [c0 * ESCALA_UV, uv0, c1p * ESCALA_UV, uv1]);

      // terreno amplo
      const d0 = c1p;
      const d1 = lado * (posApron + largApron + largArtificial + largEscapatoria + largTerreno);
      const alvoT = temMuros ? concreto : grama;
      const corT = temMuros ? CORES.concreto : CORES.grama;
      const cT1 = corComLuz(corT, l1 * 0.88, amb);
      const cT2 = corComLuz(corT, l2 * 0.88, amb);
      addQuad(alvoT, ponto(i, d0, -0.2), ponto(i, d1, -1.5), ponto(j, d1, -1.5), ponto(j, d0, -0.2),
        cT1, cT1, cT2, cT2, [d0 * ESCALA_UV * 0.5, uv0 * 0.5, d1 * ESCALA_UV * 0.5, uv1 * 0.5]);
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

  const tex = obterTexturas(renderer);
  const mat = (map?: typeof tex.asfalto) => new MeshBasicMaterial({
    vertexColors: true, side: DoubleSide, map: map ?? null,
  });

  const grupo = new Group();
  const meshGrama = finalizar(grama, mat(tex.grama));
  const meshBrita = finalizar(brita, mat(tex.brita));
  const meshConcreto = finalizar(concreto, mat(tex.concreto));
  const meshAsfalto = finalizar(asfalto, mat(tex.asfalto));
  const meshDetalhe = finalizar(detalhe, mat());
  meshGrama.renderOrder = 0;
  meshBrita.renderOrder = 0;
  meshConcreto.renderOrder = 0;
  meshAsfalto.renderOrder = 1;
  meshDetalhe.renderOrder = 2;
  grupo.add(meshGrama, meshBrita, meshConcreto, meshAsfalto, meshDetalhe);

  const triangulos = (grama.idx.length + brita.idx.length + concreto.idx.length
    + asfalto.idx.length + detalhe.idx.length) / 3;
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
