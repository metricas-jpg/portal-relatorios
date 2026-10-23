import type { RelatorioDados, RegistroCentral } from './google-sheets';
import { numeroEdicao } from './edicoes';

/**
 * Transforma os dados crus da planilha no conteúdo do relatório:
 * todos os números, a linha do tempo, o gráfico e os anexos são calculados aqui.
 * Também devolve `avisos`: problemas de preenchimento que aparecem no painel amarelo do gerador.
 */

// ---------- redes ----------
export const REDES = [
  { chave: 'imp', nome: 'Imprensa', cor: 'var(--roxo)' },
  { chave: 'ins', nome: 'Instagram', cor: 'var(--turquesa)' },
  { chave: 'x', nome: 'X/Twitter', cor: 'var(--petroleo)' },
  { chave: 'fb', nome: 'Facebook', cor: 'var(--verde)' },
  { chave: 'li', nome: 'LinkedIn', cor: 'var(--lima)' },
  { chave: 'yt', nome: 'YouTube', cor: 'var(--laranja)' },
] as const;
export type Rede = (typeof REDES)[number]['chave'];
export const nomeRede = (r: Rede) => REDES.find(x => x.chave === r)!.nome;

export const normalizar = (s: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

/**
 * A coluna "Canal/Veiculo" traz a rede social (Instagram, X/Twitter...) ou o nome do veículo
 * de imprensa (ES Hoje, Folha Vitória...). Vazio ou "-" = evento sem publicação.
 */
export function redeDoCanal(canal: string): Rede | null {
  const n = normalizar(canal).toLowerCase();
  if (!n || n === '-') return null;
  if (n.includes('instagram')) return 'ins';
  if (n.includes('twitter') || n === 'x' || n.startsWith('x/') || n.startsWith('x ')) return 'x';
  if (n.includes('facebook')) return 'fb';
  if (n.includes('linkedin')) return 'li';
  if (n.includes('youtube')) return 'yt';
  return 'imp';
}

/** rede pelo endereço da publicação (instagram.com, x.com...); outro site = Imprensa */
export function redeDoLink(link: string): Rede | null {
  const m = (link || '').trim().toLowerCase().match(/^https?:\/\/([^/?#]+)/);
  if (!m) return null;
  const h = m[1].replace(/^www\./, '');
  if (/(^|\.)instagram\.com$/.test(h)) return 'ins';
  if (/(^|\.)(x|twitter)\.com$/.test(h)) return 'x';
  if (/(^|\.)(facebook\.com|fb\.com|fb\.watch)$/.test(h)) return 'fb';
  if (/(^|\.)linkedin\.com$/.test(h)) return 'li';
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) return 'yt';
  return 'imp';
}

/**
 * Rede de um registro, considerando o "Tipo de Registro":
 * - "Evento ..." (Evento Jurídico, Evento Factual): não é publicação, não entra nos números,
 *   mesmo que a coluna Canal/Veiculo esteja preenchida (continua podendo ir para a linha do tempo);
 * - demais tipos: a rede vem do Canal/Veiculo; se ele estiver vazio, é deduzida pelo link da matéria.
 */
export function redeDoRegistro(tipo: string, canal: string, link = ''): { rede: Rede | null; deduzida: boolean } {
  if (normalizar(tipo).startsWith('EVENTO')) return { rede: null, deduzida: false };
  const pelaColuna = redeDoCanal(canal);
  if (pelaColuna) return { rede: pelaColuna, deduzida: false };
  const peloLink = redeDoLink(link);
  return { rede: peloLink, deduzida: !!peloLink };
}

// ---------- datas ----------
export interface DataLida { ts: number; dia: number; mes: number; ano: number; temHora: boolean }

/**
 * Lê "DD/MM", "DD/MM/AAAA", "DD/MM/AAAA, 09h", "06/10, 18h" ou faixas como "09 a 13/08"
 * (usa a última data da faixa). Sem ano, usa o ano da edição; se a data cair depois
 * do mês da edição, considera o ano anterior (virada de dezembro para janeiro).
 */
export function lerData(texto: string, ref?: DataLida | null): DataLida | null {
  if (!texto) return null;
  const datas = [...texto.matchAll(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/g)];
  if (!datas.length) return null;
  const m = datas[datas.length - 1];
  const dia = +m[1], mes = +m[2];
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  let ano: number;
  if (m[3]) ano = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  else if (ref) {
    // aceita até 1 mês à frente da edição (ex.: próximo marco); mais que isso é do ano anterior
    const dif = mes - ref.mes;
    ano = dif > 1 ? ref.ano - 1 : dif < -10 ? ref.ano + 1 : ref.ano;
  } else ano = new Date().getFullYear();
  const h = texto.slice((m.index || 0) + m[0].length).match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i);
  const hora = h ? Math.min(23, +h[1]) : 0, min = h && h[2] ? +h[2] : 0;
  return { ts: new Date(ano, mes - 1, dia, hora, min).getTime(), dia, mes, ano, temHora: !!h };
}
/**
 * Datas com hora vindas da planilha com validação de data ("18/10/2026 09", "18/10/2026 09:30",
 * "18/10/2026 09:00:00") viram o formato do relatório: "18/10/2026, 09h" / "18/10/2026, 09h30".
 * Datas sem hora ficam como estão; textos que não são data também.
 */
export function formatarDataHora(valor: string): string {
  const t = (valor || '').trim();
  const m = t.match(/^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?:[\s,]+(\d{1,2})(?:\s*[:h]\s*(\d{2}))?(?::\d{2})?\s*h?)?$/i);
  if (!m) return t;
  const [, data, hora, min] = m;
  if (hora === undefined) return data;
  return `${data}, ${hora.padStart(2, '0')}h${min && min !== '00' ? min : ''}`;
}

const ddmm = (d: DataLida) => `${String(d.dia).padStart(2, '0')}/${String(d.mes).padStart(2, '0')}`;
const chaveDia = (d: DataLida) => d.ano * 10000 + d.mes * 100 + d.dia;

// ---------- tipos do relatório ----------
export type Tom = 'neg' | 'neu' | 'pos' | 'acl' | 'ctx' | 'next';
export interface ItemTimeline { data: string; texto: string; tom: Tom; complemento?: string; novo?: boolean; divisaoAbaixo?: boolean }
export interface DiaGrafico { rotulo: string; porRede: Record<Rede, number>; total: number }
export interface Clipping {
  idUnico: string; rede: Rede; veiculo: string; titulo: string; dataPost: string; dataColeta: string;
  link: string; autoria: string; tonalidade: string; tom: Tom; trecho: string; printUrl: string;
  /** publicação da edição escolhida (só marcada a partir da 2ª edição) */
  nova: boolean;
}
export interface Acionamento { data: string; veiculo: string; jornalista: string; demanda: string; prazo: string; resposta: string; status: string }

export interface Relatorio {
  orgao: string; titulo: string; unidade: string;
  inicio: string; edicao: string; periodoDe: string; periodoAte: string; ultimaAtualizacao: string;
  risco: { nivel: string; cor: string; tendencia: string; texto: string };
  status: { nivel: string; tendencia: string; texto: string };
  novas: { qtd: number; detalhe: string };
  gerais: { qtd: number; desde: string };
  acumulado: { qtd: number; desde: string; porRede: Record<Rede, number> };
  acionamentos: { linhas: Acionamento[]; novos: number; abertos: number };
  tituloMudou: string; mudou: string; tituloSignifica: string; significa: string; protagonismo: string;
  grafico: DiaGrafico[];
  timeline: ItemTimeline[];
  analise: { revisao: string; manchete: string; papel: string; centro: string; gatilhos: string[] };
  leitura: string;
  clippings: Clipping[];
  avisos: string[];
}

const zeroRedes = () => Object.fromEntries(REDES.map(r => [r.chave, 0])) as Record<Rede, number>;

function tomDaTonalidade(t: string): Tom | null {
  const n = normalizar(t);
  if (n.startsWith('NEGAT')) return 'neg';
  if (n.startsWith('NEUTR')) return 'neu';
  if (n.startsWith('POSIT')) return 'pos';
  return null;
}

/** "linhas 2–8, 10, 12–13" */
function faixas(linhas: number[]) {
  const ls = [...new Set(linhas)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    let j = i;
    while (j + 1 < ls.length && ls[j + 1] === ls[j] + 1) j++;
    out.push(j > i ? `${ls[i]}–${ls[j]}` : `${ls[i]}`);
    i = j;
  }
  return `${ls.length > 1 ? 'linhas' : 'linha'} ${out.join(', ')}`;
}

export function montarRelatorio(dados: RelatorioDados): Relatorio {
  const { registros = [], acionamentos = [], edicoes = [] } = dados;
  // datas de Configuracoes_Gerais no formato do relatório (a validação da planilha não traz o "h")
  const geral: Record<string, string> = { ...(dados.geral || {}) };
  (['periodo_inicio', 'inicio_monitoramento', 'ultima_atualizacao'] as const).forEach(k => { if (geral[k]) geral[k] = formatarDataHora(geral[k]); });
  const avisos: string[] = [];
  if (geral.erro_api) avisos.push(`Erro de conexão com a planilha: ${geral.erro_api}`);
  avisos.push(...(dados.avisosLeitura || []));
  // avisos repetidos por linha viram uma linha só: "... (linhas 2–8, 10)"
  const agrupados = new Map<string, number[]>();
  const avisar = (aba: string, msg: string, linha: number) => {
    const k = `${aba}|${msg}`;
    agrupados.set(k, [...(agrupados.get(k) || []), linha]);
  };

  // Campos que o relatório usa e que não existem (ou estão vazios) na aba Configuracoes_Gerais
  const esperados: [string, string][] = [
    ['titulo_crise', 'título do caso'], ['subtitulo_unidade', 'unidade'], ['edicao_numero', 'número da edição'],
    ['risco_tendencia', 'tendência do risco'], ['status_tendencia', 'tendência do status'],
  ];
  if (!geral.erro_api) {
    const faltando = esperados.filter(([k]) => !(geral[k] || '').trim()).map(([k, d]) => `${k} (${d})`);
    if (faltando.length) avisos.push(`Configuracoes_Gerais: campos vazios ou ausentes, que aparecem como [__] ou ficam ocultos: ${faltando.join(', ')}.`);
  }

  const ultima = geral.ultima_atualizacao || '';
  const refUltima = lerData(ultima);
  const inicioMon = geral.inicio_monitoramento || '';
  const refInicio = lerData(inicioMon, refUltima);
  const inicioData = inicioMon.split(',')[0].trim();
  const desde = refInicio ? ddmm(refInicio) : inicioMon;

  // ---------- edições ----------
  // cada edição vai até a sua ultima_atualizacao; um registro sem edicao_numero pertence à
  // primeira edição cuja última atualização é igual ou posterior à data dele
  const limites = edicoes
    .map(e => ({ numero: e.numero, fim: lerData(e.ultimaAtualizacao, refUltima) }))
    .filter(e => e.fim)
    .map(e => ({ numero: e.numero, fim: chaveDia(e.fim!) }));
  const N = dados.edicao ?? edicoes[edicoes.length - 1]?.numero ?? 1;
  const primeira = !edicoes.some(e => e.numero < N);
  const ultimaEdicao = edicoes[edicoes.length - 1]?.numero ?? N;
  const edicaoDe = (explicita: string, data: DataLida | null, aba: string, linha: number): number | null => {
    const n = numeroEdicao(explicita);
    if (n != null) {
      if (edicoes.length && !edicoes.some(e => e.numero === n)) avisar(aba, `edicao_numero ${n} não existe em Configuracoes_Gerais`, linha);
      return n;
    }
    if (!data) return null;
    if (!limites.length) return N;
    const k = chaveDia(data);
    const e = limites.find(x => k <= x.fim);
    if (e) return e.numero;
    avisar(aba, 'data posterior à última atualização da última edição; conta na última edição até a próxima ser criada', linha);
    return ultimaEdicao;
  };
  // até a edição escolhida (acumulado) e só da edição escolhida (novidades)
  const ate = (ed: number | null) => ed == null || ed <= N;
  const daEdicao = (ed: number | null) => primeira ? ate(ed) : ed === N;

  // ---------- registros ----------
  type Reg = RegistroCentral & { rede: Rede | null; dPost: DataLida | null; dRef: DataLida | null; ed: number | null };
  const todos: Reg[] = registros.map((r, i) => {
    const linha = r.linha || i + 2;
    const dPost = lerData(r.dataPost, refUltima);
    const dColeta = lerData(r.dataColeta, refUltima);
    const { rede, deduzida } = redeDoRegistro(r.tipo, r.plataforma, r.linkMateria);
    if (deduzida) avisar('Registro_Central', 'sem Canal/Veículo; a rede foi deduzida pelo link da matéria', linha);
    if (!rede && !normalizar(r.tipo).startsWith('EVENTO') && /IMPRENSA|MATERIA|REDE|MENCAO|POST/.test(normalizar(r.tipo)))
      avisar('Registro_Central', 'publicação sem Canal/Veículo nem link; ficou fora dos números', linha);
    const dRef = dColeta || dPost;
    return { ...r, linha, rede, dPost, dRef, ed: edicaoDe(r.edicao, dRef, 'Registro_Central', linha) };
  });
  const regs = todos.filter(r => ate(r.ed));
  const publicacoes = regs.filter(r => r.rede);
  const doSicoob = publicacoes.filter(r => r.envolveSicoob);
  const vol = (r: RegistroCentral) => r.volume || 1;

  const porRede = zeroRedes();
  doSicoob.forEach(r => { porRede[r.rede!] += vol(r); });
  const acumulado = doSicoob.reduce((a, r) => a + vol(r), 0);
  // menções gerais ao tema: só as publicações que NÃO envolvem o Sicoob (as que envolvem estão no acumulado)
  const gerais = publicacoes.filter(r => !r.envolveSicoob).reduce((a, r) => a + vol(r), 0);
  // canais que parecem rede social mas não estão entre as 6 do relatório caem em Imprensa
  const suspeitos = [...new Set(publicacoes.filter(r => r.rede === 'imp' && /tiktok|kwai|threads|telegram|whats|reddit|pinterest|bluesky|rede|social/i.test(r.plataforma)).map(r => r.plataforma.trim()))];
  if (suspeitos.length) avisos.push(`Canais contados como Imprensa no gráfico: ${suspeitos.join(', ')}. O relatório só separa Instagram, X/Twitter, Facebook, LinkedIn e YouTube.`);

  publicacoes.filter(r => !r.dRef).forEach(r => avisar('Registro_Central', 'sem Data Coleta nem Data do post válidas (DD/MM); a publicação fica fora do gráfico', r.linha));

  // ---------- novas menções: as da edição escolhida ----------
  const novasLista = doSicoob.filter(r => daEdicao(r.ed));
  const novas = novasLista.reduce((a, r) => a + vol(r), 0);
  const maisRecente = [...doSicoob].filter(r => r.dPost).sort((a, b) => b.dPost!.ts - a.dPost!.ts)[0];
  const nomeVeiculo = (r: Reg) => r.rede === 'imp' ? (r.plataforma && r.plataforma !== '-' ? r.plataforma : r.autoria || 'Imprensa') : nomeRede(r.rede!);
  const detalheNovas = geral.novas_mencoes_detalhe ||
    (maisRecente ? `Última: ${ddmm(maisRecente.dPost!)} (${nomeVeiculo(maisRecente)})` : 'nesta edição');

  // ---------- gráfico: por dia de COLETA (sem Data Coleta, usa a data do post) ----------
  const dias = new Map<number, DiaGrafico>();
  doSicoob.filter(r => r.dRef).forEach(r => {
    const k = chaveDia(r.dRef!);
    if (!dias.has(k)) dias.set(k, { rotulo: ddmm(r.dRef!), porRede: zeroRedes(), total: 0 });
    const d = dias.get(k)!; d.porRede[r.rede!] += vol(r); d.total += vol(r);
  });
  const grafico = [...dias.entries()].sort((a, b) => a[0] - b[0]).map(([, d]) => d);
  if (grafico.length > 21) avisos.push(`O gráfico tem ${grafico.length} dias com menções; para não sobrepor, parte das datas do eixo fica oculta${grafico.length > 46 ? ' e os números acima das barras também' : ''}.`);

  // ---------- linha do tempo (acumulada até a edição escolhida) ----------
  const itens = regs.filter(r => r.mostrarTimeline).map((r, ordem) => {
    const texto = r.textoTimeline || r.fato || '';
    let tom: Tom; let complemento: string | undefined;
    const t = tomDaTonalidade(r.tonalidade);
    if (r.proximoMarco) {
      tom = 'next';
      complemento = r.dPost ? ddmm(r.dPost) : (r.dataPost || 'Data a confirmar');
    } else if (!r.envolveSicoob) {
      tom = 'ctx';
      if (t) avisar('Registro_Central', `tonalidade ${normalizar(r.tonalidade)} com "Envolve Sicoob? = NÃO"; na linha do tempo aparece como contexto (sem menção ao Sicoob)`, r.linha);
    } else if (t) {
      tom = t;
    } else {
      tom = 'acl';
      avisar('Registro_Central', 'envolve o Sicoob, mas a tonalidade não é NEGATIVA, NEUTRA ou POSITIVA; aparece como [A CLASSIFICAR]', r.linha);
    }
    if (!texto) avisar('Registro_Central', 'marcado para a linha do tempo, mas sem Texto Timeline nem Fato', r.linha);
    // data completa (19/10/2026) aparece como dd/mm, igual ao modelo; faixas e textos ficam como estão
    const data = r.dPost && /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(r.dataPost.trim()) ? ddmm(r.dPost) : (r.dataPost || '');
    const novo = r.proximoMarco || daEdicao(r.ed);
    return { item: { data, texto, tom, complemento, novo } as ItemTimeline, ts: r.dPost?.ts, proximo: r.proximoMarco, ordem };
  });
  // Próximo marco primeiro; depois do mais recente para o mais antigo; itens sem data no fim
  itens.sort((a, b) =>
    (+b.proximo - +a.proximo) ||
    ((a.ts == null ? 1 : 0) - (b.ts == null ? 1 : 0)) ||
    ((b.ts ?? 0) - (a.ts ?? 0)) || (a.ordem - b.ordem));
  const timeline = itens.map(i => i.item);
  // divisória entre as novidades desta edição e as edições anteriores
  if (!primeira) {
    const iVelho = timeline.findIndex(t => !t.novo);
    if (iVelho > 0 && timeline.slice(0, iVelho).some(t => t.novo && t.tom !== 'next')) timeline[iVelho - 1].divisaoAbaixo = true;
  }

  // ---------- acionamentos: os desta edição + os de edições anteriores ainda em aberto ----------
  const fechado = (st: string) => /fechad|encerrad|respondid|conclu|finaliz/i.test(normalizar(st).toLowerCase());
  const linhasAc: Acionamento[] = [];
  let novosAc = 0;
  acionamentos.forEach((a, i) => {
    const linha = a.linha || i + 2;
    const faltam = (['data', 'veiculo', 'demanda'] as const).filter(k => !(a[k] || '').trim());
    if (faltam.length) { avisar('Acionamentos_Imprensa', `falta ${faltam.join(', ')}; a linha ficou fora do relatório`, linha); return; }
    const ed = edicaoDe(a.edicao, lerData(a.data, refUltima), 'Acionamentos_Imprensa', linha);
    if (!ate(ed)) return;
    const novo = daEdicao(ed);
    if (!novo && fechado(a.status)) return;
    if (novo) novosAc++;
    // data completa (20/10/2026) vira dd/mm, como na linha do tempo, para caber na coluna
    const d = lerData(a.data, refUltima);
    linhasAc.push(d && /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(a.data.trim()) ? { ...a, data: ddmm(d) } : a);
  });
  const abertos = linhasAc.filter(a => !fechado(a.status)).length;

  // ---------- anexos: todos os marcados, desta edição e das anteriores ----------
  const clippings: Clipping[] = regs.filter(r => r.gerarClipping).map((r, i) => {
    if (!r.fato) avisar('Registro_Central', 'anexo sem "Fato / Titulo da Materia" (o título do anexo fica vazio)', r.linha);
    if (!r.trecho) avisar('Registro_Central', 'anexo sem "Trecho sobre o Sicoob"', r.linha);
    if (!r.printUrl) avisar('Registro_Central', 'anexo sem link na coluna do print', r.linha);
    else if (!/[-\w]{25,}/.test(r.printUrl)) avisar('Registro_Central', 'a coluna do print não tem um link do Drive', r.linha);
    if (!r.rede) avisar('Registro_Central', 'anexo sem Canal/Veículo nem link; foi tratado como Imprensa', r.linha);
    return {
      idUnico: `clip_${i}`, rede: r.rede || 'imp', veiculo: r.plataforma && r.plataforma !== '-' ? r.plataforma : '',
      titulo: r.fato, dataPost: r.dPost ? `${ddmm(r.dPost)}/${r.dPost.ano}` : r.dataPost, dataColeta: r.dataColeta,
      link: r.linkMateria, autoria: r.autoria, tonalidade: r.tonalidade, tom: tomDaTonalidade(r.tonalidade) || 'acl',
      trecho: r.trecho, printUrl: r.printUrl, nova: !primeira && daEdicao(r.ed),
    };
  });

  // ---------- período (só datas): "18/10 a 20/10/2026"; o ano inicial aparece só se for outro ano ----------
  const textoDe = geral.periodo_inicio || inicioData;
  const dDe = lerData(textoDe, refUltima);
  const periodoAte = refUltima ? `${ddmm(refUltima)}/${refUltima.ano}` : ultima.split(',')[0].trim();
  const periodoDe = dDe ? `${ddmm(dDe)}${refUltima && dDe.ano !== refUltima.ano ? `/${dDe.ano}` : ''}` : textoDe.split(',')[0].trim();
  if (dDe && refUltima && chaveDia(dDe) > chaveDia(refUltima)) {
    avisos.push(`Configuracoes_Gerais: o período começa (${textoDe}) depois da ultima_atualizacao (${ultima}). Confira as datas.`);
  }

  agrupados.forEach((linhas, k) => {
    const [aba, msg] = k.split('|');
    avisos.push(`${aba} (${faixas(linhas)}): ${msg}.`);
  });

  // ---------- risco (cores definidas pela equipe) ----------
  const nivelRisco = (geral.nivel_risco || 'BAIXO').toUpperCase();
  const nr = normalizar(nivelRisco);
  const corRisco = nr === 'ALTO' ? '#003641' : nr === 'MEDIO' ? '#c9d200' : '#7db61c';

  return {
    orgao: geral.titulo_orgao || 'Presidência - Superintendência Negócios Digitais, Marketing e Experiência do Cooperado',
    titulo: geral.titulo_crise || '', unidade: geral.subtitulo_unidade || '',
    inicio: inicioMon, edicao: geral.edicao_numero || '',
    periodoDe, periodoAte, ultimaAtualizacao: ultima,
    risco: { nivel: nivelRisco, cor: corRisco, tendencia: geral.risco_tendencia || '', texto: geral.risco_texto || '' },
    status: { nivel: geral.status_crise || '', tendencia: geral.status_tendencia || '', texto: geral.status_texto || '' },
    novas: { qtd: novas, detalhe: detalheNovas },
    gerais: { qtd: gerais, desde },
    acumulado: { qtd: acumulado, desde, porRede },
    acionamentos: { linhas: linhasAc, novos: novosAc, abertos },
    tituloMudou: geral.titulo_o_que_mudou || 'O QUE MUDOU', mudou: geral.o_que_mudou || '',
    tituloSignifica: geral.titulo_o_que_significa || 'O QUE SIGNIFICA PARA O SICOOB', significa: geral.o_que_significa || '',
    protagonismo: geral.protagonismo || '',
    grafico, timeline,
    analise: {
      revisao: geral.analise_revisao_data || '', manchete: geral.analise_caso || '',
      papel: geral.papel_sicoob || '', centro: geral.centro_pauta || '',
      gatilhos: (geral.gatilhos_escalada || '').split('\n').map(g => g.trim()).filter(Boolean),
    },
    leitura: geral.leitura_acionamentos || '',
    clippings, avisos,
  };
}

/**
 * Nome do arquivo PDF, no padrão da pasta do portal:
 * "DD.MM.AAAA_TURNO_Título_Unidade" (ex.: "21.10.2026_TARDE_Apex_Sicoob-ES").
 * Na 1ª edição o turno é substituído por ABERTURA. Data e turno vêm da última atualização da edição (manhã até 11h59, tarde até 17h59, noite depois);
 * sem hora, o turno fica de fora. Espaços viram hífen e caracteres proibidos em nome de arquivo saem.
 */
export function nomeArquivo(r: Pick<Relatorio, 'ultimaAtualizacao' | 'titulo' | 'unidade' | 'edicao'>, nomeReserva = ''): string {
  const parte = (s: string) => (s || '').replace(/[\\/:*?"<>|]+/g, ' ').trim().replace(/\s+/g, '-');
  const d = lerData(r.ultimaAtualizacao);
  const data = d ? `${String(d.dia).padStart(2, '0')}.${String(d.mes).padStart(2, '0')}.${d.ano}` : '';
  const hora = d?.temHora ? new Date(d.ts).getHours() : null;
  // 1ª edição = ABERTURA (como na pasta do portal); as seguintes, o turno da atualização
  const turno = numeroEdicao(r.edicao) === 1 ? 'ABERTURA'
    : hora == null ? '' : hora < 12 ? 'MANHÃ' : hora < 18 ? 'TARDE' : 'NOITE';
  return [data, turno, parte(r.titulo || nomeReserva), parte(r.unidade)].filter(Boolean).join('_') || 'Relatorio-de-monitoramento';
}
