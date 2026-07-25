/**
 * Valida a ida e volta do fantasma pela URL: gravar → codificar → link →
 * decodificar → reproduzir. Se o link não couber no que WhatsApp e iMessage
 * preservam, o recurso não existe na prática.
 */
import { CIRCUITOS } from '../src/game/data/tracks';
import { Pista } from '../src/game/sim/track';
import { criarEstadoCarro, passoFisica, type ContextoFisica } from '../src/game/sim/car';
import { Piloto } from '../src/game/sim/pilot';
import { NIVEIS, PASSO_FISICO } from '../src/game/sim/constants';
import {
  GravadorFantasma, LeitorFantasma, codificarFantasma,
  decodificarFantasma, montarLinkDesafio,
} from '../src/game/core/ghost';

const LIMITE_URL = 1900;
let falhas = 0;

console.log('circuito      amostras  bytes   URL(chars)  erro pos (m)   erro delta');
console.log('─'.repeat(78));

for (const dados of CIRCUITOS) {
  const pista = new Pista(dados);
  const estado = criarEstadoCarro(pista, 0, pista.offsetLinha[0]);
  estado.u = 40;
  const piloto = new Piloto(pista);
  const ctx: ContextoFisica = {
    pista, assistencias: NIVEIS.profissional, vacuo: 0, arSujo: 0,
    temMuros: dados.id === 'principado' || dados.id === 'corniche',
    limitadorPit: false,
  };
  const grav = new GravadorFantasma(pista);

  // grava uma volta completa
  let t = 0;
  const trajeto: Array<[number, number, number, boolean]> = [];
  while (estado.volta < 1 && t < 300) {
    const e = piloto.calcular(estado, t);
    passoFisica(estado, e, ctx, PASSO_FISICO);
    t += PASSO_FISICO;
    grav.amostrar(estado, t);
    trajeto.push([t, estado.x, estado.z, estado.foraDaPista]);
  }
  const f = grav.finalizar(t);

  const cod = codificarFantasma(f);
  const link = montarLinkDesafio('https://apice-gp.vercel.app/', f, 'bruno');
  const dec = decodificarFantasma(cod, dados.id);

  if (!dec) {
    console.error(`  ✗ ${dados.id}: falhou ao decodificar`);
    falhas++;
    continue;
  }

  // reproduz o fantasma decodificado e compara com o trajeto original
  const leitor = new LeitorFantasma(dec, pista);
  // Mede o erro só com o carro DENTRO da pista: fora dela a projeção do arco
  // pode saltar entre segmentos, e o fantasma não tem como (nem precisa)
  // reproduzir um carro que rodou na escapatória.
  let erroMax = 0;
  let erroDelta = 0;
  for (const [tt, x, z, fora] of trajeto) {
    if (tt > dec.tempoTotal || fora) continue;
    const p = leitor.posicaoEm(tt);
    erroMax = Math.max(erroMax, Math.hypot(p.x - x, p.z - z));
  }
  // O que de fato importa: o delta de tempo que o jogador vê na tela.
  for (let i = 1; i < f.tempos.length; i++) {
    erroDelta = Math.max(erroDelta, Math.abs(dec.tempos[i] - f.tempos[i]));
  }

  const deltaFinal = Math.abs(dec.tempoTotal - f.tempoTotal);
  const temFantasmaNoLink = link.includes('&g=');

  console.log(
    `${dados.id.padEnd(12)} ${String(f.tempos.length).padStart(8)}  ` +
    `${String(Math.round((cod.length * 3) / 4)).padStart(5)}  ` +
    `${String(link.length).padStart(10)}${temFantasmaNoLink ? '' : ' (sem ghost)'}  ` +
    `${erroMax.toFixed(2).padStart(11)}  ${erroDelta.toFixed(4).padStart(10)}s`,
  );

  if (!temFantasmaNoLink) {
    console.error(`  ✗ ${dados.id}: o fantasma não coube na URL (${link.length} chars)`);
    falhas++;
  }
  if (link.length > LIMITE_URL) {
    console.error(`  ✗ ${dados.id}: URL longa demais (${link.length})`);
    falhas++;
  }
  // O fantasma é uma referência VISUAL; o cronômetro é a verdade. Com marcos a
  // cada 20 m, a interpolação entre eles deixa até ~14 m de erro pontual em
  // frenagem forte — cerca de dois comprimentos de carro, o que não atrapalha
  // a leitura de quem está na frente. Reduzir o passo de amostragem
  // resolveria, mas estouraria o limite de tamanho da URL, que é o que faz o
  // compartilhamento existir.
  if (erroMax > 14) {
    console.error(`  ✗ ${dados.id}: fantasma impreciso (${erroMax.toFixed(1)} m)`);
    falhas++;
  }
  // O delta na tela é o número que o jogador persegue: precisa ser exato.
  if (erroDelta > 0.02) {
    console.error(`  ✗ ${dados.id}: delta impreciso (${erroDelta.toFixed(3)}s)`);
    falhas++;
  }
  if (deltaFinal > 0.05) {
    console.error(`  ✗ ${dados.id}: tempo total perdido (${deltaFinal.toFixed(3)}s)`);
    falhas++;
  }
  // fantasma de outra pista precisa ser rejeitado
  const outra = CIRCUITOS.find((c) => c.id !== dados.id)!;
  if (decodificarFantasma(cod, outra.id) !== null) {
    console.error(`  ✗ ${dados.id}: aceitou fantasma de outro circuito`);
    falhas++;
  }
}

console.log('─'.repeat(78));
if (falhas) {
  console.error(`\n${falhas} verificação(ões) falharam.`);
  process.exit(1);
}
console.log('Fantasma cabe na URL, reproduz fiel e rejeita circuito trocado.');
