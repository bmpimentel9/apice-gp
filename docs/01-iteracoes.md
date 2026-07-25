# Iterações 1–10 — Refinamento do projeto

Cada iteração aplica uma lente crítica diferente ao projeto e precisa produzir
uma **decisão concreta**, não uma observação. Onde os especialistas se
contradizem, o diretor arbitra e registra o porquê.

---

## Iteração 1 — Arbitragem: câmera e motor de renderização

**Conflito.** O especialista de design rejeitou top-down ("visto de cima, um F1 a
300 km/h parece um carrinho de brinquedo") e escolheu 2.5D atrás do carro. O
especialista de tecnologia recomendou PixiJS — mas partindo da premissa de que a
câmera seria top-down, que fui eu quem coloquei no briefing dele. As duas
recomendações são incompatíveis.

**Análise.** O argumento do design é decisivo porque ataca o pilar sensorial do
jogo. Sensação de velocidade não é enfeite num jogo de F1 — é o produto. Mas
aceitar a câmera baixa obriga a rever o renderizador.

**Teste decisivo.** Existe um caminho barato para câmera baixa: pseudo-3D por
segmentos (estilo OutRun / Horizon Chase), que projeta fatias da pista sem 3D
real. Aplico o teste do caso mais difícil: **a Loews de Mônaco tem raio de ~10 m**
— é a curva mais lenta da Fórmula 1. Pseudo-3D por segmentos não representa
grampos nem chicanes de 90°; a pista "dobra" sobre si mesma e a projeção quebra.
Interlagos (S do Senna), Suzuka (esses, figura-8) e Monza (chicanes) têm o mesmo
problema.

**Decisão.** **Three.js com `WebGLRenderer`, 3D real, câmera de perseguição
baixa.** PixiJS está descartado — e vale notar que o crash de VRAM no Safari iOS
levantado no relatório de tecnologia era justamente do PixiJS v8, não do
Three.js. WebGPU fica fora: cobre só iOS 26+ e tem menos de um ano de produção.

**Consequência não-óbvia:** 3D real também entrega de graça a elevação dos
circuitos. Interlagos sem a subida da reta dos boxes e Spa sem a Eau Rouge
seriam traições ao material de origem.

---

## Iteração 2 — Lente do engenheiro de performance

**Problema.** "Gráficos ricos" e "60fps num iPhone" se opõem. Orçamento por
quadro: 16,6 ms a 60fps, 8,3 ms a 120fps em ProMotion. Um jogo web mal
orçamentado gasta isso só em draw calls.

**Decisões (orçamento fixo, verificável):**

| Item | Regra |
|------|-------|
| Malha da pista | **Uma única mesh** (asfalto + kerbs + zebras + runoff merged) |
| Sombras | **Nenhuma sombra dinâmica.** Blob shadow por decal sob o carro |
| Bloom | **Proibido bloom multi-passe.** Glow = billboard aditivo nas fontes de luz |
| Pós-processamento | **Um único passe fullscreen**: vinheta + grading + speed lines + grain |
| Cenário | `InstancedMesh` para árvores, arquibancadas, postes |
| Névoa | Fog exponencial — esconde o corte de distância e economiza geometria |
| Teto | **≤ 60 draw calls, ≤ 40k triângulos por quadro** |
| IA | Física completa só nos rivais a menos de 1,5 s. O resto é posição interpolada |

**Degradação automática:** se o quadro médio passar de 20 ms por 2 segundos, o
jogo derruba qualidade em degraus (partículas → pós-processamento → densidade de
cenário → resolução), sem avisar o jogador.

---

## Iteração 3 — Lente do crítico de controle

O slider relativo tem três falhas que o parecer original não cobriu:

1. **O dedo sai da tela.** Sem tratamento, o carro trava no último ângulo e bate.
   → `pointercancel`/`pointerleave` devolvem a direção ao centro em 200 ms.
2. **Deriva do ponto-zero.** Arrastes sucessivos na mesma direção esgotam o
   curso. → O ponto-âncora re-ancora quando o curso satura, preservando o ângulo.
3. **Canhotos.** O freio fixo à direita exclui metade das pessoas.
   → Layout espelhável nas opções.

**Discordância registrada com o especialista de design.** Ele classificou "nunca
botão digital" como não-negociável. Eu mantenho o slider como padrão, mas
**incluo o modo de dois botões como opção de acessibilidade** — para quem tem
mobilidade reduzida no polegar ou simplesmente não se adapta, um jogo que não
oferece alternativa é um jogo que essa pessoa não joga. O padrão continua sendo o
slider.

---

## Iteração 4 — Lente do fã de F1 cético

*"Cadê o DRS?"* — Não existe. Em 2026 o DRS foi **substituído** por aerodinâmica
ativa (Straight Mode / Corner Mode) e pelo **Overtake Mode**: +0,5 MJ ≈ +67 cv,
liberado apenas a menos de 1 s do carro à frente. Confirmado com fonte.

Isso deixou de ser um detalhe e virou **o diferencial do projeto**: nenhum jogo
de F1 mobile hoje roda o regulamento 2026.

**Decisões:**
- Aero ativa é **automática** (o carro alterna sozinho reta/curva) e aparece na
  HUD — expor como segundo botão seria um toque a mais no polegar.
- Overtake Mode é o **único botão de poder**, com barra de energia que recarrega
  freando.
- Peso 768 kg + combustível; 760 kW combinados; C1–C5; dois compostos
  obrigatórios em corrida seca.
- Largada com as 5 luzes, retenção aleatória de 0,2–3,0 s, queima abaixo de 0,1 s.
- Ar sujo custa só ~18% de downforce (o carro 2026 retém mais de 80%) — bem menos
  punitivo que nos jogos da geração anterior, e isso é intencional.

---

## Iteração 5 — Lente do jogador de primeira viagem

**Problema.** O link chega pelo WhatsApp. Se a primeira tela for um menu, uma
parcela grande fecha antes de jogar.

**Decisão.** A rota `/` **não tem menu**. Ela carrega Interlagos com o carro já
rolando em treino livre, som ligando no primeiro toque, e uma única dica
contextual que some sozinha. O menu existe, mas é o segundo destino, não o
primeiro. Da abertura ao carro andando: **zero toques**.

Repetir uma volta: **um toque, sem recarregar cena, abaixo de 2 segundos** — é o
que Trackmania chama de minimizar o tempo morto, e é o que sustenta o "só mais
uma volta".

---

## Iteração 6 — Lente do advogado

- **Dados de traçado:** repositório `bacinger/f1-circuits`, **licença MIT**
  confirmada via API do GitHub. Uso livre com atribuição — creditado no README.
- **Marcas:** equipes e pilotos são fictícios. Circuitos recebem nomes homenagem.
  Nenhum logotipo, nenhuma fonte proprietária ("Formula1" é família proprietária
  real — usamos Titillium Web e Rajdhani, ambas OFL).
- **Sons:** 100% sintetizados por WebAudio. Nenhuma gravação real.

**Nomes homenagem definidos:**

| Real | No jogo | Identidade |
|------|---------|-----------|
| Interlagos | **Autódromo Paulista** | Anti-horário, subida da reta, S de entrada |
| Mônaco | **Circuito do Principado** | Muros, grampo lentíssimo, sem escapatória |
| Monza | **Templo da Velocidade** | Retas longas, chicanes, arrasto mínimo |
| Jeddah | **Corniche Noturno** | Alta velocidade entre muros, à noite |
| Suzuka | **Circuito Oito** | Esses, figura-8, técnico |
| Spa | **Ardenas** | Elevação, curvão de subida, o mais longo |

---

## Iteração 7 — Lente da acessibilidade

- **Daltonismo:** cor nunca é o único sinal. Número do carro grande, padrão de
  listra exclusivo por equipe, barra colorida redundante nos cards.
- **Enjoo de movimento:** tremor de câmera, motion blur e balanço são
  desativáveis num toggle único ("reduzir movimento"), respeitando também
  `prefers-reduced-motion`.
- **Canhotos:** HUD e controles espelháveis.
- **Uma mão:** todos os alvos de toque com no mínimo 44 pt e no terço inferior.
- **Sem áudio:** o jogo é 100% jogável mudo — nenhuma informação existe só no som.

---

## Iteração 8 — Lente de crescimento

**A ideia:** a volta rápida vira um link. O amigo abre e corre contra o seu
fantasma, sem cadastro e sem servidor.

**Restrição real:** uma volta de 60 s amostrada a 20 Hz são 1.200 quadros. Cru,
isso não cabe numa URL.

**Solução:** quantização + codificação delta + base64url. Posição em grade de
25 cm, ângulo em 8 bits, deltas na maioria dos quadros cabendo em 1 byte.
Estimativa: **600–900 bytes → ~1.000–1.200 caracteres de URL** — dentro do que
WhatsApp e iMessage preservam.

**Degradação:** se ainda assim estourar, o link cai para "desafio de tempo"
(tempo + 3 splits, ~40 caracteres), que funciona sempre.

---

## Iteração 9 — Lente do engenheiro de iOS

Checklist derivado das 10 armadilhas, tudo obrigatório:

1. `viewport-fit=cover` + `env(safe-area-inset-*)` + `100dvh` (nunca `100vh`).
2. Física em timestep fixo com acumulador; render interpolado. Nunca assumir 60fps.
3. `touch-action: none` no canvas + `preventDefault()` em `touchmove` (CSS
   sozinho não segura o bounce do iOS).
4. `screen.orientation.lock()` **vai falhar** no iPhone — overlay "gire o
   aparelho" como plano A, não plano B.
5. Áudio destravado no primeiro gesto + elemento silencioso contínuo para o
   `AudioContext` ignorar o botão de silencioso.
6. Listener de `AudioContext` travado em `interrupted` após ligação/bloqueio,
   com recriação do contexto como fallback.
7. `navigator.wakeLock` com **reaquisição** em `visibilitychange`.
8. IndexedDB + `navigator.storage.persist()`.
9. Háptico é *enhancement*, nunca crítico — a Vibration API não existe no iOS
   Safari e o truque do `switch` está instável em 2026.
10. `headers()` manual para cache imutável em `/public` (a Vercel só faz isso
    automaticamente em `_next/static`).

---

## Iteração 10 — Lente do diretor: corte de escopo

Tudo que foi aprovado acima cabe? Não, se tentarmos entregar de uma vez. Corte:

**Entra na v1 (obrigatório para o projeto ser considerado pronto):**
- Motor 3D, câmera baixa, física completa com regulamento 2026
- Os 6 circuitos com elevação
- Volta Rápida com fantasma, delta ao vivo, splits e medalhas
- GP completo: classificação, largada com luzes, 19 IAs, pneus, pit obrigatório,
  Overtake Mode, safety car
- HUD, menus, resultados, persistência, PWA, áudio sintetizado
- Compartilhamento do fantasma por URL

**Fica para depois (não bloqueia a entrega):**
- Chuva dinâmica com linha seca evoluindo
- Campeonato de temporada com pontuação acumulada
- Replay navegável (a v1 tem só o fantasma)
- Leaderboard com servidor

**Princípio de corte:** nada que esteja no pedido original sai. O que sai é
extensão minha que não foi pedida.
