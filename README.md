# Portal de Relatórios · Sicoob & Loggia

Next.js 16 na Vercel, com login Google (NextAuth) e dados em planilhas Google lidas por uma Service Account.

- **`/`**: portal que lista os relatórios da aba `Relatorios` e abre os PDFs do Drive.
- **`/gerador`**: monta o Relatório de Monitoramento de Crise (A4 retrato) a partir da planilha de preenchimento e gera o PDF pela impressão do navegador.

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | NextAuth |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Login Google |
| `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY` | Service Account (Sheets e Drive) |
| `GOOGLE_SHEET_ID` | Planilha do **portal** (aba `Relatorios`) |
| `PLANILHA_CENTRAL_ID` | Planilha central com a lista de monitoramentos (padrão: *Monitoramentos Diários 2026*) |
| `PLANILHA_CENTRAL_ABA` | Aba da lista (padrão: `Monitoramentos 2026`) |
| `GERADOR_DOMINIOS` | Opcional. Domínios que usam o gerador, separados por vírgula. Padrão: `loggia.com.br` |
| `GITHUB_TOKEN` | Token do GitHub usado pela página `/acessos` para gravar a lista de acessos (ver abaixo) |
| `ALLOWED_EMAIL_DOMAINS`, `ALLOWED_EMAILS` | Opcionais e antigas: domínios e e-mails extras com acesso ao portal. Prefira a página `/acessos` |

### Lista de acessos (`/acessos`)

Além dos e-mails `@loggia.com.br`, só entra quem está na lista de acessos (`config/acessos.json`). Os administradores (lista `ADMINS` em `lib/acessos.ts`) veem um ícone de compartilhamento no cabeçalho do portal, que abre a página `/acessos`. Lá eles adicionam e-mails ou domínios inteiros, escolhendo **Portal** (consulta os relatórios) ou **Portal + gerador**.

Cada alteração vira um commit no `main` com quem fez, e a Vercel republica o site: a mudança vale em 1 a 2 minutos.

**Configurar o `GITHUB_TOKEN`** (uma vez):
1. GitHub, logado na conta metricas-jpg → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Repository access: **Only select repositories** → `portal-relatorios`.
3. Permissions → Repository permissions → **Contents: Read and write** (nenhuma outra).
4. Gere o token, copie e cadastre como `GITHUB_TOKEN` na Vercel (Production). Faça um Redeploy.
5. Anote a data de expiração: quando vencer, a página avisa e é só gerar outro.

## Regras de acesso (`lib/acesso.ts`)

- **Portal**: e-mails `@loggia.com.br` e os da lista de acessos. `/api/relatorios`, `/api/relatorios/file` e `/api/relatorios/thumbnail` exigem login.
- **Arquivos do Drive**: as rotas só entregam arquivos cujo ID aparece na aba `Relatorios` ou na `COLUNA PRINT` do `Registro_Central`.
- **Gerador**: e-mails do domínio `@loggia.com.br` (ou os de `GERADOR_DOMINIOS`) e os da lista marcados como **Portal + gerador**.

## Gerador

### Fluxo

1. **`/gerador`**: lista os monitoramentos da planilha central (colunas `NOME` e `link_da_planilha_do_monitoramento`; o cabeçalho pode estar abaixo de um título mesclado). Busca por nome. Só aparecem as linhas com link de planilha.
2. **`/gerador/<id da planilha>`**: se a planilha tiver mais de uma edição, mostra a lista para escolher; com uma só, vai direto ao relatório.
3. **`/gerador/<id da planilha>?edicao=N`**: o relatório. O endereço pode ser salvo ou enviado para outra pessoa revisar a mesma edição.

O site só abre planilhas que estão na lista central. A conta de serviço (`GOOGLE_CLIENT_EMAIL`) precisa de acesso de **leitor** à planilha central, às planilhas de monitoramento e às pastas dos prints. O mais simples é compartilhar a pasta-mãe dos monitoramentos uma vez: tudo que for criado dentro dela herda o acesso.

### Edições

- **`Configuracoes_Gerais`**: uma linha por edição, com `edicao_numero` (ex.: `01`, `02`). Uma coluna cujo nome comece com `descricao` (ex.: `descricao_versao`) aparece na escolha de edição e na barra do gerador, nunca no PDF.
- **Campos do caso** (`titulo_orgao`, `titulo_crise`, `titulo_o_que_mudou`, `titulo_o_que_significa`, `subtitulo_unidade`, `inicio_monitoramento`, `analise_caso`, `papel_sicoob`, `centro_pauta`, `gatilhos_escalada`, `analise_revisao_data`): se ficarem vazios numa edição, valem os da edição anterior.
- **Período**: começa na `ultima_atualizacao` da edição anterior; `periodo_inicio` só vale para a primeira edição.
- **`Registro_Central` e `Acionamentos_Imprensa`**: a coluna `edicao_numero` é opcional. Vazia, a linha pertence à primeira edição cuja `ultima_atualizacao` é igual ou posterior à data dela (coleta; se vazia, a do post). Preenchida, ela vale. Linhas sem data aparecem em todas as edições.
- **O que entra na edição N**: menções acumuladas, gráfico, linha do tempo e anexos somam tudo até N. "Novas menções" é só da edição N. O gráfico usa a **Data Coleta** no eixo (sem ela, a data do post). Acionamentos: os da edição N e os anteriores ainda em aberto. Na linha do tempo, uma divisória separa as novidades da edição N das edições anteriores.

```
lib/google-sheets.ts   leitura das abas
lib/relatorio.ts       todos os cálculos (indicadores, gráfico, linha do tempo, anexos) e os avisos de preenchimento
app/gerador/page.tsx   acesso + busca dos dados
app/gerador/Relatorio.tsx   as páginas
app/gerador/Paginador.tsx   cria páginas de continuação quando o conteúdo não cabe
app/gerador/PainelAvisos.tsx  painel amarelo com o que precisa ser corrigido na planilha
app/gerador/gerador.css     layout A4 (medidas em pt, iguais ao modelo original)
```

**Layout misto.** A página 1 e os cabeçalhos têm posições fixas, iguais ao modelo. Os textos variáveis da página 1 têm limite de linhas; se passarem, são cortados com "…" e aparecem no painel de avisos. As páginas 2 e 3 e os anexos fluem: linha do tempo, tabela de acionamentos e gatilhos continuam numa nova página com o título "(continuação)". A numeração das páginas é automática.

**Página 1 elástica.** "O que mudou" (ideal: 4 linhas) e "O que significa para o Sicoob" (ideal: 5 linhas) podem crescer juntos até 8 linhas a mais. O espaço sai, nesta ordem, dos espaços em branco do cabeçalho, dos espaços entre os cards e dentro deles e, por último, da altura das barras do gráfico; as fontes não mudam (`AjustePagina1.tsx`). O painel avisa quando o texto passa do ideal e quando passa do máximo, com a quantidade de caracteres a retirar. Nenhum aviso sai na impressão.

### Campos de `Configuracoes_Gerais`

Obrigatórios: `titulo_crise`, `subtitulo_unidade`, `inicio_monitoramento`, `ultima_atualizacao`, `nivel_risco`, `risco_texto`, `status_crise`, `status_texto`, `o_que_mudou`, `o_que_significa`, `protagonismo`, `analise_caso`, `papel_sicoob`, `centro_pauta`, `gatilhos_escalada` (um por linha).

Recomendados (sem eles o relatório mostra `[__]` ou esconde o item, e o painel avisa):

| Campo | Uso |
|---|---|
| `edicao_numero` | Edição nº |
| `periodo_inicio` | Início do período da **primeira** edição (nas seguintes, o período começa na atualização da edição anterior) |
| `risco_tendencia`, `status_tendencia` | Ex.: `Estável`, `Subindo`, `Caindo` (vira →, ↑, ↓) |

Opcionais: `analise_revisao_data` ("Última revisão: …" na página 3; some quando vazio), `leitura_acionamentos` (bloco "Leitura" abaixo da tabela), `novas_mencoes_detalhe` (substitui o "Última: dd/mm (veículo)" calculado), `titulo_orgao`, `titulo_o_que_mudou`, `titulo_o_que_significa`.

Em qualquer texto, `**trecho**` sai em negrito.

**Menções gerais ao tema** conta só as publicações com `Envolve Sicoob? = NÃO` (as que envolvem o Sicoob estão em "Menções ao Sicoob acumuladas").

**Nome do PDF.** O título da aba do gerador vira o nome sugerido ao "Salvar como PDF" e o título dentro do arquivo, no padrão da pasta do portal: `DD.MM.AAAA_TURNO_Título_Unidade` (ex.: `21.10.2026_TARDE_Apex_Sicoob-ES`). Data e turno vêm da `ultima_atualizacao` da edição (manhã até 11h59, tarde até 17h59, noite depois; sem hora, o turno fica de fora). Na 1ª edição, o turno é substituído por `ABERTURA`; o título é o `titulo_crise` (ou o NOME da planilha central) e a unidade é o `subtitulo_unidade`.

### Prints dos anexos (COLUNA PRINT)

O arquivo do Drive (PDF, PNG ou JPG) é convertido em imagem no navegador e aparece igual na tela e no PDF final, sem a barra do leitor de PDF. O conteúdo é mostrado **inteiro**: as páginas do arquivo são emendadas numa faixa contínua, sem as margens brancas, e cortadas no tamanho da área de print. O começo fica na página do anexo e o restante segue em páginas de continuação ("Parte 2 de 5"...). O corte procura um espaço em branco para não partir uma linha de texto. Cabeçalho e rodapé que o navegador imprime nos PDFs (data, endereço, "1/2") são descartados, e uma sobra pequena no fim entra na página anterior em vez de virar uma página própria. Para a tela não ficar pesada, cada print só é carregado quando o anexo chega perto da área visível, no máximo 2 ao mesmo tempo. O botão **Gerar Relatório Final** carrega os que faltam e espera todos terminarem antes de abrir a impressão. O conversor de PDF (pdf.js 3.11.174) é carregado do cdnjs.

### `Registro_Central`

As colunas são localizadas pelo **nome do cabeçalho** (linha 1), não pela posição: a ordem pode mudar sem quebrar o relatório. Se um nome for alterado, o painel avisa e a posição padrão é usada.

- **Tipo de Registro**: tipos que começam com `Evento` (`Evento Jurídico`, `Evento Factual`) não são publicações: não entram em nenhum número nem no gráfico, mesmo com Canal/Veiculo preenchido, mas podem aparecer na linha do tempo.
- **Canal/Veiculo** vazio numa publicação: a rede é deduzida pelo link da matéria (instagram.com, x.com, facebook.com, linkedin.com, youtube.com; outro site = Imprensa), e o painel avisa.
- **Canal/Veiculo** (demais tipos): nome da rede (`Instagram`, `X/Twitter`, `Facebook`, `LinkedIn`, `YouTube`, `TikTok`) ou do veículo de imprensa (`ES Hoje`...). Nome que não seja uma das seis redes conta como **Imprensa**. Vazio ou `-` = fora dos números (o painel avisa).
- **Datas** sem ano usam o ano da `ultima_atualizacao`. Faixas como `09 a 13/08` são aceitas na linha do tempo.
- **Linha do tempo**: o próximo marco vem primeiro; depois do mais recente para o mais antigo. Com `Envolve Sicoob? = NÃO`, o item aparece como contexto, qualquer que seja a tonalidade. Com `SIM` e tonalidade diferente de Negativa/Neutra/Positiva, aparece como `[A CLASSIFICAR]`.

## Desenvolvimento

```bash
npm install
npm run dev
```
