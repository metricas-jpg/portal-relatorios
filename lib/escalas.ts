/**
 * Escalas de risco e de status da crise: usadas na régua dos cards da página 1, nos avisos do
 * painel e (no modo edição) nas listas fechadas. "curto" vai no card; "completo" no guia e na lista.
 */
export interface Nivel { rotulo: string; curto: string; completo: string }

export const ESCALA_RISCO: Nivel[] = [
  { rotulo: 'Baixo', curto: 'Sicoob ausente ou citado de passagem; semanal', completo: 'Sicoob ausente ou citado de passagem; monitoramento semanal' },
  { rotulo: 'Médio', curto: 'parte do fato ou acionado; diário', completo: 'Sicoob é parte do fato ou foi acionado; monitoramento diário' },
  { rotulo: 'Alto', curto: 'ato de autoridade, tom negativo ou grande alcance; várias vezes ao dia', completo: 'ato de autoridade, tom negativo ou grande alcance; monitoramento várias vezes ao dia' },
];

export const ESCALA_STATUS: Nivel[] = [
  { rotulo: 'Latente', curto: 'início, sem repercussão', completo: 'o risco existe, mas ainda está no início ou sem repercussão relevante' },
  { rotulo: 'Em alta', curto: 'repercussão crescendo', completo: 'o tema ganha tração e a repercussão começa a crescer' },
  { rotulo: 'Crítico', curto: 'pico de repercussão ou impacto', completo: 'pico máximo de repercussão e/ou maior potencial de impacto' },
  { rotulo: 'Em queda', curto: 'perdendo força', completo: 'a repercussão começa a perder força' },
  { rotulo: 'Controlada', curto: 'contida, sem agravamento', completo: 'a situação foi contida, sem novos sinais de agravamento' },
  { rotulo: 'Monitorada', curto: 'estabilizada', completo: 'situação estabilizada' },
];

/** valores da escala de status anterior (antes de nov/2026), para avisar quem ainda os usa */
export const STATUS_ANTIGOS = ['SINAIS', 'FASE AGUDA', 'EM DESDOBRAMENTO', 'CONTROLADO', 'ENCERRADO'];

const chave = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
/** mesma palavra no masculino ou feminino ("CONTROLADO" = "CONTROLADA", "CRÍTICA" = "CRÍTICO") */
const semGenero = (s: string) => chave(s).replace(/[AO]$/, '');

/** nível da escala que corresponde ao valor da planilha (ou null) */
export function nivelDaEscala(valor: string, escala: Nivel[]): Nivel | null {
  const v = chave(valor);
  if (!v) return null;
  return escala.find(n => chave(n.rotulo) === v) || escala.find(n => semGenero(n.rotulo) === semGenero(v)) || null;
}
