import type { Relatorio } from './relatorio';

/**
 * Módulos do relatório que podem ser ligados e desligados no gerador. A página 1 é fixa.
 * A escolha é guardada por planilha e por edição (ver app/api/modulos): uma edição sem escolha
 * própria herda a da edição anterior mais próxima; sem nenhuma, vale o padrão.
 */
export const MODULOS = [
  { id: 'timeline', nome: 'Linha do tempo', onde: 'Página 2' },
  { id: 'acionamentos', nome: 'Acionamentos de imprensa', onde: 'Página 2 e card da página 1' },
  { id: 'contexto', nome: 'Contexto do caso', onde: 'Análise, papel do Sicoob e centro da pauta' },
  { id: 'gatilhos', nome: 'Gatilhos de escalada', onde: 'Página 3' },
  { id: 'anexos', nome: 'Anexos', onde: 'Páginas de clipping' },
] as const;

export type ModuloId = (typeof MODULOS)[number]['id'];
export type Selecao = Record<ModuloId, boolean>;
/** escolha salva de uma edição */
export interface EscolhaSalva { desligados: ModuloId[]; por: string; em: string }
export type EscolhasSalvas = Record<string, EscolhaSalva>;

export const IDS = MODULOS.map(m => m.id) as ModuloId[];
export const ehModulo = (v: unknown): v is ModuloId => typeof v === 'string' && (IDS as string[]).includes(v);

export const selecaoDe = (desligados: ModuloId[]): Selecao =>
  Object.fromEntries(IDS.map(id => [id, !desligados.includes(id)])) as Selecao;
export const desligadosDe = (s: Selecao): ModuloId[] => IDS.filter(id => !s[id]);

/** quantos itens cada módulo tem nesta edição (0 = "sem dados") */
export function contagens(r: Relatorio): Record<ModuloId, number> {
  const a = r.analise;
  return {
    timeline: r.timeline.length,
    acionamentos: r.acionamentos.linhas.length,
    contexto: [a.manchete, a.papel, a.centro].filter(t => (t || '').trim()).length,
    gatilhos: a.gatilhos.length,
    anexos: r.clippings.length,
  };
}

/** padrão: tudo ligado, menos o que não tem dados nesta edição */
export const padrao = (cont: Record<ModuloId, number>): Selecao =>
  Object.fromEntries(IDS.map(id => [id, cont[id] > 0])) as Selecao;

export type Origem =
  | { tipo: 'edicao'; edicao: number; por: string; em: string }
  | { tipo: 'anterior'; edicao: number; por: string; em: string }
  | { tipo: 'padrao' };

export function resolver(salvas: EscolhasSalvas, edicao: number, cont: Record<ModuloId, number>): { selecao: Selecao; origem: Origem } {
  const propria = salvas[String(edicao)];
  if (propria) return { selecao: selecaoDe(propria.desligados), origem: { tipo: 'edicao', edicao, por: propria.por, em: propria.em } };
  const anterior = Object.keys(salvas).map(Number).filter(n => n < edicao).sort((x, y) => y - x)[0];
  if (anterior != null) {
    const s = salvas[String(anterior)];
    return { selecao: selecaoDe(s.desligados), origem: { tipo: 'anterior', edicao: anterior, por: s.por, em: s.em } };
  }
  return { selecao: padrao(cont), origem: { tipo: 'padrao' } };
}

/** a que módulo um aviso do painel amarelo se refere (null = geral, sempre aparece) */
export function moduloDoAviso(aviso: string): ModuloId | null {
  if (/^Acionamentos_Imprensa/i.test(aviso)) return 'acionamentos';
  if (/^Anexo \d|anexo sem link|posicao_citacao|coluna do print/i.test(aviso)) return 'anexos';
  if (/linha do tempo|Mostrar Timeline|pr[oó]ximo marco/i.test(aviso)) return 'timeline';
  if (/^Contexto do caso:/i.test(aviso)) return 'contexto';
  return null;
}
