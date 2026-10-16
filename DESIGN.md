# Sistema visual

Como o Financeiro deve parecer e se mover. Os valores vivem em `web/src/design/tokens.css` (cor, tipo, forma, profundidade) e `web/src/design/motion.ts` (movimento). Este documento explica as regras de uso; quando ele e o código divergirem, corrija os dois juntos.

## Direção

Um aplicativo de trabalho escuro, calmo e tipográfico, usado por uma pessoa no próprio computador. Chão e superfícies são estritamente neutros: preto, grafite, branco e cinza. Verde e vermelho aparecem somente quando carregam semântica financeira (entrada/alta e saída/baixa); as cores oficiais dos bancos ficam restritas aos seus selos e marcas de gráfico. O chão traduz bolsa de valores de forma abstrata. Sobre ele ficam superfícies de vidro, e as barras flutuantes usam o [liquid-glass-react](https://github.com/rdev/liquid-glass-react).

Três princípios decidem os casos duvidosos:

1. **A tarefa vem antes do efeito.** Rótulos e números nunca passam por distorção. Vidro e refração ficam no que é moldura (barras, superfícies), nunca no que é conteúdo.
2. **Uma regra por dimensão.** Um acento, uma escada de opacidade, uma escala de espaço, três raios. Nada é escolhido caso a caso.
3. **Nada muda sem transição, e toda transição explica algo.** Retorno de uma ação, troca de estado ou continuidade entre telas.

## Cor

| Papel | Token | Uso |
|---|---|---|
| Chão | `ground`, `scrim` | Cor de fundo e o véu sobre o gradiente, que garante o contraste do texto solto na página |
| Texto | `text`, `text-2`, `text-3`, `text-off` | Principal, secundário, apoio e desabilitado |
| Acento | `accent`, `accent-strong`, `accent-ink`, `accent-wash` | Branco e cinza: ação principal, foco e seleção |
| Estado | `positive`, `negative`, `warning` e seus `-wash` | Sempre com ícone e rótulo. Nunca só a cor |
| Dados | `data-income`, `data-expense`, `data-quiet` | Marcas de gráfico de entradas e gastos |
| Séries por banco | `series-1` a `series-4` | Fallback em tons de cinza para bancos sem cor de marca cadastrada (`features/banks/tones.ts`) |
| Marca dos bancos | `brand-nubank`, `brand-inter`, `brand-picpay` | Selo e marcas dos gráficos do banco. Nunca texto nem fundo de superfície |
| Vidro | `glass`, `glass-clear`, `glass-raised`, `glass-sunken`, `edge`, `edge-strong` | Preenchimentos e bordas dos materiais |

Texto e valores auxiliares usam tokens neutros. Verde e vermelho ficam reservados aos valores principais, ao valor em destaque de um detalhe e aos itens das listas de transações: entrada/alta em `positive` ou `data-income`, saída/baixa em `negative` ou `data-expense`. Resumos de dia e saldos sem direção ficam neutros. A leitura nunca depende só da cor: sinal, triângulo, ícone ou rótulo acompanha o valor.

### Opacidade

Tudo que é translúcido sai de duas tintas-base e de degraus fixos.

- **Luz** (`--tint`, cinza quase branco): `--alpha-1` 0,06 · `-2` 0,12 · `-3` 0,22 · `-4` 0,38 · `-5` 0,60 · `-6` 0,76 · `-7` 0,96. Preenchimento de hover é o degrau 1, pressionado e bordas o 2, borda forte o 3, desabilitado o 4, texto de apoio o 5, secundário o 6, principal o 7.
- **Sombra** (`--shade`, preto), a densidade do vidro: rebaixado 0,32 · barra líquida 0,56 · painel 0,64 · elevado 0,80.

Não escreva `rgba(...)` nem `/50` em componentes. Se faltar um degrau, o problema é de hierarquia, não de opacidade.

## Tipografia

- **Hanken Grotesk** para interface, texto e todos os números.
- **Bricolage Grotesque** só em títulos (`h1`, `h2`, `h3`) e na marca.
- **Archivo**, em peso 800, só no título da página de apresentação e na sua repetição no cabeçalho dela (`font-title`). Não entra no aplicativo.

| Token | Tamanho | Uso |
|---|---|---|
| `text-xs` | 12 | Etiquetas |
| `text-sm` | 13 | Apoio, legendas, rótulos de campo |
| `text-base` | 14 | Interface e texto corrido |
| `text-md` | 16 | Valores em listas, texto de destaque |
| `text-lg` | 20 | Título de painel |
| `text-xl` | 28 | Valor em destaque dentro de painéis |
| `text-2xl` | 40 | Título de página |
| `text-hero` | 56 | O número principal da tela. Um por tela |
| `text-display` | 72 | O título da página de apresentação em telas médias |
| `text-title` | 96 | O título da página de apresentação em telas largas |

Pesos: 400 texto, 500 rótulos e controles, 600 títulos e valores. O número principal usa a mesma grotesca do resto, com algarismos proporcionais. `tabular` (algarismos de largura fixa) só em colunas que precisam alinhar.

Texto de interface não usa travessão; a pontuação é vírgula, ponto e dois-pontos.

## Espaço

Base de 4 px. Use apenas estes passos: 4, 8, 12, 16, 24, 32, 48, 64 (`1`, `2`, `3`, `4`, `6`, `8`, `12`, `16` nas utilidades). Meios passos (`0.5`, `1.5`, `2.5`) servem só para ajuste óptico dentro de um componente.

- Dentro de um grupo: 8 a 12. Entre grupos de um painel: 24. Entre painéis: 24. Entre seções de página: 32 ou mais.
- Painéis têm 24 de respiro interno. Listas clicáveis dentro deles usam linhas com 12 de respiro e recuo negativo, para o destaque de hover alinhar com o texto.
- Largura máxima do conteúdo: 1180 px. Texto corrido: no máximo 62 caracteres por linha.

## Forma

Três raios, cada um com um dono:

- `rounded-full`: tudo que é controle (botões, campos, seletores, etiquetas, barras flutuantes).
- `rounded-lg` (22): superfícies (painéis, diálogos, painel lateral).
- `rounded-md` (14): o que mora dentro de uma superfície (linhas clicáveis, poços, menus).

`rounded-sm` (8) existe só para itens de menu. Marcas de dados têm 4 px na ponta e base reta.

## Materiais

| Classe | O que é | Onde |
|---|---|---|
| `surface` | Vidro de painel: tinta escura, desfoque do fundo, borda de luz, sombra com deslocamento | Painéis, avisos |
| `surface-raised` | Mais denso e com sombra maior | O que flutua: diálogos, painel lateral, menus, avisos passageiros |
| `surface-sunken` | Rebaixado, sem desfoque | Campos, trilho de seletores, poços, ícones em círculo |
| `lens` | Pílula clara com brilho na borda de cima | A opção ativa de um `Segmented` |
| `LiquidBar` | Vidro líquido de verdade (refração por filtro SVG) | Só as barras flutuantes: navegação superior e barra inferior no celular |

O vidro líquido tem um único lugar porque só ali a refração aparece sem custar legibilidade: o conteúdo rola por baixo da barra, é desfocado no centro e curvado na borda. Em Safari e Firefox o deslocamento não é desenhado e sobra um vidro fosco com o mesmo contraste. É uma aproximação web, não o material da Apple.

Não aninhe superfícies de vidro: dentro de um painel, agrupe com espaço, linha fina (`border-edge`) ou um poço `surface-sunken`. Elevação se declara uma vez, pelo material; não some bordas e sombras por conta própria.

Com "reduzir transparência" ligado no sistema, as superfícies viram cor sólida com o mesmo contraste.

### Plano de fundo

O fundo tem três leituras selecionáveis em Conexões e ajustes: **Mercado** (números e sinais financeiros esparsos), **Fita** (cotações abstratas horizontais) e **Grade** (malha técnica com pequenos candles). Mercado é o padrão. Variação positiva usa `▲` verde e negativa usa `▼` vermelho, nunca setas.

Todas as leituras seguem a mesma regra: números brancos e cinza, direção verde e vermelha sobre preto, opacidade global de 9%, maior presença nas bordas e centro protegido por uma vinheta. O canvas é decorativo, limitado a 12 quadros por segundo, para quando a aba perde visibilidade e congela com "reduzir movimento". Com "reduzir transparência", sua opacidade cai a 6%.

## Movimento

| Token | Duração | Uso |
|---|---|---|
| `feedback` | 120 ms | Resposta imediata, saídas |
| `state` | 220 ms | Hover, foco, troca de estado, conteúdo que troca no lugar |
| `layout` | 380 ms | Abertura de blocos, camadas, troca de página, barras de gráfico |
| `entrance` | 640 ms | Contagem de valores, entrada da tela de configuração |

Curva padrão `ease-out` (`0.16, 1, 0.3, 1`); sair é mais rápido que entrar. A pílula de seleção usa mola sem quique. Nada de elástico.

O que anima, e com qual variante de `motion.ts`:

- **Troca de página**: `pageVariants` (opacidade e 10 px de subida).
- **Listas e painéis que chegam**: `staggerVariants` no grupo, `itemVariants` em cada filho.
- **Conteúdo que troca no lugar** (estado da sincronização, prévia da previsão, etiquetas): `swapVariants`.
- **Blocos que abrem empurrando o resto** (erros de campo, editores, intervalo de datas): `collapseVariants`.
- **Camadas**: `veilVariants` com `dialogVariants`, `drawerVariants`, `popoverVariants` ou `toastVariants`.
- **Valores monetários**: `Money` conta até o novo valor quando ele muda.
- **Gráficos**: altura e largura das marcas acompanham os dados.
- **Controles**: todo botão, link, campo e seletor herda a transição de `base.css`. Botões afundam um pouco ao serem pressionados.
- **Recarga de dados**: o quadro anterior fica na tela, esmaecido, até o novo chegar. Esqueleto só no primeiro carregamento.

Com "reduzir movimento" ligado, somem os deslocamentos e o fundo para; ficam as mudanças de opacidade e cor, que ainda confirmam as ações.

## Gráficos

- Barras finas (até 24 px), ponta arredondada em 4 px, base reta, 2 px de respiro entre barras vizinhas.
- Duas séries (entradas e gastos) pedem legenda. Uma série só não.
- Faturas são sempre divididas por banco: a régua do topo do Painel, as colunas do ano e as barras de categoria usam a cor de destaque da marca (Nubank roxo, Inter laranja, PicPay verde), com o nome escrito por perto (colunas, legenda ou leitura ao passar o ponteiro). Bancos sem marca cadastrada recebem um tom neutro estável. O comprimento diz o tamanho. O resumo por categoria mostra todas as categorias, cada uma com seu ícone (`CategoryIcon`, Phosphor) num círculo rebaixado; ele fica na coluna do saldo, logo abaixo dele.
- O mês em foco fica em cor cheia e os demais recuam (ênfase, não arco-íris).
- O gráfico mensal tem leitura ao passar o ponteiro e uma tabela equivalente para leitores de tela. Nas listas de barras, o valor fica escrito ao lado de cada barra.

## Componentes

Todos em `web/src/ui/`, sem conhecimento do domínio:

`Button`, `LinkButton`, `IconButton` · `TextField`, `SelectField` · `Segmented` · `Chip` · `Panel`, `PanelHeader` · `Badge` · `Money` · `Skeleton`, `EmptyState`, `Notice` · `Dialog`, `Drawer` · `Menu` · `ToastProvider`, `useToast` · `LiquidBar` · `Background`, `MarketCanvas`.

Regras de uso:

- Uma ação principal (`primary`) por contexto. As demais são `quiet`; as destrutivas, `danger`, e sempre com confirmação.
- Rótulo acima do campo, ajuda abaixo, erro abaixo e animado. Nunca use o exemplo do campo como rótulo.
- `Dialog` só para confirmar algo destrutivo ou para uma tarefa curta que precisa de foco. Detalhes de um item abrem no `Drawer`; edição acontece no lugar.
- Todo estado tem tela: carregando, vazio (dizendo como preencher), erro (dizendo o que houve e como sair), parcial.
- Ícones são [Phosphor](https://phosphoricons.com), peso regular, 18 px (12 em etiquetas). Sem emoji.
- Foco de teclado sempre visível, em `accent`.

## Previsões

O campo de valor usa `TextField typed`: cada caractere digitado sobe 7 px até a linha em `state` (220 ms), sem mola. Com "reduzir movimento" ligado, o caractere só aparece.

Previsão é fluxo de caixa, não apenas recebimento. Valor positivo representa entrada; valor negativo representa saída. O cadastro explica o sinal no próprio campo (`300` entra, `-300` sai) e a prévia sempre escreve “entrada” ou “saída” antes de confirmar.

O topo da tela resume somente movimentações em aberto em três leituras: saldo previsto, a receber e a pagar. Entrada usa `data-income`; saída usa `data-expense`; o sinal continua escrito no valor, então a leitura não depende da cor. A lista permanece cronológica por competência e usa seta de direção, valor assinado e linguagem contextual (“recebida” para entrada, “paga” para saída).

## Calendário e assinaturas

A grade do mês vai de domingo a sábado, com os dias vizinhos esmaecidos. Cada dia mostra até três eventos escritos (marca e nome curto) e "+N eventos"; em telas estreitas, só marcadores, e o detalhe fica na lista do dia, abaixo da grade. Hoje é o número em pílula `accent`; o dia escolhido ganha borda `accent` e fundo `accent-wash`. As setas do teclado andam pelos dias, inclusive para outro mês. A troca de mês usa `swapVariants`.

Cada tipo de evento tem marca própria e rótulo escrito: cadeado para fechamento, recibo para vencimento, seta de direção para previsão e o logotipo do serviço para assinatura. "Estimada", "Paga", "Cobrada" e "Esperada" são sempre etiquetas, nunca só cor. Faturas, assinaturas e previsões são `Chip`s de ligar e desligar.

No detalhe de uma assinatura, abaixo das cobranças vinculadas, um campo de busca procura saídas do extrato por descrição, valor, data ou conta. Os resultados abrem com `collapseVariants`, a busca anterior fica esmaecida até a nova chegar e cada linha vincula com um clique; a que já é de outra assinatura aparece com a etiqueta "Em Netflix", sem ação. A cobrança vinculada à mão leva a etiqueta "Vinculada à mão".

O selo de serviço segue o selo de banco: decorativo, com o nome sempre escrito ao lado. O logotipo vem do site do serviço sobre o azulejo `logo-tile`; sem site, ou quando o provedor só tem o ícone genérico, aparece a inicial sobre `coffee`, e a imagem entra com transição de opacidade.

## Conexões e ajustes

Conexões e Ajustes são uma única área na navegação. Bancos conectados vêm primeiro porque são o objeto de trabalho; modo de conexão, credenciais e armazenamento formam uma coluna de infraestrutura. Em telas estreitas, a ordem é linear: bancos, modo de conexão, credenciais e dados locais. `/ajustes` existe apenas como redirecionamento para links antigos.

Cada instituição usa uma barra lateral de estado além da etiqueta escrita: verde em dia, cinza atualizando ou pedindo atenção e vermelho em erro. Essa barra é estado, não decoração, e nunca substitui o rótulo.

## Bancos

O banco é a divisão principal do produto. O nome é padronizado em `shared/banks.ts` (Nubank, Inter, PicPay), porque o agregador pode entregar todas as conexões com o mesmo nome. O selo do banco acompanha o nome sempre que um valor aparece: nas faturas, nas transações e nos saldos.

- Contas e cartões não têm destaque próprio: aparecem como "Conta" e "Cartão final 0422", e só servem de filtro em Transações, depois de escolhido o banco.
- Escolha de banco é um `Segmented` com o selo; filtros de ligar e desligar são `Chip`.
- Os selos são os logotipos oficiais que cada banco registrou no diretório do Open Finance Brasil (`web/public/banks/`). Quando o arquivo não traz fundo, como o do Nubank, o selo ganha um azulejo branco (`logo-tile`); nos demais o fundo não aparece. Bancos sem arquivo mostram a inicial. A cor de marca continua identificando o banco nas marcas dos gráficos.

## Página de apresentação

A demonstração pública (`npm run demo:dev`, `web/src/demo/`) abre com uma página que apresenta o projeto e leva ao aplicativo navegável. Ela mora no mesmo mundo do produto: o mesmo chão de mercado, as mesmas superfícies, os mesmos tokens.

- A abertura lê o dinheiro como um pregão (`MarketHero`): título, uma frase e as duas ações, centralizados sobre o chão. O título é o `Wordmark`: Archivo 800 em `text-title` (96, caindo para 72 e 44 em telas menores), com o "u" de "seu" trocado pelo triângulo vermelho de baixa e o "a" de "financeiro" pelo verde de alta, ambos na altura do "x". Abaixo, um gráfico de velas de ponta a ponta da janela e uma fita de cotações com o que o aplicativo acompanha. A abertura não tem barra nem marca: o nome aparece no cabeçalho, que só entra depois.
- Verde e vermelho seguem a regra do produto também aqui: vela de alta e `▲` em `market-up`, vela de baixa e `▼` em `market-down`. O pregão é cenário (gerado com semente, igual a cada visita); os valores da fita são os da demonstração.
- A prova é o produto: capturas reais das telas em molduras `surface`, e o campo de previsão funcionando com o analisador de verdade. Nada de ilustração no lugar de conteúdo.
- Cada seção tem um desenho próprio: texto empilhado, visita presa na janela, campo interativo largo, ladrilhos de tamanhos diferentes, texto ao lado do terminal. Nenhum se repete, e nenhuma seção leva rótulo acima do título.
- Uma ação principal por dobra, sempre com o mesmo rótulo: abrir a demonstração. O código no GitHub é a secundária.

A rolagem conta a história, e cada movimento tem um motivo:

- **O pregão abre e corre.** As velas crescem em sequência ao carregar, com as barras de volume embaixo. O "agora" fica a dois terços da largura, marcado por uma mira: a vertical é o presente, a horizontal sobe e desce com o preço, e um ponto pulsa no cruzamento. Na casa seguinte aparecem duas velas-fantasma, translúcidas: uma previsão de alta, verde, e uma de baixa, vermelha, para o próximo salto. Nada de linhas nem rótulos: a previsão é discreta. A cada três compassos de 0,8 s uma delas é sorteada: a que perde some na hora, a que vence vira a vela seguinte e o gráfico anda uma casa para a esquerda. Ao rolar, o texto sobe mais rápido que o gráfico, que recua e esmaece. O pregão para quando a abertura sai da janela ou a aba vai para segundo plano; com "reduzir movimento", fica parado com uma previsão à vista.
- **A fita passa** devagar e para sob o ponteiro. É a única faixa rolante da página.
- **O cabeçalho espera.** Enquanto a abertura ocupa a janela não há barra no topo; ela desce quando a abertura sai, levando o título da página ("O seu painel financeiro"), e some quando se volta ao início.
- **A tela se levanta.** A captura do Painel chega deitada (`rotateX` de 26°) e fica de pé conforme sobe na janela: a rolagem traz o produto para a frente.
- **A visita prende na janela** (só a partir de 1024 px). A seção fica fixa enquanto a rolagem troca a tela mostrada; o fio acima de cada parada enche com o avanço e os títulos também são botões. Em telas estreitas vira uma sequência simples.
- **As demais seções chegam** com `staggerVariants` e `itemVariants` ao entrar na janela, uma vez.

Tudo é ligado à rolagem pelos valores de movimento da Motion (`useScroll`, `useTransform`), nunca por um ouvinte de `scroll` nem por estado do React a cada quadro. Só `transform` e `opacity` animam. Com "reduzir movimento", a tela do Painel já chega de pé e sobram as trocas de opacidade.

Dentro do aplicativo da demonstração, uma faixa acima da navegação avisa que os dados são fictícios e que as alterações somem ao recarregar.

## Para acrescentar algo

1. Procure um componente em `ui/` antes de criar outro.
2. Use os tokens. Se precisar de um valor novo, acrescente o token e a regra aqui.
3. Dê ao estado novo uma transição do vocabulário existente.
4. Confira em 375 px e em 1440 px, com teclado, e com "reduzir movimento" ligado.
