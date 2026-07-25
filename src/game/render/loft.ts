/**
 * Malha por lofting de seções — o que separa "carro" de "pilha de caixas".
 *
 * Duas ideias resolvem o problema todo:
 *
 * 1. **Seções poligonais.** Um carro não tem seção transversal retangular em
 *    lugar nenhum: é sempre uma gota — base achatada, bojo máximo no terço
 *    inferior, convergindo para uma crista no topo. Com 10 a 14 vértices por
 *    contorno a silhueta muda completamente.
 *
 * 2. **Vértices soldados.** Se cada face empurra vértices próprios, o
 *    `computeVertexNormals` não tem o que suavizar e tudo sai facetado — mesmo
 *    pedindo sombreamento suave. Aqui os anéis consecutivos COMPARTILHAM os
 *    vértices do contorno, e a suavização passa a funcionar de verdade.
 *    Onde a aresta deve ser viva (asas, placas, difusor), basta duplicar o anel.
 */
import { BufferGeometry, Float32BufferAttribute, Color } from 'three';

export type V3 = [number, number, number];

/**
 * Contorno de seção em forma de gota.
 *
 * @param largura  largura máxima da seção
 * @param yBase    altura da base
 * @param yTopo    altura da crista
 * @param achatamento 0 = topo arredondado, 1 = topo agudo
 * @param undercut  0 = flanco reto, 1 = flanco inferior bem recuado
 * @param n        número de vértices (par, ≥ 8)
 */
export function contornoGota(
  largura: number, yBase: number, yTopo: number,
  achatamento = 0.4, undercut = 0, n = 12,
): V3[] {
  // perfil normalizado: [fração da altura, fração da largura]
  const perfil: Array<[number, number]> = [
    [0.0, 0.86 - undercut * 0.34],
    [0.14, 0.99 - undercut * 0.16],
    [0.34, 1.0],
    [0.56, 0.94 - achatamento * 0.16],
    [0.74, 0.76 - achatamento * 0.26],
    [0.9, 0.46 - achatamento * 0.3],
    [1.0, 0.1],
  ];

  const meio = Math.max(3, Math.floor(n / 2));
  const direita: V3[] = [];
  for (let i = 0; i < meio; i++) {
    const t = i / (meio - 1);
    // reamostra o perfil linearmente
    let fh = 0, fw = 0;
    for (let k = 0; k < perfil.length - 1; k++) {
      const [h0, w0] = perfil[k];
      const [h1, w1] = perfil[k + 1];
      const a = k / (perfil.length - 1);
      const b = (k + 1) / (perfil.length - 1);
      if (t >= a && t <= b) {
        const f = b > a ? (t - a) / (b - a) : 0;
        fh = h0 + (h1 - h0) * f;
        fw = w0 + (w1 - w0) * f;
        break;
      }
    }
    direita.push([(fw * largura) / 2, yBase + fh * (yTopo - yBase), 0]);
  }
  // espelha, sem duplicar base nem ápice
  const esquerda: V3[] = direita.slice(1, -1).reverse().map(([x, y]) => [-x, y, 0]);
  return [...direita, ...esquerda];
}

/** Contorno retangular com cantos chanfrados — asas, placas, difusor. */
export function contornoChato(largura: number, yBase: number, yTopo: number, chanfro = 0.02): V3[] {
  const h = largura / 2;
  const c = Math.min(chanfro, (yTopo - yBase) / 2, h / 2);
  return [
    [h - c, yBase, 0], [h, yBase + c, 0], [h, yTopo - c, 0], [h - c, yTopo, 0],
    [-h + c, yTopo, 0], [-h, yTopo - c, 0], [-h, yBase + c, 0], [-h + c, yBase, 0],
  ];
}

export class MalhaLoft {
  pos: number[] = [];
  cor: number[] = [];
  idx: number[] = [];

  /** Insere um anel de contorno em z, devolvendo os índices dos vértices. */
  anel(contorno: V3[], z: number, cor: Color, dx = 0, dy = 0): number[] {
    const base = this.pos.length / 3;
    const ids: number[] = [];
    for (const [x, y] of contorno) {
      this.pos.push(x + dx, y + dy, z);
      this.cor.push(cor.r, cor.g, cor.b);
      ids.push(base + ids.length);
    }
    return ids;
  }

  /**
   * Costura dois anéis. A ordem angular precisa ser a MESMA nos dois — inverter
   * a ordem de um deles gera faces viradas para dentro, e reemparelhar índices
   * gera torção.
   */
  costurar(a: number[], b: number[]) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.idx.push(a[i], b[i], b[j]);
      this.idx.push(a[i], b[j], a[j]);
    }
  }

  /** Fecha a extremidade de um tubo com um leque de triângulos. */
  tampar(anel: number[], inverter = false) {
    for (let i = 1; i < anel.length - 1; i++) {
      if (inverter) this.idx.push(anel[0], anel[i + 1], anel[i]);
      else this.idx.push(anel[0], anel[i], anel[i + 1]);
    }
  }

  /** Face independente, com vértices próprios — aresta viva garantida. */
  face(vs: V3[], cor: Color) {
    const base = this.pos.length / 3;
    for (const v of vs) {
      this.pos.push(v[0], v[1], v[2]);
      this.cor.push(cor.r, cor.g, cor.b);
    }
    for (let i = 1; i < vs.length - 1; i++) this.idx.push(base, base + i, base + i + 1);
  }

  /**
   * Sólido a partir de uma sequência de estações. Cada estação tem seu contorno
   * e sua posição em z; os anéis são soldados, então o sombreamento sai suave.
   */
  solido(
    estacoes: Array<{ z: number; contorno: V3[]; cor: Color; dx?: number; dy?: number }>,
    taparInicio = true, taparFim = true,
  ) {
    const aneis = estacoes.map((e) => this.anel(e.contorno, e.z, e.cor, e.dx ?? 0, e.dy ?? 0));
    for (let i = 0; i < aneis.length - 1; i++) this.costurar(aneis[i], aneis[i + 1]);
    if (taparInicio) this.tampar(aneis[0], true);
    if (taparFim) this.tampar(aneis[aneis.length - 1]);
    return aneis;
  }

  geometria(suave = true) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.cor, 3));
    g.setIndex(this.idx);
    if (suave) g.computeVertexNormals();
    else {
      g.deleteAttribute('normal');
      const plana = g.toNonIndexed();
      plana.computeVertexNormals();
      return plana;
    }
    g.computeBoundingSphere();
    return g;
  }

  get triangulos() { return this.idx.length / 3; }
}
