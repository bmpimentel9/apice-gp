/**
 * Teste de fumaça no navegador de verdade.
 *
 * Abre o jogo num Chrome headless em viewport de iPhone, começa a corrida,
 * dirige por alguns segundos e verifica que: não há erro no console, o WebGL
 * inicializou, o carro andou de fato e a taxa de quadros é aceitável.
 *
 * Testar física em Node não prova que o jogo funciona — só isto prova.
 */
import puppeteer from 'puppeteer-core';

const URL = process.env.URL ?? 'http://localhost:4321/';
const CHROME = '/opt/google/chrome/chrome';

const erros = [];
const avisos = [];

const navegador = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    // habilita WebGL por software no headless
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage',
  ],
});

try {
  const pagina = await navegador.newPage();
  // iPhone 15 Pro em retrato
  await pagina.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  pagina.on('console', (m) => {
    const t = m.type();
    if (t === 'error') erros.push(m.text());
    else if (t === 'warning') avisos.push(m.text());
  });
  pagina.on('pageerror', (e) => erros.push(`PAGEERROR: ${e.message}`));

  console.log(`→ abrindo ${URL}`);
  await pagina.goto(URL, { waitUntil: 'networkidle0', timeout: 45000 });

  // a tela inicial precisa aparecer
  await pagina.waitForFunction(
    () => document.body.innerText.includes('ÁPICE'),
    { timeout: 15000 },
  );
  console.log('✓ tela inicial renderizou');

  // instrumenta o loop para medir quadros
  await pagina.evaluate(() => {
    window.__quadros = 0;
    const orig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => orig((t) => { window.__quadros++; cb(t); });
  });

  // clica em "CORRER AGORA"
  const botao = await pagina.evaluateHandle(() => {
    const bs = [...document.querySelectorAll('button')];
    return bs.find((b) => /CORRER AGORA|ACEITAR DESAFIO/i.test(b.textContent ?? ''));
  });
  if (!botao || !(await botao.asElement())) throw new Error('botão inicial não encontrado');
  await botao.asElement().click();
  console.log('✓ corrida iniciada');

  await new Promise((r) => setTimeout(r, 1600));

  // WebGL precisa ter inicializado
  const temWebGL = await pagina.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return false;
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  });
  if (!temWebGL) throw new Error('contexto WebGL não inicializou');
  console.log('✓ WebGL ativo');

  // O jogo começa lançado no treino livre. Sem comando nenhum o carro sai na
  // primeira curva — o que é o comportamento correto — então o teste precisa
  // DIRIGIR de verdade: usa o piloto virtual do próprio jogo como referência,
  // amostrando a velocidade ao longo do trajeto.
  const antes = await pagina.evaluate(() => window.__quadros);
  const amostras = await pagina.evaluate(async () => {
    const jogo = window.__jogo;
    if (!jogo) return null;
    const vs = [];
    const inicio = performance.now();
    // pilota com um controlador mínimo: segue a linha de corrida da pista
    const timer = setInterval(() => {
      const c = jogo.estadoCarro;
      const pista = jogo.pistaAtual;
      const iMira = Math.floor((((c.s + 30) % pista.comprimento) / pista.comprimento) * pista.n);
      const off = pista.offsetLinha[iMira];
      const ax = pista.px[iMira] + pista.nx[iMira] * off;
      const az = pista.pz[iMira] + pista.nz[iMira] * off;
      let erro = Math.atan2(ax - c.x, az - c.z) - c.yaw;
      while (erro > Math.PI) erro -= Math.PI * 2;
      while (erro < -Math.PI) erro += Math.PI * 2;
      jogo.entrada.estado.direcao = Math.max(-1, Math.min(1, erro * 2.2));
      vs.push(c.velocidade * 3.6);
    }, 50);
    await new Promise((r) => setTimeout(r, 4000));
    clearInterval(timer);
    return { vs, dur: (performance.now() - inicio) / 1000, volta: jogo.estadoCarro.volta, s: jogo.estadoCarro.s };
  });
  const depois = await pagina.evaluate(() => window.__quadros);

  const hud = await pagina.evaluate(() => {
    const txt = document.body.innerText;
    const tempo = txt.match(/(\d+\.\d{3})/);
    return { tempo: tempo ? parseFloat(tempo[1]) : -1 };
  });
  hud.vel = amostras ? Math.round(Math.max(...amostras.vs)) : -1;
  const avanco = amostras?.s ?? 0;

  const dtSeg = 4.0;
  const fps = (depois - antes) / dtSeg;
  console.log(`✓ ${fps.toFixed(0)} quadros/s (software rendering; num aparelho real é muito maior)`);
  console.log(`✓ velocidade máxima atingida: ${hud.vel} km/h`);
  console.log(`✓ avanço na pista: ${avanco.toFixed(0)} m`);
  console.log(`✓ cronômetro: ${hud.tempo}s`);

  const falhas = [];
  if (hud.vel < 120) falhas.push(`o carro não acelerou como deveria (máx ${hud.vel} km/h)`);
  if (avanco < 150) falhas.push(`o carro quase não avançou na pista (${avanco.toFixed(0)} m)`);
  if (hud.tempo <= 0) falhas.push('o cronômetro não avançou');
  if (fps < 5) falhas.push(`taxa de quadros baixa demais mesmo para software (${fps.toFixed(1)})`);

  // erros de console que importam
  const relevantes = erros.filter((e) =>
    !/favicon|Download the React DevTools|WebGL.*deprecat|Extension/i.test(e));
  if (relevantes.length) {
    falhas.push(`${relevantes.length} erro(s) de console`);
    for (const e of relevantes.slice(0, 8)) console.error(`  ✗ ${e.slice(0, 220)}`);
  }

  await pagina.screenshot({ path: 'captura-jogo.png' });
  console.log('✓ captura salva em captura-jogo.png');

  if (falhas.length) {
    console.error('\nFALHAS:');
    for (const f of falhas) console.error(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log('\nTudo certo: o jogo abre, renderiza e é dirigível.');
  }
} catch (e) {
  console.error(`✗ ${e.message}`);
  if (erros.length) {
    console.error('Erros de console:');
    for (const x of erros.slice(0, 10)) console.error(`  ${x.slice(0, 240)}`);
  }
  process.exitCode = 1;
} finally {
  await navegador.close();
}
