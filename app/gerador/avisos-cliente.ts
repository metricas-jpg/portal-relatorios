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

/** Quantos anexos ainda estão sendo carregados (o botão de gerar espera chegar a zero). */
declare global { interface Window { __anexosPendentes?: number } }

export function anexoPendente(delta: number) {
  if (typeof window === 'undefined') return;
  window.__anexosPendentes = Math.max(0, (window.__anexosPendentes || 0) + delta);
  window.dispatchEvent(new CustomEvent('anexos-mudou'));
}
