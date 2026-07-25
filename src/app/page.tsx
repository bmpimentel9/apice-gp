'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Jogo, type QuadroHUD, type ResultadoVolta, type ResultadoCorrida } from '../game/core/game';
import { HUD, formatarTempo, type HandleHUD } from './hud';
import { CIRCUITOS } from '../game/data/tracks';
import { MEDALHAS, NIVEIS } from '../game/sim/constants';
import { armazenamento, pedirPersistencia } from '../game/core/storage';
import { decodificarFantasma, montarLinkDesafio, type Fantasma } from '../game/core/ghost';
import type { ModoSessao } from '../game/sim/race';

type Tela = 'inicial' | 'jogando' | 'menu' | 'resultado' | 'ajustes';

export default function Pagina() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const jogoRef = useRef<Jogo | null>(null);
  const hudRef = useRef<HandleHUD>(null);
  const wakeRef = useRef<WakeLockSentinel | null>(null);

  const [tela, setTela] = useState<Tela>('inicial');
  const [circuito, setCircuito] = useState('paulista');
  const [modo, setModo] = useState<ModoSessao>('treino');
  const [prefs, setPrefs] = useState(() => armazenamento.lerPrefs());
  const [ultimaVolta, setUltimaVolta] = useState<ResultadoVolta | null>(null);
  const [resultadoGP, setResultadoGP] = useState<ResultadoCorrida | null>(null);
  const [desafio, setDesafio] = useState<{ tempo: number; autor?: string; fantasma: Fantasma | null } | null>(null);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [precisaGirar, setPrecisaGirar] = useState(false);

  // ── Desafio recebido por link ────────────────────────────────────────────
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const c = p.get('c');
    const t = p.get('t');
    if (c && t && CIRCUITOS.some((x) => x.id === c)) {
      const g = p.get('g');
      setCircuito(c);
      setModo('volta-rapida');
      setDesafio({
        tempo: parseFloat(t),
        autor: p.get('a') ?? undefined,
        fantasma: g ? decodificarFantasma(g, c) : null,
      });
    }
  }, []);

  // ── Orientação: no iPhone o bloqueio por API não funciona, então avisamos ─
  useEffect(() => {
    const checar = () => {
      const paisagem = window.matchMedia('(orientation: landscape)').matches;
      setPrecisaGirar(paisagem && window.innerWidth > 480 && window.innerHeight < 480);
    };
    checar();
    window.addEventListener('resize', checar);
    window.addEventListener('orientationchange', checar);
    return () => {
      window.removeEventListener('resize', checar);
      window.removeEventListener('orientationchange', checar);
    };
  }, []);

  // ── Impede a rolagem elástica do iOS (CSS sozinho não segura) ────────────
  useEffect(() => {
    const bloquear = (e: TouchEvent) => { e.preventDefault(); };
    document.addEventListener('touchmove', bloquear, { passive: false });
    return () => document.removeEventListener('touchmove', bloquear);
  }, []);

  const ajustarTamanho = useCallback(() => {
    const jogo = jogoRef.current;
    const canvas = canvasRef.current;
    if (!jogo || !canvas) return;
    const l = window.innerWidth;
    const a = window.innerHeight;
    canvas.style.width = `${l}px`;
    canvas.style.height = `${a}px`;
    const seguroBase = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--seguro-base')) || 0;
    jogo.redimensionar(l, a, seguroBase);
  }, []);

  useEffect(() => {
    window.addEventListener('resize', ajustarTamanho);
    return () => window.removeEventListener('resize', ajustarTamanho);
  }, [ajustarTamanho]);

  // ── Wake lock: a tela não pode apagar no meio da corrida ─────────────────
  const pedirWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeRef.current = await navigator.wakeLock.request('screen');
      }
    } catch { /* opcional */ }
  }, []);

  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && tela === 'jogando') pedirWakeLock();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [tela, pedirWakeLock]);

  const aoQuadro = useCallback((q: QuadroHUD) => {
    hudRef.current?.atualizar(q);
  }, []);

  const iniciarJogo = useCallback(async (circuitoId: string, m: ModoSessao) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let jogo = jogoRef.current;
    if (!jogo) {
      jogo = new Jogo(canvas);
      jogoRef.current = jogo;
      // exposto para os testes automatizados de navegador
      (window as unknown as { __jogo?: Jogo }).__jogo = jogo;
      jogo.entrada.conectar(canvas);
      jogo.cb.aoQuadro = aoQuadro;
      jogo.cb.aoCompletarVolta = (r) => {
        setUltimaVolta(r);
        window.setTimeout(() => setUltimaVolta(null), 3400);
      };
      jogo.cb.aoTerminarCorrida = (r) => {
        setResultadoGP(r);
        setTela('resultado');
      };
    }

    await jogo.audio.destravar();
    jogo.audio.silenciar(prefs.mudo);
    jogo.carregar(circuitoId, m, {
      assistencia: prefs.assistencia,
      fantasma: desafio?.fantasma ?? undefined,
    });
    ajustarTamanho();
    jogo.iniciar();
    armazenamento.incrementarPartidas();
    pedirPersistencia();
    pedirWakeLock();
    setTela('jogando');
  }, [aoQuadro, prefs, desafio, ajustarTamanho, pedirWakeLock]);

  useEffect(() => () => { jogoRef.current?.destruir(); }, []);

  const compartilhar = useCallback(async () => {
    const jogo = jogoRef.current;
    const f = jogo?.fantasmaAtual();
    const base = `${window.location.origin}${window.location.pathname}`;
    const rec = armazenamento.recorde(circuito);
    if (!rec) return;
    const link = f ? montarLinkDesafio(base, f) : `${base}?c=${circuito}&t=${rec.tempo.toFixed(3)}`;
    const nomeCircuito = CIRCUITOS.find((c) => c.id === circuito)?.nome ?? '';
    const texto = `Fiz ${formatarTempo(rec.tempo)} no ${nomeCircuito} no ÁPICE GP. Bate esse tempo:`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'ÁPICE GP', text: texto, url: link });
      } else {
        await navigator.clipboard.writeText(`${texto} ${link}`);
        setLinkCopiado(true);
        window.setTimeout(() => setLinkCopiado(false), 2200);
      }
    } catch { /* usuário cancelou */ }
  }, [circuito]);

  const salvarPref = useCallback((p: Partial<typeof prefs>) => {
    const novo = armazenamento.salvarPrefs(p);
    setPrefs(novo);
    const jogo = jogoRef.current;
    if (jogo) {
      jogo.entrada.config.canhoto = novo.canhoto;
      jogo.entrada.config.sensibilidade = novo.sensibilidade;
      jogo.renderizador.opcoes.reduzirMovimento = novo.reduzirMovimento;
      jogo.audio.volume = novo.volume;
      jogo.audio.silenciar(novo.mudo);
      ajustarTamanho();
    }
  }, [ajustarTamanho]);

  const dadosCircuito = CIRCUITOS.find((c) => c.id === circuito)!;
  const recorde = armazenamento.recorde(circuito);

  return (
    <main>
      <canvas ref={canvasRef} />

      {tela === 'jogando' && (
        <>
          <HUD
            refHandle={hudRef}
            canhoto={prefs.canhoto}
            pista={jogoRef.current?.pistaAtual ?? null}
            corCircuito={dadosCircuito.cor}
            onFreioDown={() => {}}
            onFreioUp={() => {}}
            onOvertake={() => {}}
          />
          <button
            onClick={() => { jogoRef.current?.parar(); setTela('menu'); }}
            style={{
              position: 'absolute', top: 'calc(var(--seguro-topo) + 8px)', left: '50%',
              transform: 'translateX(-50%)', zIndex: 4, width: 44, height: 30,
              opacity: 0.001,
            }}
            aria-label="Menu"
          />
          {ultimaVolta && <CartaoVolta r={ultimaVolta} />}
        </>
      )}

      {tela === 'inicial' && (
        <TelaInicial
          desafio={desafio}
          circuito={dadosCircuito.nome}
          onComecar={() => iniciarJogo(circuito, desafio ? 'volta-rapida' : 'treino')}
          onMenu={() => setTela('menu')}
        />
      )}

      {tela === 'menu' && (
        <Menu
          circuitoAtual={circuito}
          modo={modo}
          onEscolher={(c, m) => { setCircuito(c); setModo(m); iniciarJogo(c, m); }}
          onAjustes={() => setTela('ajustes')}
          onVoltar={() => (jogoRef.current ? (jogoRef.current.iniciar(), setTela('jogando')) : setTela('inicial'))}
          temJogo={!!jogoRef.current}
          onCompartilhar={recorde ? compartilhar : undefined}
          linkCopiado={linkCopiado}
        />
      )}

      {tela === 'ajustes' && (
        <Ajustes prefs={prefs} onMudar={salvarPref} onVoltar={() => setTela('menu')} />
      )}

      {tela === 'resultado' && resultadoGP && (
        <ResultadoFinal
          r={resultadoGP}
          onRepetir={() => iniciarJogo(circuito, 'corrida')}
          onMenu={() => setTela('menu')}
        />
      )}

      {precisaGirar && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99, background: 'var(--cor-fundo)',
          display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24,
        }}>
          <div>
            <div style={{ fontSize: 46, marginBottom: 14 }}>📱</div>
            <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>Gire o aparelho</div>
            <div style={{ color: 'var(--cor-suave)', fontSize: 14, maxWidth: 260 }}>
              O ÁPICE GP foi desenhado para ser jogado com o celular em pé.
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ── Telas ──────────────────────────────────────────────────────────────────

function TelaInicial({ desafio, circuito, onComecar, onMenu }: {
  desafio: { tempo: number; autor?: string; fantasma: Fantasma | null } | null;
  circuito: string;
  onComecar: () => void;
  onMenu: () => void;
}) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 5, display: 'flex',
      flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      padding: '0 28px', textAlign: 'center',
      background: 'radial-gradient(120% 80% at 50% 30%, rgba(255,128,0,.14), transparent 60%), var(--cor-fundo)',
    }}>
      <div className="surge">
        <div style={{
          fontSize: 11, letterSpacing: '0.42em', color: 'var(--cor-destaque)',
          fontWeight: 700, marginBottom: 6,
        }}>FÓRMULA 2026</div>
        <h1 style={{
          fontSize: 58, fontWeight: 900, margin: 0, lineHeight: 0.92,
          letterSpacing: '-0.045em',
        }}>ÁPICE<span style={{ color: 'var(--cor-destaque)' }}>GP</span></h1>
        <div style={{ color: 'var(--cor-suave)', fontSize: 14, marginTop: 12, maxWidth: 280 }}>
          {desafio
            ? `Alguém fez ${formatarTempo(desafio.tempo)} aqui. Sua vez.`
            : 'A volta perfeita cabe no seu polegar.'}
        </div>
      </div>

      <button
        onClick={onComecar}
        className="surge"
        style={{
          marginTop: 40, padding: '18px 44px', borderRadius: 999,
          background: 'var(--cor-destaque)', color: '#12161f',
          fontSize: 17, fontWeight: 900, letterSpacing: '0.04em',
          animation: 'brilhar 2.6s ease-in-out infinite',
        }}
      >
        {desafio ? 'ACEITAR DESAFIO' : 'CORRER AGORA'}
      </button>

      <div style={{ marginTop: 14, color: 'var(--cor-suave)', fontSize: 12 }}>{circuito}</div>

      <button onClick={onMenu} style={{
        position: 'absolute', bottom: 'calc(var(--seguro-base) + 26px)',
        color: 'var(--cor-suave)', fontSize: 13, padding: 12,
      }}>
        Escolher circuito e modo
      </button>
    </div>
  );
}

function Menu({ circuitoAtual, onEscolher, onAjustes, onVoltar, temJogo, onCompartilhar, linkCopiado }: {
  circuitoAtual: string;
  modo: ModoSessao;
  onEscolher: (c: string, m: ModoSessao) => void;
  onAjustes: () => void;
  onVoltar: () => void;
  temJogo: boolean;
  onCompartilhar?: () => void;
  linkCopiado: boolean;
}) {
  const [sel, setSel] = useState(circuitoAtual);
  const rec = armazenamento.recorde(sel);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(7,10,18,0.94)',
      display: 'flex', flexDirection: 'column',
      paddingTop: 'calc(var(--seguro-topo) + 14px)',
      paddingBottom: 'calc(var(--seguro-base) + 14px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px 10px' }}>
        {temJogo && (
          <button onClick={onVoltar} style={{ fontSize: 15, color: 'var(--cor-suave)', padding: 8 }}>‹ Voltar</button>
        )}
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 900, fontSize: 16, letterSpacing: '0.04em' }}>CIRCUITOS</div>
        <button onClick={onAjustes} style={{ fontSize: 15, color: 'var(--cor-suave)', padding: 8 }}>Ajustes</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px', WebkitOverflowScrolling: 'touch' }}>
        {CIRCUITOS.map((c) => {
          const r = armazenamento.recorde(c.id);
          const ativo = c.id === sel;
          return (
            <button
              key={c.id}
              onClick={() => setSel(c.id)}
              className="painel"
              style={{
                width: '100%', textAlign: 'left', padding: '12px 14px', marginBottom: 8,
                display: 'flex', alignItems: 'center', gap: 12,
                borderColor: ativo ? 'var(--cor-destaque)' : 'var(--cor-borda)',
                background: ativo ? 'rgba(255,128,0,0.1)' : 'var(--cor-painel)',
              }}
            >
              <div style={{ width: 4, height: 34, borderRadius: 2, background: c.cor }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{c.nome}</div>
                <div style={{ fontSize: 11, color: 'var(--cor-suave)', marginTop: 1 }}>
                  {c.cidade} · {(c.comprimento / 1000).toFixed(3)} km
                  {c.hora === 'noite' ? ' · noturno' : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="num" style={{ fontSize: 13, fontWeight: 800 }}>
                  {r ? formatarTempo(r.tempo) : '—'}
                </div>
                <div style={{ fontSize: 9, color: 'var(--cor-suave)' }}>seu recorde</div>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ padding: '10px 14px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {onCompartilhar && rec && (
          <button onClick={onCompartilhar} style={{
            padding: '11px', borderRadius: 12, border: '1px solid var(--cor-roxo)',
            color: '#e9d5ff', fontSize: 13, fontWeight: 700,
            background: 'rgba(168,85,247,0.14)',
          }}>
            {linkCopiado ? 'Link copiado' : 'Desafiar alguém com meu fantasma'}
          </button>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onEscolher(sel, 'volta-rapida')} style={{
            flex: 1, padding: '15px', borderRadius: 14, background: 'var(--cor-destaque)',
            color: '#12161f', fontWeight: 900, fontSize: 14,
          }}>VOLTA RÁPIDA</button>
          <button onClick={() => onEscolher(sel, 'corrida')} style={{
            flex: 1, padding: '15px', borderRadius: 14,
            border: '1px solid var(--cor-borda)', fontWeight: 900, fontSize: 14,
          }}>GP COMPLETO</button>
        </div>
        <button onClick={() => onEscolher(sel, 'treino')} style={{
          padding: '10px', color: 'var(--cor-suave)', fontSize: 13,
        }}>Treino livre</button>
      </div>
    </div>
  );
}

function Ajustes({ prefs, onMudar, onVoltar }: {
  prefs: ReturnType<typeof armazenamento.lerPrefs>;
  onMudar: (p: Partial<ReturnType<typeof armazenamento.lerPrefs>>) => void;
  onVoltar: () => void;
}) {
  const Linha = ({ titulo, desc, children }: { titulo: string; desc?: string; children: React.ReactNode }) => (
    <div className="painel" style={{ padding: '13px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{titulo}</div>
        {desc && <div style={{ fontSize: 11, color: 'var(--cor-suave)', marginTop: 2 }}>{desc}</div>}
      </div>
      {children}
    </div>
  );

  const Chave = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
    <button onClick={onClick} style={{
      width: 48, height: 28, borderRadius: 999, position: 'relative',
      background: on ? 'var(--cor-destaque)' : 'rgba(255,255,255,0.16)',
      transition: 'background 180ms',
    }} aria-pressed={on}>
      <span style={{
        position: 'absolute', top: 3, left: on ? 23 : 3, width: 22, height: 22,
        borderRadius: '50%', background: '#fff', transition: 'left 180ms',
      }} />
    </button>
  );

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 6, background: 'rgba(7,10,18,0.97)',
      display: 'flex', flexDirection: 'column',
      paddingTop: 'calc(var(--seguro-topo) + 14px)',
      paddingBottom: 'calc(var(--seguro-base) + 14px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px 12px' }}>
        <button onClick={onVoltar} style={{ fontSize: 15, color: 'var(--cor-suave)', padding: 8 }}>‹ Voltar</button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 900, fontSize: 16, marginRight: 60 }}>AJUSTES</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px' }}>
        <div style={{ fontSize: 11, color: 'var(--cor-suave)', margin: '4px 0 8px', letterSpacing: '0.1em' }}>PILOTAGEM</div>
        {Object.entries(NIVEIS).map(([id, n]) => (
          <button key={id} onClick={() => onMudar({ assistencia: id })} className="painel" style={{
            width: '100%', textAlign: 'left', padding: '12px 14px', marginBottom: 8,
            borderColor: prefs.assistencia === id ? 'var(--cor-destaque)' : 'var(--cor-borda)',
            background: prefs.assistencia === id ? 'rgba(255,128,0,0.1)' : 'var(--cor-painel)',
          }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{n.nome}</div>
            <div style={{ fontSize: 11, color: 'var(--cor-suave)', marginTop: 2 }}>{n.descricao}</div>
          </button>
        ))}

        <div style={{ fontSize: 11, color: 'var(--cor-suave)', margin: '16px 0 8px', letterSpacing: '0.1em' }}>CONTROLES</div>
        <Linha titulo="Canhoto" desc="Espelha o freio para a esquerda">
          <Chave on={prefs.canhoto} onClick={() => onMudar({ canhoto: !prefs.canhoto })} />
        </Linha>
        <Linha titulo="Sensibilidade" desc={`${prefs.sensibilidade.toFixed(1)}×`}>
          <input
            type="range" min={0.6} max={1.6} step={0.1} value={prefs.sensibilidade}
            onChange={(e) => onMudar({ sensibilidade: parseFloat(e.target.value) })}
            style={{ width: 110 }}
          />
        </Linha>

        <div style={{ fontSize: 11, color: 'var(--cor-suave)', margin: '16px 0 8px', letterSpacing: '0.1em' }}>ACESSIBILIDADE</div>
        <Linha titulo="Reduzir movimento" desc="Desliga tremor de câmera e desfoque">
          <Chave on={prefs.reduzirMovimento} onClick={() => onMudar({ reduzirMovimento: !prefs.reduzirMovimento })} />
        </Linha>
        <Linha titulo="Sem som" desc="O jogo é totalmente jogável mudo">
          <Chave on={prefs.mudo} onClick={() => onMudar({ mudo: !prefs.mudo })} />
        </Linha>
        <Linha titulo="Volume">
          <input
            type="range" min={0} max={1} step={0.05} value={prefs.volume}
            onChange={(e) => onMudar({ volume: parseFloat(e.target.value) })}
            style={{ width: 110 }}
          />
        </Linha>

        <div style={{ fontSize: 11, color: 'var(--cor-suave)', margin: '22px 0 40px', lineHeight: 1.6 }}>
          Equipes, pilotos e nomes de circuito são fictícios. Os traçados derivam de
          dados abertos sob licença MIT. Nenhuma marca real é utilizada.
        </div>
      </div>
    </div>
  );
}

function CartaoVolta({ r }: { r: ResultadoVolta }) {
  const medalha = MEDALHAS.find((m) => m.id === r.medalha);
  return (
    <div className="painel surge" style={{
      position: 'absolute', top: 'calc(var(--seguro-topo) + 180px)', left: '50%',
      transform: 'translateX(-50%)', zIndex: 6, padding: '14px 20px',
      textAlign: 'center', minWidth: 210, pointerEvents: 'none',
      borderColor: r.recorde ? 'var(--cor-destaque)' : 'var(--cor-borda)',
    }}>
      <div style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--cor-suave)' }}>
        {r.recorde ? 'NOVO RECORDE' : 'VOLTA COMPLETA'}
      </div>
      <div className="num" style={{ fontSize: 32, fontWeight: 900, margin: '4px 0' }}>
        {formatarTempo(r.tempo)}
      </div>
      {medalha && (
        <div style={{
          display: 'inline-block', padding: '3px 12px', borderRadius: 999,
          background: `${medalha.cor}22`, border: `1px solid ${medalha.cor}`,
          color: medalha.cor, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
        }}>{medalha.nome.toUpperCase()}</div>
      )}
      <div style={{ fontSize: 10, color: 'var(--cor-suave)', marginTop: 6 }}>
        ideal {formatarTempo(r.tempoIdeal)}
      </div>
    </div>
  );
}

function ResultadoFinal({ r, onRepetir, onMenu }: {
  r: ResultadoCorrida; onRepetir: () => void; onMenu: () => void;
}) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 7, background: 'rgba(7,10,18,0.96)',
      display: 'flex', flexDirection: 'column',
      paddingTop: 'calc(var(--seguro-topo) + 18px)',
      paddingBottom: 'calc(var(--seguro-base) + 14px)',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.2em', color: 'var(--cor-suave)' }}>RESULTADO FINAL</div>
        <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, marginTop: 4 }}>
          P{r.posicaoFinal}
        </div>
        {r.melhorVolta && (
          <div style={{ fontSize: 12, color: 'var(--cor-suave)', marginTop: 6 }}>
            melhor volta <span className="num">{formatarTempo(r.melhorVolta)}</span>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px' }}>
        {r.classificacao.slice(0, 20).map((p) => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
            borderRadius: 8, marginBottom: 4,
            background: p.ehJogador ? 'rgba(255,128,0,0.14)' : 'rgba(255,255,255,0.03)',
            border: p.ehJogador ? '1px solid var(--cor-destaque)' : '1px solid transparent',
          }}>
            <div className="num" style={{ width: 24, fontWeight: 800, fontSize: 14 }}>{p.posicao}</div>
            <div style={{ width: 3, height: 20, borderRadius: 2, background: p.equipe.cor }} />
            <div style={{ flex: 1, fontSize: 13, fontWeight: p.ehJogador ? 800 : 500 }}>{p.nome}</div>
            <div className="num" style={{ fontSize: 12, color: 'var(--cor-suave)' }}>
              {p.posicao === 1 ? '—' : `+${p.intervalo.toFixed(1)}s`}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '12px 14px 0' }}>
        <button onClick={onMenu} style={{
          flex: 1, padding: 15, borderRadius: 14, border: '1px solid var(--cor-borda)',
          fontWeight: 800, fontSize: 14,
        }}>Circuitos</button>
        <button onClick={onRepetir} style={{
          flex: 1, padding: 15, borderRadius: 14, background: 'var(--cor-destaque)',
          color: '#12161f', fontWeight: 900, fontSize: 14,
        }}>Correr de novo</button>
      </div>
    </div>
  );
}
