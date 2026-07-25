# Iteração 0 — Entendimento do pedido

**Projeto:** ÁPICE GP
**Diretor:** Claude Opus 5 (`claude-opus-5[1m]`)
**Cliente:** Bruno Pimentel
**Data:** 25/07/2026

---

## 1. O pedido literal

| # | Requisito | Status |
|---|-----------|--------|
| 1 | Jogo de Fórmula 1 | Obrigatório |
| 2 | Construído com o modelo Opus 5 | Confirmado — `claude-opus-5[1m]` |
| 3 | Jogável no iPhone e como webapp | Obrigatório |
| 4 | Deploy na Vercel, versionado no GitHub | Obrigatório |
| 5 | Gráficos ricos | Obrigatório |
| 6 | Modo Volta Rápida | Obrigatório |
| 7 | Modo GP completo | Obrigatório |
| 8 | Estudo de público e de tecnologia | Painel de 5 especialistas |
| 9 | **iPhone em pé (retrato)** | Restrição estruturante |
| 10 | Feedback loop com ≥10 iterações antes de executar | Este documento é a iteração 0 |

## 2. A restrição que define o projeto

**Retrato.** Praticamente nenhum jogo de corrida sério é jogado em retrato,
porque a tela vertical dá pouca visão à frente — e num carro a 300 km/h, ver a
curva chegando é tudo.

Isso não é um detalhe de layout. É a decisão arquitetural nº 1: define a câmera,
o controle, a velocidade percebida, o HUD e até o traçado dos circuitos. Se
acertarmos, o jogo é original justamente por causa da limitação. Se errarmos,
nenhum gráfico salva.

A pesquisa de audiência confirma que o território está vazio: existe um gênero
inteiro de corrida em retrato (Retro Racing, Pako Highway, Traffic Rider), mas
todos são "desvio de tráfego" — **não existe hoje um jogo de F1 sério em retrato
puro**. É espaço em aberto.

## 3. Vontades implícitas (o que o pedido não diz mas quer)

**a) Isso vai ser mostrado para outras pessoas.**
"Colocar na Vercel e linkar no GitHub" não é sobre hospedagem — é sobre ter um
link para mandar no grupo do WhatsApp. Consequências que ninguém pediu mas que
são obrigatórias: carregar em menos de 3 segundos no 4G, ser jogável no primeiro
toque sem tutorial, e ter um momento de "uau" nos primeiros 10 segundos.

**b) O coração do jogo é a volta rápida, não o GP.**
Na frase do cliente, "volta mais rápida" vem antes de "GP completo". A ordem
revela a prioridade — e a pesquisa concorda: a Volta Rápida deve ser a porta de
entrada (baixa fricção, alto replay) e o GP o modo para quem já validou o loop.

**c) O cliente é fã de F1 de verdade.**
Ele vai reparar se o DRS não fizer sentido, se o pneu não degradar, se não houver
undercut. Autenticidade aqui não é enfeite — é o motivo de existir do jogo. Mas
convive com um celular em pé: precisa ser *F1 de verdade comprimida*, não
simulador.

**d) Brasileiro.** Interlagos precisa estar no jogo. O jogo é em português.

**e) "Gráficos ricos" é um medo, não um desejo.**
O medo é receber um "joguinho de navegador" com cara de 2010. O primeiro frame
precisa parecer caro.

**f) Ele vai jogar deitado no sofá, na fila, com uma mão.**
Sessão curta. Retomada instantânea. Nada de menu profundo.

**g) Ele quer ver o rigor, não só o resultado.**
Pediu especialistas e 10 iterações. O processo vai versionado no repositório.

## 4. Onde eu discordo do pedido (e o que proponho no lugar)

### 4.1 Os dois modos não devem ser separados — o GP deve *conter* a volta rápida
A classificação de um GP **é** o modo volta rápida. Mesma pista, mesmo carro,
mesmo ghost, mesma tensão. Unificar significa que todo minuto treinando volta
rápida melhora seu grid no GP. Um verbo, dois contextos, zero desperdício de
aprendizado.

### 4.2 GP curto e denso, não longo e fiel
Uma corrida de 50 voltas no celular é morte por tédio — GRID Legends já provou
que o modo longo "murcha" depois da décima corrida. Proposta: **10 voltas com
degradação acelerada e uma parada obrigatória**, calibrado para comprimir a
narrativa inteira de uma corrida real (largada → primeiro stint → janela de pit →
undercut → tráfego → defesa final) em 6 a 8 minutos.

### 4.3 Acelerador automático — a decisão mais importante do projeto
Num celular em pé, cada polegar ocupado é um custo enorme. Numa F1 real, o skill
não está em segurar o acelerador: está em **onde você freia, onde você solta e
como você pega o apex**. Tirar o acelerador do jogador não simplifica o jogo —
concentra a habilidade exatamente onde ela é interessante. (Validado pelo painel
de design na iteração 3.)

### 4.4 Nada de marcas reais de equipes e pilotos
Marcas são protegidas por *trademark*, e empresas são legalmente obrigadas a
fiscalizá-las sob pena de perdê-las — o risco é maior que em copyright, mesmo num
projeto gratuito. Prática indie recomendada: equipes e pilotos fictícios
claramente inspirados (cores, silhueta, iniciais). Nomes de circuitos são o item
de menor risco.

Decisão: **traçados fiéis e reconhecíveis, nomes homenagem, equipes fictícias.**
O fã reconhece Interlagos na primeira curva sem precisar do logotipo.

### 4.5 Uma coisa que não foi pedida: o ghost como objeto compartilhável
Seu melhor volta vira uma **URL**. O ghost inteiro codificado no link. O amigo
abre e corre contra o seu fantasma, sem cadastro, sem servidor, sem backend.
É o que transforma um jogo pessoal em algo que circula no grupo — e é
tecnicamente barato.

### 4.6 Zero gates, zero fricção
A reclamação nº 1 dos jogadores de F1 Mobile Racing, F1 Clash e Real Racing 3 é
sempre a mesma: gates de tempo, energia e pay-to-win. Mesmo sem cobrar nada, o
erro é replicável por descuido (telas de carregamento, menus, confirmações).
Regra: **da tela inicial até o carro andando, no máximo dois toques. Repetir uma
volta: um toque, menos de 2 segundos, sem loading.**

## 5. Riscos identificados

| Risco | Gravidade | Mitigação |
|-------|-----------|-----------|
| Controle em retrato ruim | **Fatal** | Protótipo do controle antes de qualquer arte |
| Performance no iPhone com gráficos ricos | Alta | Orçamento de frame fixo; degradação automática de qualidade |
| Escopo do GP (IA, estratégia, pit, safety car) | Alta | IA por modelo de tempo-alvo, não física completa |
| Áudio no iOS (unlock, silent switch) | Média | Unlock no primeiro toque; jogo 100% jogável mudo |
| Perda de dados (evicção do Safari) | Média | Recordes exportáveis via URL |
| Tempo morto entre tentativas | Média | Reinício instantâneo sem recarregar cena |

## 6. Nome

**ÁPICE GP.** O ápice é o ponto da curva onde o piloto passa mais perto do
interior — o instante exato onde a volta é ganha ou perdida. É também o auge.
Duplo sentido, curto, pronunciável, domínio disponível.
