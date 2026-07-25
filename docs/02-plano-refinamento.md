# Plano de trabalho — refinamento visual

Objetivo: aproximar o jogo do realismo, com foco em carro, pista, câmera,
efeitos e sensação de velocidade.

## Fase 0 — Painel técnico

Cinco especialistas convocados, cada um com um recorte que não se sobrepõe:

| Especialista | Recorte |
|---|---|
| Modelagem de superfícies | Como sair da geometria de caixas: seções poligonais, lofting, chanfros, normais |
| Sensação de velocidade | A hierarquia real da percepção de velocidade e o que amplifica cada fator |
| Sistema de câmera | Spring arm, tratamento de oclusão, damping por eixo, retração e retorno |
| Shaders e efeitos | Motion blur radial, tone mapping, bloom barato, heat haze, partículas suaves |
| Level art de circuitos | O que falta num circuito, densidade de cenário, transições, assinatura de cada pista |

## Fase 1 — Câmera

O problema mais concreto relatado: **em túnel, entre muros e em curva fechada o
carro desaparece**. A câmera fica atrás do carro na direção da mira e, quando
isso a coloca dentro de geometria, o jogador perde a referência.

1. Sistema de braço com **retração por oclusão**: quando a posição desejada cai
   fora dos limites da pista ou dentro de um muro, o braço encurta até achar
   espaço livre.
2. **Retorno assimétrico**: retrai depressa (o jogador não pode ficar sem ver o
   carro nem por um quadro) e volta devagar (para não dar solavanco).
3. Histerese, para a câmera não oscilar entre retraída e estendida.
4. Câmera base um pouco mais afastada, já que a retração cobre os casos ruins.
5. Comportamentos por momento: largada, frenagem forte, impacto.

## Fase 2 — Legibilidade

1. **Fantasma translúcido e claro**, para não competir com a pista à frente nem
   esconder a trajetória.
2. Garantir contraste do carro do jogador contra qualquer fundo.

## Fase 3 — Carro

Sair da geometria de caixas:

1. **Seções poligonais** de 8 a 12 vértices no lugar de retângulos — um F1 não
   tem seção transversal retangular em lugar nenhum.
2. **Lofting** entre seções: casca contínua em vez de prismas empilhados.
3. **Normais suaves** na carroceria e **arestas vivas** nas asas e placas.
4. Pneus com ombro arredondado e flanco abaulado.
5. Detalhes que o olho procura: suspensão, entradas de ar, escapamento.

## Fase 4 — Sensação de velocidade

1. **Motion blur radial** num único passe, com o centro protegido.
2. **Fluxo óptico**: objetos próximos passando pela lateral valem mais que
   qualquer efeito de tela.
3. **Amplificação na frenagem**: o contraste entre reta e curva é o que faz
   sentir a velocidade que se tinha.
4. Áudio: vento, doppler, timbre por rotação.

## Fase 5 — Pista

1. Catch fence, marshal posts, painéis de publicidade abstratos.
2. Marbles fora da linha, marcas de travamento nas zonas de frenagem.
3. Transições sujas entre asfalto, grama e brita — na realidade não são retas
   perfeitas.
4. Variação de terreno: taludes e desníveis em vez de mesa plana.
5. **Assinatura visual de cada circuito**, para Interlagos não parecer Monza com
   outra forma.

## Fase 6 — Validação

Suíte completa, orçamento de quadro medido, teste em produção e publicação.

---

## Princípio de corte

Cada item entra só se passar em dois testes: **melhora perceptível numa tela de
celular** e **cabe no orçamento de 60fps**. Efeito que o jogador percebe
conscientemente como efeito é poluição, não realismo.
