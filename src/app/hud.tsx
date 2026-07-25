'use client';

/**
 * HUD de corrida.
 *
 * Atualiza por referência direta ao DOM, nunca por estado do React: a 120 Hz,
 * um setState por quadro derrubaria a taxa de quadros sozinho.
 *
 * Layout pensado para 9:19,5. O terço central-inferior da tela nunca recebe
 * elemento nenhum — é por ali que o jogador enxerga a pista à frente, que é o
 * recurso mais escasso do formato retrato.
 */
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import type { QuadroHUD } from '../game/core/game';
import { Minimapa, type HandleMinimapa } from './minimapa';
import type { Pista } from '../game/sim/track';
import { PNEUS } from '../game/sim/constants';

export interface HandleHUD {
  atualizar: (q: QuadroHUD) => void;
}

export const formatarTempo = (t: number, sinal = false) => {
  if (!isFinite(t)) return '--:--.---';
  const neg = t < 0;
  const a = Math.abs(t);
  const m = Math.floor(a / 60);
  const s = a - m * 60;
  const corpo = m > 0
    ? `${m}:${s.toFixed(3).padStart(6, '0')}`
    : s.toFixed(3);
  if (sinal) return `${neg ? '−' : '+'}${corpo}`;
  return corpo;
};

interface Props {
  refHandle: Ref<HandleHUD>;
  onFreioDown: () => void;
  onFreioUp: () => void;
  onOvertake: () => void;
  canhoto: boolean;
  pista: Pista | null;
  corCircuito: string;
}

export function HUD({ refHandle, canhoto, pista, corCircuito }: Props) {
  const miniRef = useRef<HandleMinimapa>(null);
  const velRef = useRef<HTMLSpanElement>(null);
  const marchaRef = useRef<HTMLSpanElement>(null);
  const tempoRef = useRef<HTMLSpanElement>(null);
  const deltaRef = useRef<HTMLDivElement>(null);
  const melhorRef = useRef<HTMLSpanElement>(null);
  const voltaRef = useRef<HTMLSpanElement>(null);
  const posRef = useRef<HTMLDivElement>(null);
  const curvaRef = useRef<HTMLDivElement>(null);
  const energiaRef = useRef<HTMLDivElement>(null);
  const pneuRef = useRef<HTMLDivElement>(null);
  const aeroRef = useRef<HTMLDivElement>(null);
  const avisoRef = useRef<HTMLDivElement>(null);
  const rpmRef = useRef<SVGCircleElement>(null);
  const luzesRef = useRef<HTMLDivElement>(null);
  const freioRef = useRef<HTMLDivElement>(null);
  const anelFreioRef = useRef<SVGCircleElement>(null);
  const notaRef = useRef<HTMLDivElement>(null);
  const posPistaRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(refHandle, () => ({
    atualizar(q: QuadroHUD) {
      if (velRef.current) velRef.current.textContent = String(Math.round(q.velocidade));
      if (marchaRef.current) marchaRef.current.textContent = String(q.marcha);
      if (tempoRef.current) tempoRef.current.textContent = formatarTempo(q.tempoVolta);
      if (melhorRef.current) melhorRef.current.textContent = q.melhorVolta ? formatarTempo(q.melhorVolta) : '—';
      if (voltaRef.current) voltaRef.current.textContent = q.voltasTotais > 1 ? `${q.volta}/${q.voltasTotais}` : `${q.volta}`;

      // delta ao vivo: verde à frente, vermelho atrás
      const d = deltaRef.current;
      if (d) {
        if (q.delta === null) {
          d.style.opacity = '0';
        } else {
          d.style.opacity = '1';
          d.textContent = formatarTempo(q.delta, true);
          d.style.color = q.delta <= 0 ? 'var(--cor-verde)' : 'var(--cor-vermelho)';
        }
      }

      if (posRef.current) {
        posRef.current.style.display = q.totalCarros > 1 ? 'block' : 'none';
        posRef.current.firstElementChild!.textContent = `P${q.posicao}`;
      }

      miniRef.current?.atualizar(q.arco, q.proximaCurva?.distancia ?? 0);

      // aviso de curva — o chevron aparece antes de a curva entrar em tela
      const c = curvaRef.current;
      if (c) {
        if (!q.proximaCurva || q.proximaCurva.severidade < 2) {
          c.style.opacity = '0';
        } else {
          const { severidade, distancia, direcao } = q.proximaCurva;
          c.style.opacity = String(Math.max(0.25, 1 - distancia / 320));
          const seta = direcao > 0 ? '›' : '‹';
          c.innerHTML =
            `<span style="font-size:34px;line-height:1;transform:scaleX(1.5);display:inline-block">${seta.repeat(Math.min(3, Math.ceil(severidade / 2)))}</span>` +
            `<span style="font-size:20px;font-weight:800;margin-left:2px">${severidade}</span>`;
          const cores = ['#21c45d', '#21c45d', '#c6f135', '#f5c518', '#ff8000', '#e2241b'];
          c.style.color = cores[Math.min(5, severidade - 1)];
        }
      }

      // energia elétrica
      if (energiaRef.current) {
        const pct = Math.max(0, Math.min(1, q.energia / 4));
        energiaRef.current.style.transform = `scaleX(${pct})`;
        energiaRef.current.style.background = q.overtakeAtivo ? 'var(--cor-roxo)' : pct > 0.15 ? 'var(--cor-destaque)' : 'var(--cor-vermelho)';
      }

      // pneu: só chama atenção quando importa
      if (pneuRef.current) {
        const spec = PNEUS[q.composto];
        const critico = q.desgastePneu > 0.7;
        pneuRef.current.style.opacity = critico ? '1' : '0.5';
        pneuRef.current.style.animation = q.desgastePneu > 0.88 ? 'pulsar 900ms infinite' : 'none';
        pneuRef.current.style.borderColor = spec.cor;
        pneuRef.current.textContent = spec.sigla;
      }

      if (aeroRef.current) {
        aeroRef.current.style.opacity = q.modoAero === 'reta' ? '1' : '0.28';
      }

      if (rpmRef.current) {
        const circ = 2 * Math.PI * 30;
        rpmRef.current.style.strokeDashoffset = String(circ * (1 - q.rpm));
        rpmRef.current.style.stroke = q.rpm > 0.93 ? 'var(--cor-vermelho)' : 'var(--cor-destaque)';
      }

      // ── Aviso de frenagem: o coração do jogo ──────────────────────────
      // O botão acende e cresce conforme a curva exige freio. É o que ensina o
      // ponto de frenagem sem tutorial nenhum.
      if (freioRef.current && anelFreioRef.current) {
        const n = q.freioNecessario;
        const el = freioRef.current;
        if (n > 0.02) {
          const cor = q.freioAtrasado ? '#e2241b' : n > 0.3 ? '#ff8000' : '#f5c518';
          el.style.borderColor = cor;
          el.style.background = `rgba(226,36,27,${0.14 + n * 0.3})`;
          el.style.transform = `scale(${1 + n * 0.11})`;
          el.style.boxShadow = `0 0 ${10 + n * 26}px ${n * 6}px ${cor}66`;
          anelFreioRef.current.style.stroke = cor;
          anelFreioRef.current.style.opacity = '1';
        } else {
          el.style.borderColor = 'rgba(255,255,255,0.22)';
          el.style.background = 'rgba(226,36,27,0.12)';
          el.style.transform = 'scale(1)';
          el.style.boxShadow = 'none';
          anelFreioRef.current.style.opacity = '0.55';
        }
      }

      // nota da curva, logo depois de passar por ela
      if (notaRef.current) {
        const n = q.notaCurva;
        if (n && n.idade < 1.1) {
          const rotulos: Record<string, [string, string]> = {
            perfeito: ['PERFEITO', '#21c45d'],
            bom: ['BOM', '#c6f135'],
            tarde: ['TARDE DEMAIS', '#e2241b'],
            cedo: ['CEDO DEMAIS', '#f5c518'],
          };
          const [txt, cor] = rotulos[n.qualidade] ?? ['', '#fff'];
          notaRef.current.textContent = txt;
          notaRef.current.style.color = cor;
          notaRef.current.style.opacity = String(Math.max(0, 1 - n.idade / 1.1));
          notaRef.current.style.transform = `translateX(-50%) translateY(${-n.idade * 14}px)`;
        } else {
          notaRef.current.style.opacity = '0';
        }
      }

      // posição do carro na largura da pista
      if (posPistaRef.current) {
        posPistaRef.current.style.transform = `translateX(${q.posicaoNaPista * 26}px)`;
      }

      // avisos contextuais
      if (avisoRef.current) {
        let txt = '';
        if (q.safetyCar) txt = 'SAFETY CAR';
        else if (q.penalidade > 0) txt = `PENALIDADE +${q.penalidade}s`;
        else if (q.foraDaPista) txt = 'LIMITE DE PISTA';
        avisoRef.current.textContent = txt;
        avisoRef.current.style.opacity = txt ? '1' : '0';
      }

      // luzes de largada
      if (luzesRef.current) {
        const mostrar = q.fase === 'luzes';
        luzesRef.current.style.display = mostrar ? 'flex' : 'none';
        if (mostrar) {
          for (let i = 0; i < 5; i++) {
            const el = luzesRef.current.children[i] as HTMLElement;
            el.style.background = i < q.luzes ? 'var(--cor-vermelho)' : 'rgba(255,255,255,0.1)';
            el.style.boxShadow = i < q.luzes ? '0 0 18px rgba(226,36,27,0.85)' : 'none';
          }
        }
      }
    },
  }), []);

  useEffect(() => { /* nada a limpar: tudo é DOM direto */ }, []);

  const ladoFreio = canhoto ? 'left' : 'right';
  const ladoOvertake = canhoto ? 'right' : 'left';

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
      {/* ── Faixa superior: o dado mais olhado fica no centro ────────────── */}
      <div style={{
        position: 'absolute', top: 'calc(var(--seguro-topo) + 6px)', left: 10, right: 10,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div className="painel" style={{ padding: '5px 9px', minWidth: 58 }}>
            <div style={{ fontSize: 8, color: 'var(--cor-suave)', letterSpacing: '0.09em' }}>VOLTA</div>
            <span ref={voltaRef} className="num" style={{ fontSize: 17, fontWeight: 800 }}>1</span>
          </div>
          <div ref={posRef} className="painel" style={{ padding: '5px 9px', minWidth: 58, display: 'none' }}>
            <div className="num" style={{ fontSize: 17, fontWeight: 800 }}>P1</div>
            <div style={{ fontSize: 8, color: 'var(--cor-suave)', letterSpacing: '0.09em' }}>POSIÇÃO</div>
          </div>
        </div>

        <div style={{ textAlign: 'center', flex: 1 }}>
          <span ref={tempoRef} className="num" style={{
            fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em',
            textShadow: '0 2px 12px rgba(0,0,0,.8)', display: 'block', lineHeight: 1.05,
          }}>0.000</span>
          <div ref={deltaRef} className="num" style={{
            fontSize: 21, fontWeight: 800, marginTop: 1, opacity: 0,
            textShadow: '0 2px 10px rgba(0,0,0,.9)', transition: 'color 140ms',
          }} />
          <div style={{ fontSize: 10, color: 'var(--cor-suave)', marginTop: 1 }}>
            melhor <span ref={melhorRef} className="num">—</span>
          </div>
        </div>

        <div style={{ width: 74 }} />
      </div>

      <Minimapa pista={pista} refHandle={miniRef} cor={corCircuito} />

      {/* ── Aviso de curva ───────────────────────────────────────────────── */}
      <div ref={curvaRef} style={{
        position: 'absolute', top: 'calc(var(--seguro-topo) + 88px)', right: 14,
        display: 'flex', alignItems: 'center', gap: 2, opacity: 0,
        transition: 'opacity 160ms', textShadow: '0 2px 10px rgba(0,0,0,.85)',
        fontWeight: 800,
      }} />

      {/* ── Aviso contextual ─────────────────────────────────────────────── */}
      <div ref={avisoRef} style={{
        position: 'absolute', top: 'calc(var(--seguro-topo) + 150px)', left: 0, right: 0,
        textAlign: 'center', fontSize: 13, fontWeight: 800, letterSpacing: '0.12em',
        color: 'var(--cor-destaque)', opacity: 0, transition: 'opacity 200ms',
        textShadow: '0 2px 10px rgba(0,0,0,.9)',
      }} />

      {/* ── Luzes de largada ─────────────────────────────────────────────── */}
      <div ref={luzesRef} style={{
        position: 'absolute', top: '22%', left: 0, right: 0, display: 'none',
        justifyContent: 'center', gap: 10,
      }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)',
            border: '2px solid rgba(255,255,255,0.16)',
          }} />
        ))}
      </div>

      {/* ── Base: velocidade, pneu, energia ──────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 'calc(var(--seguro-base) + 128px)',
        left: 0, right: 0, display: 'flex', justifyContent: 'center',
        alignItems: 'flex-end', gap: 14, pointerEvents: 'none',
      }}>
        <div ref={pneuRef} className="num" style={{
          width: 26, height: 26, borderRadius: '50%', border: '2px solid',
          display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800,
          background: 'rgba(0,0,0,.45)', opacity: 0.5,
        }}>M</div>

        <div style={{ textAlign: 'center' }}>
          <span ref={velRef} className="num" style={{
            fontSize: 42, fontWeight: 800, lineHeight: 1,
            textShadow: '0 3px 14px rgba(0,0,0,.9)',
          }}>0</span>
          <span style={{ fontSize: 11, color: 'var(--cor-suave)', marginLeft: 3 }}>km/h</span>
        </div>

        <div ref={aeroRef} style={{
          fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
          padding: '3px 6px', borderRadius: 4, background: 'rgba(33,196,93,.22)',
          border: '1px solid var(--cor-verde)', color: 'var(--cor-verde)',
          opacity: 0.28, transition: 'opacity 180ms',
        }}>RETA</div>
      </div>

      {/* barra de energia elétrica */}
      <div style={{
        position: 'absolute', bottom: 'calc(var(--seguro-base) + 116px)',
        left: '26%', right: '26%', height: 3, borderRadius: 2,
        background: 'rgba(255,255,255,0.12)', overflow: 'hidden',
      }}>
        <div ref={energiaRef} style={{
          height: '100%', width: '100%', transformOrigin: 'left',
          background: 'var(--cor-destaque)', transition: 'background 200ms',
        }} />
      </div>

      {/* ── Botão de freio: onde o polegar já está ───────────────────────── */}
      <div
        ref={freioRef}
        style={{
          position: 'absolute', bottom: 'calc(var(--seguro-base) + 24px)',
          [ladoFreio]: 26, width: 92, height: 92, pointerEvents: 'none',
          borderRadius: '50%', border: '2px solid rgba(255,255,255,0.22)',
          background: 'rgba(226,36,27,0.12)',
          transition: 'background 90ms linear, box-shadow 90ms linear, transform 90ms ease-out, border-color 90ms',
        } as React.CSSProperties}
      >
        <svg width="92" height="92" viewBox="0 0 92 92" style={{ position: 'absolute', inset: -2 }}>
          <circle
            ref={anelFreioRef} cx="46" cy="46" r="38" fill="none"
            stroke="var(--cor-destaque)" strokeWidth="2.5" opacity="0.55"
            strokeDasharray="4 7"
          />
          <circle
            ref={rpmRef} cx="46" cy="46" r="30" fill="none"
            stroke="var(--cor-destaque)" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 30} strokeDashoffset={2 * Math.PI * 30}
            transform="rotate(-90 46 46)"
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: '#fff',
          textShadow: '0 1px 6px rgba(0,0,0,.9)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, lineHeight: 1 }}><span ref={marchaRef} className="num">1</span></div>
            <div style={{ fontSize: 9, opacity: 0.75 }}>FREIO</div>
          </div>
        </div>
      </div>

      {/* ── Nota da curva ────────────────────────────────────────────────── */}
      <div ref={notaRef} className="num" style={{
        position: 'absolute', bottom: 'calc(var(--seguro-base) + 210px)', left: '50%',
        transform: 'translateX(-50%)', fontSize: 15, fontWeight: 900,
        letterSpacing: '0.14em', opacity: 0, pointerEvents: 'none',
        textShadow: '0 2px 10px rgba(0,0,0,.9)',
      }} />

      {/* ── Onde estou na largura da pista ───────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 'calc(var(--seguro-base) + 100px)',
        left: '50%', transform: 'translateX(-50%)', width: 64, height: 3,
        borderRadius: 2, background: 'rgba(255,255,255,0.14)',
      }}>
        <div ref={posPistaRef} style={{
          position: 'absolute', top: -2, left: 29, width: 7, height: 7,
          borderRadius: '50%', background: 'var(--cor-destaque)',
          transition: 'transform 90ms linear',
        }} />
      </div>

      {/* ── Overtake Mode ────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 'calc(var(--seguro-base) + 30px)',
        [ladoOvertake]: 26, width: 76, height: 76, pointerEvents: 'none',
        borderRadius: '50%', border: '2px solid rgba(168,85,247,0.5)',
        background: 'rgba(168,85,247,0.14)', display: 'grid', placeItems: 'center',
        fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textAlign: 'center',
        lineHeight: 1.2, color: '#e9d5ff', textShadow: '0 1px 6px rgba(0,0,0,.9)',
      } as React.CSSProperties}>
        OVER<br />TAKE
      </div>
    </div>
  );
}
