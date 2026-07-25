/**
 * Teste do modo GP: verifica a sequência de largada, se os 19 rivais correm,
 * se a classificação muda e se o jogador não fica preso.
 */
import puppeteer from 'puppeteer-core';

const URL = process.env.URL ?? 'http://localhost:4321/';
const erros = [];

const navegador = await puppeteer.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle',
         '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});

try {
  const pagina = await navegador.newPage();
  await pagina.setViewport({ width: 393, height: 852, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  pagina.on('pageerror', (e) => erros.push(e.message));
  pagina.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });

  await pagina.goto(URL, { waitUntil: 'networkidle0', timeout: 45000 });
  await pagina.waitForFunction(() => document.body.innerText.includes('ÁPICE'), { timeout: 15000 });

  // entra pelo menu e escolhe GP COMPLETO
  await pagina.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Escolher circuito/i.test(x.textContent ?? ''));
    b?.click();
  });
  await new Promise((r) => setTimeout(r, 700));
  await pagina.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /GP COMPLETO/i.test(x.textContent ?? ''));
    b?.click();
  });
  await new Promise((r) => setTimeout(r, 1800));

  const inicial = await pagina.evaluate(() => {
    const j = window.__jogo;
    if (!j) return null;
    return {
      fase: j.sessaoAtual.estado.fase,
      rivais: j.sessaoAtual.rivais.length,
      voltas: j.sessaoAtual.estado.voltasTotais,
    };
  });
  if (!inicial) throw new Error('jogo não exposto');
  console.log(`✓ grid com ${inicial.rivais} rivais, ${inicial.voltas} voltas, fase "${inicial.fase}"`);
  if (inicial.rivais !== 19) throw new Error(`esperava 19 rivais, veio ${inicial.rivais}`);

  // espera as luzes apagarem (5 luzes + espera aleatória até 3 s)
  await pagina.waitForFunction(
    () => window.__jogo?.sessaoAtual.estado.fase === 'correndo',
    { timeout: 20000, polling: 200 },
  );
  console.log('✓ luzes apagaram e a corrida largou');

  // dirige por 12 s seguindo a linha
  const antes = await pagina.evaluate(() => {
    const j = window.__jogo;
    return { dist: j.estadoCarro.s, pos: j.sessaoAtual.rivais.map((r) => r.distancia) };
  });

  await pagina.evaluate(async () => {
    const j = window.__jogo;
    const timer = setInterval(() => {
      const c = j.estadoCarro, p = j.pistaAtual;
      const i = Math.floor((((c.s + 32) % p.comprimento) / p.comprimento) * p.n);
      const off = p.offsetLinha[i];
      const ax = p.px[i] + p.nx[i] * off, az = p.pz[i] + p.nz[i] * off;
      let e = Math.atan2(ax - c.x, az - c.z) - c.yaw;
      while (e > Math.PI) e -= Math.PI * 2;
      while (e < -Math.PI) e += Math.PI * 2;
      j.entrada.estado.direcao = Math.max(-1, Math.min(1, e * 2.2));
      // freia quando a velocidade passa muito do perfil ótimo à frente
      const iF = Math.floor((((c.s + 70) % p.comprimento) / p.comprimento) * p.n);
      j.entrada.estado.freio = c.velocidade > p.velocidadeOtima[iF] * 1.25 ? 0.7 : 0;
    }, 40);
    await new Promise((r) => setTimeout(r, 12000));
    clearInterval(timer);
    j.entrada.estado.freio = 0;
  });

  const depois = await pagina.evaluate(() => {
    const j = window.__jogo;
    const cls = j.sessaoAtual.classificacao(1000, 0, 'macio', false, false);
    return {
      dist: j.estadoCarro.s,
      vel: j.estadoCarro.velocidade * 3.6,
      rivalMoveu: j.sessaoAtual.rivais.some((r) => r.distancia > 200),
      lider: cls[0]?.nome,
      classificacaoOrdenada: cls.every((c, i) => i === 0 || cls[i - 1].distancia >= c.distancia),
      totalClassificados: cls.length,
      safety: j.sessaoAtual.estado.safetyCar,
    };
  });

  console.log(`✓ jogador a ${depois.vel.toFixed(0)} km/h`);
  console.log(`✓ rivais avançaram: ${depois.rivalMoveu}`);
  console.log(`✓ classificação com ${depois.totalClassificados} carros, ordenada: ${depois.classificacaoOrdenada}`);

  const falhas = [];
  if (!depois.rivalMoveu) falhas.push('os rivais não saíram do lugar');
  if (depois.totalClassificados !== 20) falhas.push(`classificação com ${depois.totalClassificados} em vez de 20`);
  if (!depois.classificacaoOrdenada) falhas.push('classificação fora de ordem');
  if (depois.vel < 40) falhas.push(`jogador parado (${depois.vel.toFixed(0)} km/h)`);

  const relevantes = erros.filter((e) => !/favicon|DevTools|deprecat/i.test(e));
  if (relevantes.length) {
    falhas.push(`${relevantes.length} erro(s) de console`);
    relevantes.slice(0, 5).forEach((e) => console.error(`  ✗ ${e.slice(0, 200)}`));
  }

  await pagina.screenshot({ path: 'captura-gp.png' });

  if (falhas.length) {
    console.error('\nFALHAS:');
    falhas.forEach((f) => console.error(`  ✗ ${f}`));
    process.exitCode = 1;
  } else {
    console.log('\nModo GP funcionando: largada, IA e classificação.');
  }
} catch (e) {
  console.error(`✗ ${e.message}`);
  erros.slice(0, 6).forEach((x) => console.error(`  ${x.slice(0, 200)}`));
  process.exitCode = 1;
} finally {
  await navegador.close();
}
