/**
 * Lista de acessos do portal, guardada no próprio repositório (config/acessos.json).
 * Estas funções não dependem do servidor: são usadas também na página /acessos.
 */

export type TipoAcesso = 'email' | 'dominio';
/** portal = consulta os relatórios; gerador = portal + gerador de relatórios */
export type AreaAcesso = 'portal' | 'gerador';

export interface Acesso {
  tipo: TipoAcesso;
  valor: string;
  area: AreaAcesso;
  adicionado_por: string;
  adicionado_em: string;
}

export interface ArquivoAcessos { _leia?: string; acessos: Acesso[] }

/** quem vê o ícone de compartilhamento e administra a lista */
export const ADMINS = [
  'metricas@loggia.com.br',
  'emanuel.carvalho@loggia.com.br',
  'tauan.soriano@loggia.com.br',
  'gabriela.santiago@loggia.com.br',
];

/** domínio que sempre tem acesso ao portal e ao gerador */
export const DOMINIO_LOGGIA = 'loggia.com.br';

/** domínios de e-mail pessoal: liberar o domínio inteiro abriria o portal para qualquer pessoa */
export const DOMINIOS_PESSOAIS = [
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br', 'live.com',
  'msn.com', 'yahoo.com', 'yahoo.com.br', 'icloud.com', 'me.com', 'uol.com.br', 'bol.com.br', 'terra.com.br',
  'ig.com.br', 'proton.me', 'protonmail.com',
];

const EMAIL_RE = /^[^\s@]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const DOMINIO_RE = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** "  @Sicoob.com.br " → "sicoob.com.br" */
export function normalizar(tipo: TipoAcesso, valor: string) {
  const v = (valor || '').trim().toLowerCase();
  return tipo === 'dominio' ? v.replace(/^@/, '') : v;
}

/** mensagem de erro, ou '' se o valor pode ser adicionado */
export function validar(tipo: TipoAcesso, valor: string): string {
  if (!valor) return tipo === 'email' ? 'Digite um e-mail.' : 'Digite um domínio.';
  if (tipo === 'email' && !EMAIL_RE.test(valor)) return 'E-mail inválido.';
  if (tipo === 'dominio' && !DOMINIO_RE.test(valor)) return 'Domínio inválido. Use o formato empresa.com.br, sem @.';
  const dominio = tipo === 'email' ? valor.split('@')[1] : valor;
  if (dominio === DOMINIO_LOGGIA || dominio.endsWith('.' + DOMINIO_LOGGIA)) return 'E-mails @loggia.com.br já têm acesso ao portal e ao gerador.';
  if (tipo === 'dominio' && DOMINIOS_PESSOAIS.includes(valor)) return `${valor} é um domínio de e-mail pessoal: liberá-lo abriria o portal para qualquer pessoa. Adicione o e-mail específico.`;
  return '';
}

/** área do e-mail na lista (o e-mail específico vale mais que o domínio), ou null */
export function areaNaLista(email: string, lista: Acesso[]): AreaAcesso | null {
  const e = email.toLowerCase().trim();
  const proprio = lista.find(a => a.tipo === 'email' && a.valor === e);
  if (proprio) return proprio.area;
  const dominios = lista.filter(a => a.tipo === 'dominio' && e.endsWith('@' + a.valor));
  if (dominios.some(a => a.area === 'gerador')) return 'gerador';
  return dominios.length ? 'portal' : null;
}
