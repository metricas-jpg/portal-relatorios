import type { RelatorioDados, RegistroCentral } from './google-sheets';

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

/**
 * Rede de um registro, considerando o "Tipo de Registro":
 * - "Evento ..." (Evento Jurídico, Evento Factual): não é publicação, não entra nos números,
 *   mesmo que a coluna Canal/Veiculo esteja preenchida (continua podendo ir para a linha do tempo);
 * - demais tipos: a rede vem do Canal/Veiculo.
 */
export function redeDoRegistro(tipo: string, canal: string): Rede | null {
  if (normalizar(tipo).startsWith('EVENTO')) return null;
  return redeDoCanal(canal);
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
export interface ItemTimeline { data: string; texto: string; tom: Tom; complemento?: string }
export interface DiaGrafico { rotulo: string; porRede: Record<Rede, number>; total: number }
export interface Clipping {
  idUnico: string; rede: Rede; veiculo: string; titulo: string; dataPost: string; dataColeta: string;
  link: string; autoria: string; tonalidade: string; tom: Tom; trecho: string; printUrl: string;
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
  acionamentos: { linhas: Acionamento[]; abertos: number };
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

export function montarRelatorio(dados: RelatorioDados): Relatorio {
  const { registros = [], acionamentos = [] } = dados;
  // datas de Configuracoes_Gerais no formato do relatório (a validação da planilha não traz o "h")
  const geral: Record<string, string> = { ...(dados.geral || {}) };
  (['periodo_inicio', 'inicio_monitoramento', 'ultima_atualizacao'] as const).forEach(k => { if (geral[k]) geral[k] = formatarDataHora(geral[k]); });
  const avisos: string[] = [];
  if (geral.erro_api) avisos.push(`Erro de conexão com a planilha: ${geral.erro_api}`);
  avisos.push(...(dados.avisosLeitura || []));

  // Campos que o relatório usa e que não existem (ou estão vazios) na aba Configuracoes_Gerais
  const esperados: [string, string][] = [
    ['titulo_crise', 'título do caso'], ['subtitulo_unidade', 'unidade'], ['edicao_numero', 'número da edição'],
    ['periodo_inicio', 'início do período desta edição'], ['risco_tendencia', 'tendência do risco'],
    ['status_tendencia', 'tendência do status'],
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

  // ---------- registros ----------
  type Reg = RegistroCentral & { rede: Rede | null; dPost: DataLida | null; dRef: DataLida | null; linha: number };
  const regs: Reg[] = registros.map((r, i) => {
    const dPost = lerData(r.dataPost, refUltima);
    const dColeta = lerData(r.dataColeta, refUltima);
    const rede = redeDoRegistro(r.tipo, r.plataforma);
    if (!rede && !normalizar(r.tipo).startsWith('EVENTO') && /IMPRENSA|MATERIA|REDE|MENCAO|POST/.test(normalizar(r.tipo)))
      avisos.push(`Registro_Central, linha ${i + 2}: tipo "${r.tipo}" sem Canal/Veículo; a publicação ficou fora dos números.`);
    return { ...r, rede, dPost, dRef: dColeta || dPost, linha: i + 2 };
  });
  const publicacoes = regs.filter(r => r.rede);
  const doSicoob = publicacoes.filter(r => r.envolveSicoob);
  const vol = (r: RegistroCentral) => r.volume || 1;

  const porRede = zeroRedes();
  doSicoob.forEach(r => { porRede[r.rede!] += vol(r); });
  const acumulado = doSicoob.reduce((a, r) => a + vol(r), 0);
  const gerais = publicacoes.reduce((a, r) => a + vol(r), 0);
  // canais que parecem rede social mas não estão entre as 6 do relatório caem em Imprensa
  const suspeitos = [...new Set(publicacoes.filter(r => r.rede === 'imp' && /tiktok|kwai|threads|telegram|whats|reddit|pinterest|bluesky|rede|social/i.test(r.plataforma)).map(r => r.plataforma.trim()))];
  if (suspeitos.length) avisos.push(`Canais contados como Imprensa no gráfico: ${suspeitos.join(', ')}. O relatório só separa Instagram, X/Twitter, Facebook, LinkedIn e YouTube.`);

  publicacoes.filter(r => !r.dPost).forEach(r =>
    avisos.push(`Registro_Central, linha ${r.linha}: data do post "${r.dataPost || 'vazia'}" não é uma data (DD/MM); a publicação fica fora do gráfico.`));

  // ---------- novas menções e período ----------
  const refPeriodo = lerData(geral.periodo_inicio || '', refUltima);
  if (refPeriodo && refUltima && chaveDia(refPeriodo) > chaveDia(refUltima)) {
    avisos.push(`Configuracoes_Gerais: periodo_inicio (${geral.periodo_inicio}) é posterior a ultima_atualizacao (${ultima}). Confira as datas: "Novas menções" fica zerado.`);
  }
  let novas: number;
  if (refPeriodo && refUltima) {
    const de = chaveDia(refPeriodo), ate = chaveDia(refUltima);
    novas = doSicoob.filter(r => r.dRef && chaveDia(r.dRef) >= de && chaveDia(r.dRef) <= ate).reduce((a, r) => a + vol(r), 0);
  } else if (inicioMon && inicioMon === ultima) {
    novas = acumulado;
  } else {
    novas = refUltima ? doSicoob.filter(r => r.dRef && chaveDia(r.dRef) >= chaveDia(refUltima)).reduce((a, r) => a + vol(r), 0) : 0;
    avisos.push('Sem "periodo_inicio" em Configuracoes_Gerais: "Novas menções" conta só o que foi coletado no dia da última atualização, e o período começa no início do monitoramento.');
  }
  const maisRecente = [...doSicoob].filter(r => r.dPost).sort((a, b) => b.dPost!.ts - a.dPost!.ts)[0];
  const detalheNovas = geral.novas_mencoes_detalhe ||
    (maisRecente ? `Última: ${ddmm(maisRecente.dPost!)}${maisRecente.rede === 'imp' ? ` (${maisRecente.plataforma})` : ` (${nomeRede(maisRecente.rede!)})`}` : 'nesta edição');

  // ---------- gráfico ----------
  const dias = new Map<number, DiaGrafico>();
  doSicoob.filter(r => r.dPost).forEach(r => {
    const k = chaveDia(r.dPost!);
    if (!dias.has(k)) dias.set(k, { rotulo: ddmm(r.dPost!), porRede: zeroRedes(), total: 0 });
    const d = dias.get(k)!; d.porRede[r.rede!] += vol(r); d.total += vol(r);
  });
  const grafico = [...dias.entries()].sort((a, b) => a[0] - b[0]).map(([, d]) => d);
  if (grafico.length > 21) avisos.push(`O gráfico tem ${grafico.length} dias com menções; para não sobrepor, parte das datas do eixo fica oculta${grafico.length > 46 ? ' e os números acima das barras também' : ''}.`);

  // ---------- linha do tempo ----------
  const itens = regs.filter(r => r.mostrarTimeline).map((r, ordem) => {
    const texto = r.textoTimeline || r.fato || '';
    let tom: Tom; let complemento: string | undefined;
    const t = tomDaTonalidade(r.tonalidade);
    if (r.proximoMarco) {
      tom = 'next';
      complemento = r.dPost ? ddmm(r.dPost) : (r.dataPost || 'Data a confirmar');
    } else if (!r.envolveSicoob) {
      tom = 'ctx';
      if (t) avisos.push(`Registro_Central, linha ${r.linha}: tonalidade ${normalizar(r.tonalidade)} com "Envolve Sicoob? = NÃO". Na linha do tempo ele aparece como contexto (sem menção ao Sicoob).`);
    } else if (t) {
      tom = t;
    } else {
      tom = 'acl';
      avisos.push(`Registro_Central, linha ${r.linha}: envolve o Sicoob mas a tonalidade "${r.tonalidade || 'vazia'}" não é NEGATIVA, NEUTRA ou POSITIVA; aparece como [A CLASSIFICAR].`);
    }
    if (!texto) avisos.push(`Registro_Central, linha ${r.linha}: marcado para a linha do tempo, mas sem texto.`);
    // data completa (19/10/2026) aparece como dd/mm, igual ao modelo; faixas e textos ficam como estão
    const data = r.dPost && /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(r.dataPost.trim()) ? ddmm(r.dPost) : (r.dataPost || '');
    return { item: { data, texto, tom, complemento } as ItemTimeline, ts: r.dPost?.ts, proximo: r.proximoMarco, ordem };
  });
  // Próximo marco primeiro; depois do mais recente para o mais antigo; itens sem data no fim
  itens.sort((a, b) =>
    (+b.proximo - +a.proximo) ||
    ((a.ts == null ? 1 : 0) - (b.ts == null ? 1 : 0)) ||
    ((b.ts ?? 0) - (a.ts ?? 0)) || (a.ordem - b.ordem));
  const timeline = itens.map(i => i.item);

  // ---------- acionamentos ----------
  const linhasAc: Acionamento[] = [];
  acionamentos.forEach((a, i) => {
    const preenchido = Object.values(a).some(v => (v || '').trim());
    if (!preenchido) return;
    const faltam = (['data', 'veiculo', 'demanda'] as const).filter(k => !(a[k] || '').trim());
    if (faltam.length) { avisos.push(`Acionamentos_Imprensa, linha ${i + 2}: falta ${faltam.join(', ')}; a linha ficou fora do relatório.`); return; }
    linhasAc.push(a);
  });
  const abertos = linhasAc.filter(a => !/fechad|encerrad|respondid|conclu|finaliz/i.test(normalizar(a.status).toLowerCase())).length;

  // ---------- anexos ----------
  const clippings: Clipping[] = regs.filter(r => r.gerarClipping).map((r, i) => {
    if (!r.trecho) avisos.push(`Registro_Central, linha ${r.linha}: anexo sem "Trecho sobre o Sicoob".`);
    if (!r.printUrl) avisos.push(`Registro_Central, linha ${r.linha}: anexo sem link na COLUNA PRINT.`);
    if (!r.rede) avisos.push(`Registro_Central, linha ${r.linha}: anexo sem Canal/Veículo; foi tratado como Imprensa.`);
    return {
      idUnico: `clip_${i}`, rede: r.rede || 'imp', veiculo: r.plataforma && r.plataforma !== '-' ? r.plataforma : '',
      titulo: r.fato, dataPost: r.dPost ? `${ddmm(r.dPost)}/${r.dPost.ano}` : r.dataPost, dataColeta: r.dataColeta,
      link: r.linkMateria, autoria: r.autoria, tonalidade: r.tonalidade, tom: tomDaTonalidade(r.tonalidade) || 'acl',
      trecho: r.trecho, printUrl: r.printUrl,
    };
  });

  // ---------- risco (cores definidas pela equipe) ----------
  const nivelRisco = (geral.nivel_risco || 'BAIXO').toUpperCase();
  const nr = normalizar(nivelRisco);
  const corRisco = nr === 'ALTO' ? '#003641' : nr === 'MEDIO' ? '#c9d200' : '#7db61c';

  return {
    orgao: geral.titulo_orgao || 'Presidência - Superintendência Negócios Digitais, Marketing e Experiência do Cooperado',
    titulo: geral.titulo_crise || '', unidade: geral.subtitulo_unidade || '',
    inicio: inicioMon, edicao: geral.edicao_numero || '',
    periodoDe: (geral.periodo_inicio || inicioData).replace(/(\d{1,2}\/\d{1,2})\/\d{2,4}/, '$1'), periodoAte: ultima, ultimaAtualizacao: ultima,
    risco: { nivel: nivelRisco, cor: corRisco, tendencia: geral.risco_tendencia || '', texto: geral.risco_texto || '' },
    status: { nivel: geral.status_crise || '', tendencia: geral.status_tendencia || '', texto: geral.status_texto || '' },
    novas: { qtd: novas, detalhe: detalheNovas },
    gerais: { qtd: gerais, desde },
    acumulado: { qtd: acumulado, desde, porRede },
    acionamentos: { linhas: linhasAc, abertos },
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
