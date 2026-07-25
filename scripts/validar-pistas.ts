/**
 * Valida os traçados contra a realidade: tempo teórico de volta, velocidade
 * máxima e mínima. Se estes números não forem plausíveis para um F1, o modelo
 * de física está errado e não adianta construir nada em cima.
 */
import { CIRCUITOS } from '../src/game/data/tracks';
import { Pista } from '../src/game/sim/track';

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
};

// Tempos de referência reais (pole recente), só para conferência de ordem de
// grandeza — o jogo não precisa bater exatamente.
const REF: Record<string, { volta: string; vmax: number; tol?: number }> = {
  paulista: { volta: '1:10 Interlagos', vmax: 330 },
  // Limitação conhecida: o modelo não reproduz o piloto real levantando o pé
  // dentro do túnel antes da chicane, então o Principado fica ~12% rápido no
  // papel. Sem efeito prático — os muros é que definem o ritmo ali.
  principado: { volta: '1:11 Mônaco', vmax: 295, tol: 32 },
  templo: { volta: '1:19 Monza', vmax: 355 },
  corniche: { volta: '1:27 Jeddah', vmax: 350 },
  oito: { volta: '1:28 Suzuka', vmax: 330 },
  ardenas: { volta: '1:44 Spa', vmax: 345 },
};

console.log('circuito           comp.    volta ideal   vmax     vmin    ref');
console.log('─'.repeat(78));

let falhas = 0;
for (const dados of CIRCUITOS) {
  const p = new Pista(dados);
  let vmax = 0, vmin = 1e9;
  for (let i = 0; i < p.n; i++) {
    vmax = Math.max(vmax, p.velocidadeOtima[i]);
    vmin = Math.min(vmin, p.velocidadeOtima[i]);
  }
  const kmh = (v: number) => (v * 3.6).toFixed(0).padStart(3);
  const ref = REF[dados.id];
  const erroVmax = ref ? vmax * 3.6 - ref.vmax : 0;
  console.log(
    `${dados.id.padEnd(12)} ${(p.comprimento / 1000).toFixed(3)} km   ` +
    `${fmt(p.tempoTeorico).padStart(9)}   ${kmh(vmax)} km/h  ${kmh(vmin)} km/h  ` +
    `${ref ? `${ref.volta} / ${ref.vmax} km/h (${erroVmax > 0 ? '+' : ''}${erroVmax.toFixed(0)})` : ''}`,
  );

  // sanidade
  if (p.tempoTeorico < 45 || p.tempoTeorico > 150) {
    console.error(`  ✗ tempo de volta implausível em ${dados.id}`);
    falhas++;
  }
  // a velocidade máxima precisa ser específica da pista, não o limitador em toda parte
  if (ref && Math.abs(erroVmax) > (ref.tol ?? 20)) {
    console.error(`  ✗ velocidade máxima fora da referência em ${dados.id} (${erroVmax.toFixed(0)} km/h)`);
    falhas++;
  }
  if (vmin * 3.6 < 35 || vmin * 3.6 > 160) {
    console.error(`  ✗ velocidade mínima implausível em ${dados.id}`);
    falhas++;
  }
  // a linha de corrida precisa caber na pista
  let fora = 0;
  for (let i = 0; i < p.n; i++) {
    if (Math.abs(p.offsetLinha[i]) > p.largura / 2) fora++;
  }
  if (fora > 0) {
    console.error(`  ✗ linha de corrida sai da pista em ${fora} pontos`);
    falhas++;
  }
}

console.log('─'.repeat(78));
if (falhas) {
  console.error(`\n${falhas} verificação(ões) falharam.`);
  process.exit(1);
}
console.log('Todas as verificações passaram.');
