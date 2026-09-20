# Plano de ação — ÁPICE GP

**Data:** 20/09/2026
**Base:** `main` em `a26af2b` (carro por lofting + orçamento de quadro medido)
**Objetivo:** fechar o que a v1 prometeu e ainda não entrega, e só então expandir.

Este documento substitui `docs/02-plano-refinamento.md` como fila de trabalho.
O plano visual (câmera, lofting, motion blur, cenário procedural) já entrou no
código. O que falta agora é **jogo**, não polígono.

---

## 1. Onde o jogo está

A v1 listada na iteração 10 está **quase** no ar: motor 3D, seis circuitos,
volta rápida com fantasma por URL, GP com 19 IAs, HUD, PWA, áudio sintetizado,
física 2026. Os testes de traçado, física, assistência e fantasma existem e
passam a ser a rede de segurança de qualquer mudança.

O loop central (o carro segue a linha, o polegar escolhe a posição, o freio
decide o tempo) está certo e **não deve ser reaberto**. Toda melhoria abaixo
parte dessa decisão.

O que o jogador encontra hoje, porém, não coincide com várias decisões já
arbitradas nas iterações 3–5 e no corte da v1. O plano trata isso como dívida
de produto, não como ideia nova.

---

## 2. Diagnóstico: o que está quebrado vs. o que foi prometido

Cada item aponta o arquivo e a decisão original. Sem isso vira lista de desejos.

### 2.1 A primeira tela pede um toque a mais

**Decisão (iteração 5):** a rota `/` carrega Interlagos com o carro já andando.
Zero toques até o carro rolar. O menu é o segundo destino.

**Hoje:** `TelaInicial` em `src/app/page.tsx` é um splash. O canvas só recebe
`Jogo` depois de "CORRER AGORA". O primeiro frame não é o carro — é um cartaz.

**Impacto:** o link do WhatsApp cai numa tela de marketing, exatamente o que a
iteração 5 quis evitar.

### 2.2 A largada não é jogável

**Decisão (iteração 4):** cinco luzes, retenção 0,2–3,0 s, queima abaixo de
0,1 s. O toque na largada é um verbo.

**Hoje:** `Sessao.registrarLargadaJogador()` e `Jogo.tocarLargada()` existem.
Ninguém os chama. O HUD desenha as luzes com `pointer-events: none`. O jogador
assiste a largada; não disputa.

### 2.3 O jogador não para nos boxes

**Decisão (v1):** parada obrigatória, dois compostos, degradação acelerada.
A narrativa do GP é largada → stint → janela de pit → undercut → defesa.

**Hoje:** a IA para (`Sessao.atualizar`). O jogador largue sempre no macio,
`parouJogador` vai `false` na classificação, e não existe verbo de box. O GP
vira uma volta rápida longa com carros à frente.

### 2.4 A classificação não alimenta o grid

**Decisão (iteração 0, §4.1):** a classificação de um GP *é* a volta rápida.
Treinar volta rápida melhora a posição de largada.

**Hoje:** `ModoSessao` inclui `'classificacao'`, mas o menu só oferece treino,
volta rápida e corrida. Todo GP larga o jogador em P8, hardcoded em
`Jogo.carregar`.

### 2.5 Acessibilidade prometida e não ligada

**Decisão (iteração 3):** modo de dois botões para quem não se adapta ao
arraste; layout canhoto.

**Hoje:** `prefs.modoBotoes` é lido, copiado para `Entrada.config` e **nunca
consultado** em `input.ts`. Não aparece em Ajustes. Canhoto funciona.

### 2.6 Reiniciar e pausar são invisíveis

**Decisão (iteração 5):** repetir uma volta = um toque, sem recarregar cena,
abaixo de 2 s.

**Hoje:** `Jogo.repetir()` existe e a volta rápida se reinicia sozinha ao
completar. Não há botão visível de restart. O botão de menu está em
`opacity: 0.001` — só quem sabe onde tocar pausa.

### 2.7 Overtake Mode não comunica estado

A barra de energia existe. O botão OVERTAKE é estático. O HUD tem
`overtakePronto` e `overtakeAtivo` e não os usa no botão. O jogador não vê se
está a menos de 1 s, se a carga chegou, se o modo está disparado.

### 2.8 Safety car dura tempo de relógio, não voltas

`SC_DURACAO_VOLTAS = 2`, mas `voltasSafetyCar -= dt / 60`. Dois “minutos”
fixos, iguais em Interlagos e em Spa. Em pista curta o SC vira a prova; em
pista longa mal aparece. A chance por volta (`SC_CHANCE_POR_VOLTA * dt / 60`)
tem o mesmo desenho dúbio.

---

## 3. O que NÃO reabrir

Já está bom o bastante. Mexer aqui é regressão disfarçada de polish.

| Peça | Por quê |
|---|---|
| Traçado assistido + freio como verbo | É o jogo. Qualquer segundo polegar (acelerador, DRS manual) reabre a iteração 3 |
| Física longitudinal + curvatura limitada | O modelo bicicleta completo já foi tentado e descartado |
| Fantasma por URL sem servidor | Cabe, circula, não precisa de backend |
| Equipes/circuitos fictícios | Risco de marca, já arbitrado |
| Três draw calls da pista, um passe de pós | Orçamento de iPhone. Bloom multi-passe continua proibido |
| Timestep 120 Hz | Paridade entre aparelhos |
| Corte da iteração 10: chuva, replay navegável, leaderboard com servidor | Continuam fora até o GP ser jogável de verdade |

**Teste de corte (herdado do plano visual):** entra só se melhorar numa tela
de celular *e* caber em 60 fps. Efeito que o jogador percebe como efeito é
poluição.

---

## 4. Fases

Cada fase tem um resultado jogável. Não misturar “fechar o GP” com “novo
circuito”. Estimativa em esforço relativo (S / M / L), não em calendário.

### Fase A — Fechar a v1 (bloqueante)

O jogo passa a cumprir o que o README já descreve. Sem isso, expandir é
construir em cima de um GP de fachada.

#### A1. Arranque em movimento
**Esforço:** S · **Arquivos:** `src/app/page.tsx`, `src/game/core/game.ts`

- Instanciar `Jogo` no mount, carregar Autódromo Paulista em treino, carro já
  rolando (`u = 42`, como o treino já faz).
- Overlay de marca some no primeiro toque (ou sozinho em ~1,5 s), sem bloquear
  o canvas.
- Link de desafio (`?c=&t=&g=`) continua tendo prioridade: nesse caso a pista
  do desafio carrega em volta rápida, parado no grid, com o fantasma visível.
- Aceite: da abertura ao carro andando, zero toques. `test:browser` cobre o
  caminho.

#### A2. Largada como verbo
**Esforço:** S · **Arquivos:** `src/app/hud.tsx`, `src/app/page.tsx`, `src/game/core/game.ts`

- Toque em qualquer lugar da metade inferior durante `fase === 'luzes'` chama
  `tocarLargada()`.
- Feedback imediato: “QUEIMOU +5s” ou tempo de reação em milissegundos.
- Aceite: `scripts/teste-gp.mjs` dispara um toque nas luzes e verifica
  `tempoReacao !== null`.

#### A3. Parada do jogador
**Esforço:** M · **Arquivos:** `src/game/core/game.ts`, `src/game/sim/race.ts`, `src/app/hud.tsx`, `src/game/sim/car.ts`

- Um botão **BOX** aparece só na janela (voltas do meio ± 1, ou desgaste >
  0,62), no lugar do Overtake — nunca os dois ao mesmo tempo.
- Um toque: o carro entra no limitador de pit, perde ~`PIT_PERDA_TOTAL`, troca
  de composto (macio ↔ duro, o outro obrigatório). Sem menu de estratégia.
- Sem parar até a última volta: penalidade de +10 s (ou bandeira preta
  esportiva — tempo extra, não tela de game over).
- Aceite: teste de sessão em que o jogador não para e a classificação aplica a
  penalidade; outro em que para e o composto muda.

#### A4. Grid a partir da volta rápida
**Esforço:** S · **Arquivos:** `src/app/page.tsx`, `src/game/core/game.ts`, `src/game/core/storage.ts`

- Ao tocar GP COMPLETO, a posição de largada sai do recorde local vs. o tempo
  teórico (medalhas já definem a faixa): Pole → P1–P2, Ouro → P3–P6, Prata →
  P7–P10, Bronze → P11–P14, sem recorde → P15.
- Não precisa de uma sessão separada de classificação. A volta rápida já é a
  classificação, como a iteração 0 pediu.
- Aceite: gravar um recorde Pole e verificar `posJogador <= 2` no próximo GP.

#### A5. Pause, restart e modo botões
**Esforço:** S · **Arquivos:** `src/app/page.tsx`, `src/app/hud.tsx`, `src/game/core/input.ts`

- Botão de pause visível (44 pt, terço superior, opacidade real).
- Restart: um toque no resultado da volta *e* um gesto “↻” no HUD de volta
  rápida / treino. Usa `Jogo.repetir()`, não recarrega a cena.
- Ajustes: toggle “Dois botões” que implementa esquerda/direita no lugar do
  arraste (`modoBotoes` deixa de ser campo morto).
- Aceite: o toggle altera o esquema no mesmo frame; canhoto continua
  espelhando.

**Saída da fase A:** o README deixa de mentir. Volta rápida é instantânea. GP
tem largada, box e grid merecido.

---

### Fase B — O loop da volta rápida ficar viciante

A volta rápida é a porta de entrada. Cada segundo morto e cada informação que
o jogador não vê matam o “só mais uma”.

#### B1. Setores ao vivo
**Esforço:** S · **Arquivos:** `src/app/hud.tsx`, `src/game/core/game.ts`

- Três mini-tempos sob o cronômetro, verdes/vermelhos contra o fantasma.
- `setoresParciais` já são gravados; só faltam na HUD.
- Aceite: completar o S1 mostra o parcial sem esperar a volta.

#### B2. Estado do Overtake e do freio
**Esforço:** S · **Arquivos:** `src/app/hud.tsx`

- Botão OVERTAKE: opaco se bloqueado, pulso roxo se `overtakePronto`, preenchido
  se `overtakeAtivo`.
- Anel do freio já cresce; acrescentar um marcador de “ponto” (o instante em
  que `atrasado` vira true) para o olho fechar o loop com a nota PERFEITO/TARDE.
- Aceite: a menos de 1 s de um rival, o botão muda sem texto extra.

#### B3. Fantasma legível
**Esforço:** S · **Arquivos:** `src/game/render/car3d.ts`, `src/game/render/scene.ts`

- Fantasma translúcido (fase 2 do plano visual, ainda aberta): alpha ~0,45,
  sem partículas, sem luz de chuva. Não compete com a pista à frente.
- Aceite: em Corniche à noite o fantasma continua visível; em Paulista à tarde
  não tapa o apex.

#### B4. Coleção de medalhas por circuito
**Esforço:** M · **Arquivos:** `src/game/core/storage.ts`, `src/app/page.tsx`

- O menu de circuitos mostra bronze/prata/ouro/pole conquistados, não só o
  recorde numérico.
- Compartilhar o fantasma continua um toque; o texto do share inclui a medalha.
- Aceite: um recorde Ouro marca o circuito sem apagar o Bronze.

#### B5. Dica contextual de primeira sessão
**Esforço:** S · **Arquivos:** `src/app/hud.tsx`, `src/game/core/storage.ts`

- `vezesJogadas === 1`: uma frase sob o freio (“o carro segue a linha — você
  decide o ponto”) que some na primeira nota de curva.
- Nunca mais volta. Sem tutorial, sem skip.
- Aceite: na segunda partida a frase não existe no DOM.

**Saída da fase B:** o jogador entende o verbo em uma volta, vê o progresso,
manda o link.

---

### Fase C — O GP parecer uma corrida

Só depois de A e B. Sem box e sem largada, polish de IA é teatro.

#### C1. Safety car em voltas de pista
**Esforço:** S · **Arquivos:** `src/game/sim/race.ts`

- Decrementar `voltasSafetyCar` quando o líder completa volta, não com `dt/60`.
- Sorteio: no máximo um SC por prova, nunca na primeira nem na última volta.
- Aceite: teste determinístico com RNG fixo cobre “disparou” e “durou 2 voltas
  do líder”.

#### C2. Corpos na pista
**Esforço:** M · **Arquivos:** `src/game/sim/car.ts`, `src/game/core/game.ts`, `src/game/sim/race.ts`

- O jogador colide com rivais a menos de ~6 m (empurrão + perda de u, sem
  explosão). Hoje os carros se atravessam.
- IA já evita gap < 6 m entre si; o jogador precisa do mesmo respeito.
- Aceite: enconstar por dentro num rival reduz velocidade de forma visível e
  não teleporta os dois.

#### C3. Resultado de GP que conta história
**Esforço:** S · **Arquivos:** `src/app/page.tsx`, `src/game/sim/race.ts`

- Tela final: posição de largada vs. chegada, melhor volta destacada, se parou,
  se levou SC, penalidades.
- Sem isso o P8 → P8 não ensina nada.
- Aceite: um GP com box e uma penalidade mostra as duas linhas.

#### C4. Ritmo da IA na largada
**Esforço:** S · **Arquivos:** `src/game/sim/race.ts`

- Os rivais hoje partem de `velocidade: 0` e interpolam rumo ao perfil ótimo
  com constante 0,6 s — o grid “escorre” em vez de disparar.
- Ramp-up de 1,2–1,8 s com ruído por piloto, para o jogador ter com quem
  brigar na curva 1.
- Aceite: 3 s após as luzes, o pelotão ainda está agrupado (desvio de
  distância < 80 m no Paulista).

**Saída da fase C:** uma prova de 6–8 min tem largada, briga, janela de box,
possível SC e um resultado que se lê.

---

### Fase D — Identidade e sensação (o que restou do plano visual)

Só o que passa no teste de celular. Nada de geometria que some a 12 cm.

#### D1. Assinatura por circuito
**Esforço:** M · **Arquivos:** `src/game/render/scenery.ts`, `src/game/render/palette.ts`, `src/game/data/tracks.ts`

Paulista e Templo compartilham a mesma verde `#2F6A38`. O cenário só distingue
`urbano` (Principado/Corniche) do resto. Falta o que a fase 5 do plano visual
pediu:

| Circuito | Assinatura mínima (barata) |
|---|---|
| Paulista | lago no miolo, arquibancada alta na reta, gramado quente de fim de tarde |
| Principado | prédios colados, yachts no porto, muro contínuo |
| Templo | parque, árvores altas, retas com placas de 150/100/50 |
| Corniche | mar, reflexo, luzes, muro |
| Oito | floresta, ponte da figura-8 |
| Ardenas | desnível visível nas laterais, árvores densas, céu baixo |

Aceite: screenshot lado a lado, sem HUD — um fã aponta a pista em 2 s.

#### D2. Fluxo óptico perto do carro
**Esforço:** S · **Arquivos:** `src/game/render/scenery.ts`, `src/game/render/world.ts`

- Postes, cones e placas de frenagem mais densos nos 8 m laterais. Velocidade
  percebida vem do que passa *perto*, não do blur.
- Marcas de travamento só nas zonas em que `velocidadeOtima` cai > 25% em
  80 m.
- Aceite: orçamento de quadro no Paulista continua ≤ 40k tris / 60 draws
  (já medido no render). Se estourar, cortar densidade, não qualidade de pós.

#### D3. Áudio da frenagem
**Esforço:** S · **Arquivos:** `src/game/core/audio.ts`

- Trail braking é o skill; o som hoje trata derrapagem e motor, pouco o
  transfer de carga.
- Um hiss de abs curto quando `travandoRodas`, e o motor caindo de tom mais
  rápido do que a velocidade (já há rpm). Sem sample, só oscilador.
- Aceite: jogável mudo continua verdadeiro — nenhum dado novo só no som.

**Saída da fase D:** cada pista tem cara; 300 km/h não parece 100 km/h.

---

### Fase E — Depois. Não agora

Revalida o corte da iteração 10. Entra só se A–C estiverem no ar e o “só mais
uma volta” estiver comprovado (gente mandando link sem ser pedida).

| Item | Por que espera |
|---|---|
| Chuva com linha seca | Shader + física + IA. Mata 60 fps antes de matar tédio |
| Campeonato de temporada | Precisa de resultado de GP que conte (C3) e de motivo para voltar além do recorde |
| Replay navegável | O fantasma já é o replay que cabe no bolso |
| Leaderboard com servidor | Mata a premissa “sem cadastro, sem backend”. Se um dia entrar, é opt-in |
| Novos circuitos | Seis já cobrem o arco (rua, park, night, elevation, figure-8). Sétimo é conteúdo, não jogo |
| C1–C5 reais | Três compostos já cruzam numa prova de 8–12 voltas. Cinco pedem UI que o polegar não tem |

---

## 5. Dívida técnica que atravessa as fases

Não é fase própria: entra no PR da funcionalidade que toca o arquivo.

| Dívida | Onde | Quando pagar |
|---|---|---|
| `docs/02-pesquisa.md` citado em `constants.ts` e inexistente | `src/game/sim/constants.ts` | A1, no mesmo PR que mexer em constantes, ou um PR só de docs |
| `npm test` não roda `test:browser` nem `test:gp` | `package.json` | A2 (GP) e A1 (browser) |
| Qualidade cai um degrau só (1,0 → 0,62) | `game.ts` `medirDesempenho` | D2, se o cenário novo estourar frame |
| Persistência em `localStorage`, não IndexedDB | `storage.ts` | B4, quando medalhas aumentarem o payload — o fantasma ainda cabe |
| HUD com `onFreioDown/Up/Overtake` vazios; o toque vive em regiões do canvas | `page.tsx`, `input.ts` | A2/A5, ao ligar largada e botões. Unificar hit-test com o visual |
| Tipografia do README (Titillium/Rajdhani) não está no CSS | `globals.css`, `layout.tsx` | D1, se a identidade visual for o tema do PR |
| Open Graph sem imagem | `layout.tsx` | B4, junto do share |

Regra: um PR de feature não “aproveita” para reescrever o renderizador.

---

## 6. Ordem de execução recomendada

```
A1 arranque ─┐
A5 pause/botões ─┼─► A2 largada ─► A3 box ─► A4 grid
                 │
                 └─► B5 dica ─► B1 setores ─► B2 overtake ─► B3 fantasma ─► B4 medalhas
                                                                    │
                                                                    ▼
                                                          C1 SC ─► C4 largada IA ─► C2 corpos ─► C3 resultado
                                                                    │
                                                                    ▼
                                                          D3 áudio ─► D2 fluxo ─► D1 assinatura
```

A1 e A5 são independentes e podem ir em PRs separados no mesmo dia. A3 depende
de A5 (precisa de um botão visível). C depende de A. D pode intercalhar S-items
(D3) sem esperar o cenário inteiro.

**PRs pequenos.** Cada letra-número acima é um PR, com o teste da coluna
“Aceite”. Não empilhar A3+C2+D1 num único diff.

---

## 7. Como saber que melhorou

Não é feeling de screenshot.

1. **Primeiro link:** alguém abre no iPhone em 4G, o carro já anda, a primeira
   curva ganha uma nota. Sem menu.
2. **Volta rápida:** restart < 2 s, setores visíveis, medalha no menu, link
   do fantasma com o tempo no texto.
3. **GP:** largada com reação, box em um toque, grid merecido, resultado que
   lista o que aconteceu. Duração 6–8 min.
4. **Suíte:** `npm test` + `test:browser` + `test:gp` no CI (hoje os dois
   últimos são manuais).
5. **Frame:** Paulista e Corniche a 60 fps no iPhone não-Pro, qualidade
   caindo sozinha se passar de 20 ms — o degrau extra de D2, se precisar.

Se um item da fase E for tentador, passar por esses cinco antes.

---

## 8. Princípio que governa o resto

O ÁPICE GP existe porque o retrato forçou uma decisão: **um verbo**. Frear.

Tudo que adiciona um segundo polegar, um segundo menu, ou um segundo modo que
não reutiliza a volta rápida, é o jogo antigo voltando. O plano acima só
completa o que essa decisão já implicava — largada, box, grid, nota, fantasma —
e só então deixa a pista ficar mais bonita.
