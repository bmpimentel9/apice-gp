/**
 * Valida a física dirigindo de verdade: o piloto virtual completa voltas em
 * todos os circuitos. Se ele roda, sai da pista ou não consegue chegar perto do
 * tempo teórico, a física está errada e o jogador nunca conseguiria.
 */
import { CIRCUITOS } from '../src/game/data/tracks';
import { Pista } from '../src/game/sim/track';
import { criarEstadoCarro, passoFisica, type ContextoFisica } from '../src/game/sim/car';
import { Piloto } from '../src/game/sim/pilot';
import { NIVEIS, PASSO_FISICO } from '../src/game/sim/constants';

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(3).padStart(6, '0')}`;
};

console.log('circuito      volta ideal   piloto virtual   delta    fora   muro  vmax');
console.log('─'.repeat(76));

let falhas = 0;
for (const dados of CIRCUITOS) {
  const pista = new Pista(dados);
  const estado = criarEstadoCarro(pista, 0, pista.offsetLinha[0]);
  estado.u = 40; // largada lançada
  const piloto = new Piloto(pista, { ritmo: 1, coragem: 1, imprecisao: 0, offsetPreferido: 0 });
  const ctx: ContextoFisica = {
    pista,
    assistencias: NIVEIS.piloto,
    vacuo: 0, arSujo: 0,
    temMuros: dados.id === 'principado' || dados.id === 'corniche',
    limitadorPit: false,
  };

  let t = 0, foraCount = 0, muroCount = 0, passos = 0, vmax = 0;
  const tempos: number[] = [];
  let tVoltaInicio = 0;
  const limite = 500; // s de simulação
  let motivo = 'concluiu';

  while (t < limite && tempos.length < 3) {
    const entrada = piloto.calcular(estado, t);
    const voltaAntes = estado.volta;
    passoFisica(estado, entrada, ctx, PASSO_FISICO);
    t += PASSO_FISICO;
    passos++;
    if (estado.foraDaPista) foraCount++;
    if (estado.colidiuAgora) muroCount++;
    vmax = Math.max(vmax, estado.velocidade);
    if (estado.volta > voltaAntes) {
      tempos.push(t - tVoltaInicio);
      tVoltaInicio = t;
    }
    if (estado.velocidade < 2 && t > 8) { motivo = `travou em s=${estado.s.toFixed(0)}`; break; }
  }
  if (tempos.length < 3 && motivo === 'concluiu') {
    motivo = `tempo esgotado (s=${estado.s.toFixed(0)}/${pista.comprimento.toFixed(0)}, ${tempos.length} volta(s))`;
  }

  const melhor = tempos.length ? Math.min(...tempos.slice(1).length ? tempos.slice(1) : tempos) : NaN;
  const delta = melhor - pista.tempoTeorico;
  const pctFora = (foraCount / Math.max(passos, 1)) * 100;

  console.log(
    `${dados.id.padEnd(12)} ${fmt(pista.tempoTeorico).padStart(9)}   ` +
    `${(isNaN(melhor) ? '   —     ' : fmt(melhor)).padStart(12)}   ` +
    `${(isNaN(delta) ? '  —  ' : `${delta > 0 ? '+' : ''}${delta.toFixed(2)}s`).padStart(7)}  ` +
    `${pctFora.toFixed(1).padStart(5)}%  ${String(muroCount).padStart(4)}  ${(vmax * 3.6).toFixed(0)}`,
  );

  if (tempos.length < 2) {
    console.error(`  ✗ o piloto não completou 2 voltas em ${dados.id} — ${motivo}`);
    falhas++;
  } else {
    // Um piloto no ritmo teórico deve ficar dentro de 12% do ideal. O
    // Principado ganha folga: é o circuito mais sinuoso do calendário e o
    // controlador de perseguição sofre mais lá do que em qualquer outro.
    const tolerancia = dados.id === 'principado' ? 0.2 : 0.12;
    if (delta > pista.tempoTeorico * tolerancia) {
      console.error(`  ✗ piloto lento demais em ${dados.id} (+${delta.toFixed(1)}s)`);
      falhas++;
    }
    if (delta < -0.5) {
      console.error(`  ✗ piloto mais rápido que o teórico em ${dados.id} — perfil furado`);
      falhas++;
    }
    if (pctFora > 8) {
      console.error(`  ✗ piloto fora da pista ${pctFora.toFixed(1)}% do tempo em ${dados.id}`);
      falhas++;
    }
  }
}

console.log('─'.repeat(76));
if (falhas) {
  console.error(`\n${falhas} verificação(ões) falharam.`);
  process.exit(1);
}
console.log('Física dirigível em todos os circuitos.');
