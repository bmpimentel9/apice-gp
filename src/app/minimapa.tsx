'use client';

/**
 * Minimapa do circuito.
 *
 * Discreto no canto superior direito: o traçado inteiro em fio fino, um ponto
 * para o carro e o trecho seguinte destacado. Responde a duas perguntas que o
 * jogador faz o tempo todo em retrato — "onde estou na volta?" e "o que vem
 * agora?" — sem tirar espaço da pista.
 *
 * O traçado é desenhado uma única vez como path de SVG. Só o ponto e o trecho
 * destacado mudam por quadro, via referência direta: nada de re-render.
 */
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import type { Pista } from '../game/sim/track';

export interface HandleMinimapa {
  atualizar: (s: number, curvaAdiante: number) => void;
}

const TAM = 74;
const MARGEM = 7;

interface Props {
  pista: Pista | null;
  refHandle: Ref<HandleMinimapa>;
  cor: string;
}

export function Minimapa({ pista, refHandle, cor }: Props) {
  const pontoRef = useRef<SVGCircleElement>(null);
  const adianteRef = useRef<SVGPathElement>(null);
  const progressoRef = useRef<SVGCircleElement>(null);

  /** Projeta o traçado numa caixa quadrada, preservando a proporção. */
  const mapa = useMemo(() => {
    if (!pista) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < pista.n; i++) {
      minX = Math.min(minX, pista.px[i]); maxX = Math.max(maxX, pista.px[i]);
      minZ = Math.min(minZ, pista.pz[i]); maxZ = Math.max(maxZ, pista.pz[i]);
    }
    const larg = maxX - minX || 1;
    const alt = maxZ - minZ || 1;
    const escala = (TAM - MARGEM * 2) / Math.max(larg, alt);
    const offX = (TAM - larg * escala) / 2;
    const offY = (TAM - alt * escala) / 2;

    const proj = (i: number): [number, number] => [
      offX + (pista.px[i] - minX) * escala,
      offY + (pista.pz[i] - minZ) * escala,
    ];

    // simplifica: um ponto a cada N mantém o desenho leve sem perder a forma
    const passo = Math.max(1, Math.floor(pista.n / 130));
    let d = '';
    for (let i = 0; i < pista.n; i += passo) {
      const [x, y] = proj(i);
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    d += 'Z';

    const [lx, ly] = proj(0);
    return { d, proj, largada: [lx, ly] as [number, number], n: pista.n };
  }, [pista]);

  useImperativeHandle(refHandle, () => ({
    atualizar(s: number, curvaAdiante: number) {
      if (!mapa || !pista) return;
      const frac = ((s % pista.comprimento) + pista.comprimento) % pista.comprimento / pista.comprimento;
      const i = Math.min(pista.n - 1, Math.floor(frac * pista.n));
      const [x, y] = mapa.proj(i);
      if (pontoRef.current) {
        pontoRef.current.setAttribute('cx', x.toFixed(1));
        pontoRef.current.setAttribute('cy', y.toFixed(1));
      }
      if (progressoRef.current) {
        progressoRef.current.setAttribute('cx', x.toFixed(1));
        progressoRef.current.setAttribute('cy', y.toFixed(1));
      }
      // trecho à frente: mostra a curva que está chegando
      if (adianteRef.current) {
        const passos = 14;
        const alcance = Math.max(90, curvaAdiante + 120);
        let d = '';
        for (let k = 0; k <= passos; k++) {
          const ss = s + (alcance * k) / passos;
          const fr = ((ss % pista.comprimento) + pista.comprimento) % pista.comprimento / pista.comprimento;
          const idx = Math.min(pista.n - 1, Math.floor(fr * pista.n));
          const [px, py] = mapa.proj(idx);
          d += `${k === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
        }
        adianteRef.current.setAttribute('d', d);
      }
    },
  }), [mapa, pista]);

  useEffect(() => { /* nada a limpar */ }, []);

  if (!mapa) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 'calc(var(--seguro-topo) + 6px)',
      right: 10,
      width: TAM, height: TAM,
      borderRadius: 12,
      background: 'rgba(10,14,24,0.5)',
      border: '1px solid rgba(255,255,255,0.1)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      pointerEvents: 'none',
      overflow: 'hidden',
    }}>
      <svg width={TAM} height={TAM} viewBox={`0 0 ${TAM} ${TAM}`}>
        {/* traçado completo, bem discreto */}
        <path d={mapa.d} fill="none" stroke="rgba(255,255,255,0.24)" strokeWidth="2.6"
              strokeLinejoin="round" strokeLinecap="round" />
        {/* trecho que vem a seguir, na cor do circuito */}
        <path ref={adianteRef} d="" fill="none" stroke={cor} strokeWidth="2.6"
              strokeLinejoin="round" strokeLinecap="round" opacity="0.95" />
        {/* linha de largada */}
        <circle cx={mapa.largada[0]} cy={mapa.largada[1]} r="1.9"
                fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" />
        {/* halo do carro */}
        <circle ref={progressoRef} cx="0" cy="0" r="5" fill={cor} opacity="0.22" />
        {/* carro */}
        <circle ref={pontoRef} cx="0" cy="0" r="2.7" fill="#fff"
                stroke="rgba(0,0,0,0.55)" strokeWidth="1" />
      </svg>
    </div>
  );
}
