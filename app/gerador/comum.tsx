import type { CSSProperties, ReactNode } from 'react';
import { normalizar, type Tom } from '@/lib/relatorio';

/* Peças comuns às páginas do relatório (usadas no servidor e no navegador). */

/** estilo de um texto posicionado pela linha de base (--b) */
export const st = (b: number | string, left?: number, extra?: CSSProperties) =>
  ({ '--b': typeof b === 'number' ? `${b}pt` : b, ...(left !== undefined && { left: `${left}pt` }), ...extra }) as CSSProperties;

/** medida em pt deslocada por uma variável CSS (página 1 elástica) */
export const mv = (valor: number, variavel: string, sinal: '+' | '-' = '+') => `calc(${valor}pt ${sinal} var(${variavel}))`;

/** limite de linhas; ultrapassar gera aviso no painel */
export const lim = (linhas: number, largura: number) =>
  ({ '--linhas': linhas, width: `${largura}pt` }) as CSSProperties;

/** **negrito** na planilha vira negrito no relatório */
export function rico(texto: string): ReactNode {
  if (!texto.includes('**')) return texto;
  return texto.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p));
}

export const vazio = (v: string, ph = '[__]') => (v && v.trim() ? v : ph);

/** seta da tendência: "Subindo" ↑, "Caindo"/"Descendo" ↓, qualquer outro valor → */
export function tendencia(t: string) {
  if (!t.trim()) return '';
  const n = normalizar(t);
  const seta = n.startsWith('SUB') || n.startsWith('ALT') ? '↑' : n.startsWith('CA') || n.startsWith('DESC') || n.startsWith('BAIX') ? '↓' : '→';
  return `${seta}  ${t.toUpperCase()}`;
}

export const RODAPE = 'Documento interno · Sicoob — não redistribuir fora do ambiente autorizado.';

export function Rodape() {
  return (
    <>
      <span className="t z75 i c-verm rodape">{RODAPE}</span>
      <span className="t z8 c-cinza r num" />
    </>
  );
}

export function CabecalhoInterno({ titulo, linha }: { titulo: string; linha: string }) {
  return (
    <>
      <div className="bg" style={{ height: '68.4pt' }} />
      <span className="t z12 b c-lima" style={st(30, 32.4)}>{titulo}</span>
      <span className="t z8 c-branco lim1" style={st(50, 32.4, { width: '420pt' })}>{linha}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo" src="/logo-sicoob.svg" alt="Sicoob" style={{ left: '465.85pt', top: '20.86pt', width: '97.17pt', height: '25.31pt' }} />
    </>
  );
}


export const COR_TOM: Record<Tom, string> = { neg: 'var(--vermelho)', neu: 'var(--cinza-tom)', pos: 'var(--verde-escuro)', acl: 'var(--cinza)', ctx: 'var(--cinza)', next: 'var(--roxo)' };

export function extrairId(url: string) {
  const m = (url || '').match(/[-\w]{25,}/);
  return m ? m[0] : '';
}
