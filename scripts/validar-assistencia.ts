/**
 * Valida a jogabilidade assistida — a promessa central do jogo.
 *
 * Três coisas precisam ser verdade ao mesmo tempo:
 *  1. Com o traçado automático e ZERO comando de direção, o carro completa
 *     voltas sem sair da pista. Se isso falhar, o jogo é injogável.
 *  2. O freio importa: quem não freia perde tempo de forma clara.
 *  3. Existe teto de habilidade: frear no ponto certo é sensivelmente melhor
 *     que frear de qualquer jeito. Sem isso não há jogo, só uma animação.
 */
import { CIRCUITOS } from '../src/game/data/tracks';
import { Pista } from '../src/game/sim/track';
import { criarEstadoCarro, passoFisica, recolocarNaPista, type ContextoFisica } from '../src/game/sim/car';
import { direcaoAssistida, lerFrenagem, freioDeSeguranca } from '../src/game/sim/driving';
import { NIVEIS, PASSO_FISICO } from '../src/game/sim/constants';

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(3).padStart(6, '0')}`;
};

type Estrategia = 'sem-freio' | 'no-ponto' | 'antecipado';

/** Roda voltas com o traçado assistido e a estratégia de freio dada. */
function correr(pista: Pista, estrategia: Estrategia, voltas = 2) {
  const estado = criarEstadoCarro(pista, 0, pista.offsetLinha[0]);
  estado.u = 30;
  const ctx: ContextoFisica = {
    pista,
    assistencias: NIVEIS.automatico,
    vacuo: 0, arSujo: 0,
    temMuros: pista.dados.id === 'principado' || pista.dados.id === 'corniche',
    limitadorPit: false,
  };

  let t = 0, fora = 0, passos = 0, muros = 0, parado = 0;
  const tempos: number[] = [];
  let tInicio = 0;

  while (t < 600 && tempos.length < voltas) {
    // O jogador não toca na direção: só o freio.
    const leitura = lerFrenagem(estado, pista);
    let freio = 0;
    if (estrategia === 'no-ponto') freio = leitura.necessario;
    else if (estrategia === 'antecipado') {
      // Freia cedo demais, que é o erro clássico de quem está começando.
      // (Pisar "tudo ou nada" no ponto certo não é erro: frear forte e tarde é
      // fisicamente eficiente, e o teste anterior media isso sem querer.)
      freio = lerFrenagem(estado, pista, 0.45).necessario;
    }

    freio = freioDeSeguranca(freio, leitura, ctx.assistencias);
    const dir = direcaoAssistida(estado, pista, 0, ctx.assistencias, ctx.temMuros);
    const voltaAntes = estado.volta;
    passoFisica(estado, { direcao: dir.direcao, freio, overtake: false }, ctx, PASSO_FISICO);
    t += PASSO_FISICO;
    passos++;
    if (estado.foraDaPista) fora++;
    if (estado.colidiuAgora) muros++;
    if (estado.volta > voltaAntes) { tempos.push(t - tInicio); tInicio = t; }
    // espelha a recuperação do jogo: se o carro empaca fora da pista, volta
    if (estado.velocidade < 1.2 && estado.foraDaPista) {
      parado += PASSO_FISICO;
      if (parado > 1.6) { recolocarNaPista(estado, pista); parado = 0; }
    } else parado = 0;
  }

  return {
    tempos,
    melhor: tempos.length ? Math.min(...tempos) : NaN,
    pctFora: (fora / Math.max(passos, 1)) * 100,
    muros,
    completou: tempos.length >= voltas,
  };
}

console.log('circuito      ideal      no ponto    sem frear   cedo dms   fora%  muros');
console.log('─'.repeat(80));

let falhas = 0;
for (const dados of CIRCUITOS) {
  const pista = new Pista(dados);
  const bom = correr(pista, 'no-ponto');
  const semFreio = correr(pista, 'sem-freio');
  const antecipado = correr(pista, 'antecipado');

  const dif = (a: number, b: number) => (isFinite(a) && isFinite(b) ? `+${(a - b).toFixed(1)}s` : '  —  ');

  console.log(
    `${dados.id.padEnd(12)} ${fmt(pista.tempoTeorico).padStart(9)}  ` +
    `${(bom.completou ? fmt(bom.melhor) : '   —    ').padStart(10)}  ` +
    `${(semFreio.completou ? dif(semFreio.melhor, bom.melhor) : ' não fez ').padStart(10)}  ` +
    `${(antecipado.completou ? dif(antecipado.melhor, bom.melhor) : ' não fez ').padStart(9)}  ` +
    `${bom.pctFora.toFixed(1).padStart(5)}  ${String(bom.muros).padStart(4)}`,
  );

  // 1) jogabilidade: sem nenhum comando de direção, tem que dar a volta
  if (!bom.completou) {
    console.error(`  ✗ ${dados.id}: o carro assistido NÃO completou as voltas`);
    falhas++;
  }
  if (bom.pctFora > 3) {
    console.error(`  ✗ ${dados.id}: assistido saiu da pista ${bom.pctFora.toFixed(1)}% do tempo`);
    falhas++;
  }
  if (bom.muros > 2) {
    console.error(`  ✗ ${dados.id}: assistido bateu ${bom.muros} vezes`);
    falhas++;
  }
  // 2) o freio precisa importar: não frear tem que custar tempo de verdade
  if (semFreio.completou && isFinite(bom.melhor)) {
    const perda = semFreio.melhor - bom.melhor;
    if (perda < 1.5) {
      console.error(`  ✗ ${dados.id}: não frear custa só ${perda.toFixed(1)}s — o freio não importa`);
      falhas++;
    }
  }
  // 3) frear demais também precisa custar, senão não há ponto ideal
  if (antecipado.completou && isFinite(bom.melhor)) {
    const perda = antecipado.melhor - bom.melhor;
    if (perda < 0.8) {
      console.error(`  ✗ ${dados.id}: frear cedo custa só ${perda.toFixed(1)}s — sem teto de habilidade`);
      falhas++;
    }
  } else if (!antecipado.completou) {
    console.error(`  ✗ ${dados.id}: quem freia cedo nem completou a volta`);
    falhas++;
  }
}

console.log('─'.repeat(80));
if (falhas) {
  console.error(`\n${falhas} verificação(ões) falharam.`);
  process.exit(1);
}
console.log('Assistência funciona: dá a volta sozinho, e o freio decide o tempo.');
