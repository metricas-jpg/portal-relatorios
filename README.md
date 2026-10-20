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
| `SPREADSHEET_ID` | Planilha do **gerador** (abas `Configuracoes_Gerais`, `Registro_Central`, `Acionamentos_Imprensa`, `Acessos_Gerador`) |
| `ALLOWED_EMAIL_DOMAINS` | Domínios que podem entrar no portal, separados por vírgula (ex.: `loggia.com.br,sicoob.com.br`) |
| `ALLOWED_EMAILS` | E-mails avulsos que podem entrar, separados por vírgula |

Sem `ALLOWED_EMAIL_DOMAINS` e `ALLOWED_EMAILS`, qualquer conta Google consegue entrar (comportamento antigo). Defina pelo menos uma das duas.

## Regras de acesso (`lib/acesso.ts`)

- **Portal**: só quem passa na lista acima. `/api/relatorios`, `/api/relatorios/file` e `/api/relatorios/thumbnail` exigem login.
- **Arquivos do Drive**: as rotas só entregam arquivos cujo ID aparece na aba `Relatorios` ou na `COLUNA PRINT` do `Registro_Central`.
- **Gerador**: e-mails da aba `Acessos_Gerador`. Se a aba estiver vazia, vale o domínio `@loggia.com.br`.

## Gerador

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

### Campos de `Configuracoes_Gerais`

Obrigatórios: `titulo_crise`, `subtitulo_unidade`, `inicio_monitoramento`, `ultima_atualizacao`, `nivel_risco`, `risco_texto`, `status_crise`, `status_texto`, `o_que_mudou`, `o_que_significa`, `protagonismo`, `analise_caso`, `papel_sicoob`, `centro_pauta`, `gatilhos_escalada` (um por linha).

Recomendados (sem eles o relatório mostra `[__]` ou esconde o item, e o painel avisa):

| Campo | Uso |
|---|---|
| `edicao_numero` | Edição nº |
| `periodo_inicio` | Início do período desta edição (ex.: `03/10/2026, 09h`). Define o "Período" e o cálculo de **Novas menções** |
| `risco_tendencia`, `status_tendencia` | Ex.: `Estável`, `Subindo`, `Caindo` (vira →, ↑, ↓) |

Opcionais: `analise_revisao_data` ("Última revisão: …" na página 3; some quando vazio), `leitura_acionamentos` (bloco "Leitura" abaixo da tabela), `novas_mencoes_detalhe` (substitui o "Última: dd/mm (veículo)" calculado), `titulo_orgao`, `titulo_o_que_mudou`, `titulo_o_que_significa`.

Em qualquer texto, `**trecho**` sai em negrito.

### `Registro_Central`

- **Canal/Veiculo**: nome da rede (`Instagram`, `X/Twitter`, `Facebook`, `LinkedIn`, `YouTube`) ou do veículo de imprensa (`ES Hoje`...). Qualquer nome que não seja uma das cinco redes conta como **Imprensa**. Vazio ou `-` = evento sem publicação (não entra nos números).
- **Datas** sem ano usam o ano da `ultima_atualizacao`. Faixas como `09 a 13/08` são aceitas na linha do tempo.
- **Linha do tempo**: o próximo marco vem primeiro; depois do mais recente para o mais antigo. Com `Envolve Sicoob? = NÃO`, o item aparece como contexto, qualquer que seja a tonalidade. Com `SIM` e tonalidade diferente de Negativa/Neutra/Positiva, aparece como `[A CLASSIFICAR]`.

## Desenvolvimento

```bash
npm install
npm run dev
```
