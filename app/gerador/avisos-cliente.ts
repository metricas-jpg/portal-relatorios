'use client';

/** Avisos detectados no navegador (texto cortado, bloco maior que a página), mostrados no painel amarelo. */
declare global { interface Window { __avisosRelatorio?: string[] } }

export function avisarRelatorio(msg: string) {
  if (typeof window === 'undefined') return;
  const lista = (window.__avisosRelatorio ||= []);
  if (lista.includes(msg)) return;
  lista.push(msg);
  window.dispatchEvent(new CustomEvent('relatorio-aviso'));
}
