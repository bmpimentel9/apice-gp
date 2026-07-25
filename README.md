# ÁPICE GP

Um jogo de Fórmula 1 feito para ser jogado **com o iPhone em pé**, no navegador.

> O ápice é o ponto da curva onde o piloto passa mais perto do interior — o
> instante exato em que a volta é ganha ou perdida.

**Jogue:** https://apice-gp.vercel.app

---

## O que é

Dois modos, um verbo só:

- **Volta Rápida** — você, o cronômetro e o seu próprio fantasma. Delta ao vivo,
  tempos de setor e quatro medalhas calculadas sobre o tempo teórico ótimo do
  circuito.
- **GP Completo** — classificação, largada com as cinco luzes, 19 adversários,
  degradação de pneu, parada obrigatória, safety car e Overtake Mode.

Seis circuitos com traçado e elevação reais, sob nomes de homenagem.

## Como se joga

**O carro segue o traçado. Você decide o freio.**

Essa é a decisão central, e ela veio de uma versão anterior que não funcionava:
com o volante nas mãos do jogador, o carro saía na primeira curva e o jogo era
injogável em retrato. Pedir que alguém mantenha um F1 na pista com o polegar
*e* acerte o ponto de frenagem é pedir duas coisas difíceis ao mesmo tempo.

Então o polegar deixou de ser volante e virou **posição na pista** — escolher a
linha, atacar por dentro, defender por fora. E toda a habilidade foi para o
freio:

- **Frear tarde demais** faz o carro correr largo e perder a curva.
- **Frear cedo demais** custa velocidade que não volta. Nos testes, isso sai por
  até 5 segundos por volta.
- **Não frear** custa de 2 a 13 segundos, dependendo do circuito.
- **Soltar devagar** transfere carga à frente e dá rotação extra na entrada —
  trail braking, com um botão só.

O botão de freio acende e cresce conforme a curva se aproxima, e a cada curva o
jogo dá a nota: *perfeito*, *bom*, *tarde demais*, *cedo demais*. Não existe
tutorial: o botão é o professor.

Três níveis: **Automático** (o traçado é todo do carro), **Assistido** (você
corrige) e **Piloto** (volante direto, sem rede).

Um aviso de curva estilo rali — chevron numerado por severidade — aparece
segundos antes de a curva entrar em tela. Em retrato, prever vale mais que
enxergar.

## Autenticidade 2026

O regulamento mudou, e o jogo acompanha:

| | |
|---|---|
| **Sem DRS** | Foi substituído por aerodinâmica ativa: *Straight Mode* nas retas, *Corner Mode* nas curvas — automático, para não gastar um segundo polegar |
| **Overtake Mode** | +0,5 MJ ≈ +67 cv, liberado só a menos de 1 s do carro à frente |
| **768 kg** | Peso mínimo da nova geração |
| **760 kW** | ~1019 cv combinados, divisão 50/50 térmico-elétrico |
| **Ar sujo** | O carro 2026 retém mais de 80% do downforce atrás de outro — bem menos punitivo que nas gerações anteriores |

Constantes marcadas `[R]` em `src/game/sim/constants.ts` vêm do regulamento e
foram confirmadas em fonte; as marcadas `[E]` são estimativas de engenharia
calibradas para o jogo.

## Desafie alguém por link

Sua melhor volta vira uma **URL**. O fantasma inteiro cabe no link — sem
cadastro, sem servidor, sem banco de dados.

O truque: em vez de gravar posições no mundo a cada intervalo de tempo, o jogo
grava **o tempo e o deslocamento lateral a cada 20 metros de pista**. Como o
traçado já é conhecido dos dois lados, a posição é reconstruída a partir dele.
Uma volta de Interlagos ocupa 656 bytes.

## Como foi construído

Escrito integralmente pelo **Claude Opus 5**, do estudo de público ao deploy.

Antes de uma linha de código: pesquisa com cinco especialistas (audiência de F1,
plataforma iOS, design de corrida em retrato, simulação 2026 e direção de arte) e
dez iterações de crítica documentadas em [`docs/`](docs/).

### Decisões que valem registro

**A física lateral foi trocada no meio do caminho.** O modelo bicicleta completo,
com deriva de pneu, é fisicamente correto — e ingovernável com um polegar: saturar
o pneu traseiro realimenta o próprio escorregamento, e o carro roda a cada
inversão de volante. O modelo final mantém toda a parte longitudinal com forças
reais (motor, arrasto, downforce, círculo de atrito) e comanda a trajetória por
curvatura limitada pelo envelope físico. O trail braking sobreviveu intacto:
frear transfere carga à frente, o que aumenta a curvatura disponível.

**Nada de bloom multi-passe.** A pista inteira é uma malha por material com a
iluminação assada nas cores dos vértices — três draw calls. O pós-processamento
é um único passe. O orçamento é de 60 draw calls e 40 mil triângulos por quadro,
e o jogo baixa a qualidade sozinho se o quadro médio passar de 20 ms.

**Física a 120 Hz com timestep fixo.** O mesmo jogo roda a 60 Hz num iPhone comum
e a 120 Hz num ProMotion. Ninguém ganha tempo de volta por ter aparelho melhor.

## Testes

```bash
npm run test          # suíte completa
npm run test:pistas   # traçados vs. tempos e velocidades reais
npm run test:fisica   # o piloto virtual completa voltas em todos os circuitos
npm run test:fantasma # ida e volta do fantasma pela URL
npm run test:assistencia # o carro dá a volta sozinho e o freio decide o tempo
npm run test:browser  # Chrome headless: render, WebGL e dirigibilidade
npm run test:gp       # largada, IA e classificação
```

Os traçados se validam contra a realidade: Interlagos sai anti-horário com reta
de 600 m, a reta de Monza tem 1.176 m, o raio mínimo do Principado é 9,8 m (a
curva mais lenta da F1) e Ardenas tem 62 m de desnível.

## Rodando localmente

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # exporta estático em out/
```

## Créditos e licença

Geometria dos traçados derivada de
[bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT),
reamostrada, suavizada e reescalada; elevação autoral.

Equipes, pilotos e nomes de circuito são **fictícios**. Nenhuma marca real é
utilizada, nenhum logotipo, nenhuma fonte proprietária e nenhuma gravação de som
— o motor é sintetizado em tempo real por WebAudio.

Código sob licença MIT.
