'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Botão "Gerar Relatório Final": espera os prints dos anexos terminarem de carregar
 * (eles já aparecem na tela como vão sair no PDF) e abre a janela de impressão / salvar como PDF.
 */
/**
 * O título da aba é usado pelo navegador como nome sugerido do PDF ("Salvar como PDF")
 * e como título dentro do arquivo. Ele é definido ao abrir a página e de novo antes de imprimir.
 */
export default function PrintController({ totalAnexos, nomeArquivo }: { totalAnexos: number; nomeArquivo: string }) {
  const [pendentes, setPendentes] = useState(0);
  const [esperando, setEsperando] = useState(false);
  const esperandoRef = useRef(false);

  const nomeRef = useRef(nomeArquivo);
  useEffect(() => { nomeRef.current = nomeArquivo; document.title = nomeArquivo; }, [nomeArquivo]);

  useEffect(() => {
    const abrir = () => { document.title = nomeRef.current; window.print(); };
    const imprimir = () => { esperandoRef.current = false; setEsperando(false); setTimeout(abrir, 300); };

    const atualizar = () => {
      const n = window.__anexosPendentes || 0;
      setPendentes(n);
      if (n === 0 && esperandoRef.current) imprimir();
    };
    window.addEventListener('anexos-mudou', atualizar);
    atualizar();
    return () => window.removeEventListener('anexos-mudou', atualizar);
  }, []);

  const gerar = () => {
    // pede aos anexos que ainda não carregaram para carregar agora (eles entram na contagem na hora)
    window.dispatchEvent(new CustomEvent('gerar-relatorio'));
    if ((window.__anexosPendentes || 0) > 0) { esperandoRef.current = true; setEsperando(true); }
    else { document.title = nomeRef.current; window.print(); }
  };

  return (
    <>
      <button onClick={gerar} className="bg-[#00AE9D] hover:bg-[#008f81] text-white text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition shadow-md border border-[#00AE9D]/30">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
        <span className="hidden sm:inline">{pendentes > 0 ? `Carregando ${pendentes} anexo(s)…` : 'Gerar Relatório Final'}</span>
        <span className="sm:hidden">Gerar Relatório</span>
      </button>

      {esperando && (
        <div className="print-hidden fixed inset-0 bg-[#003641]/95 z-[9999] flex flex-col items-center justify-center text-white backdrop-blur-sm">
          <div className="w-14 h-14 border-4 border-[#00AE9D] border-t-transparent rounded-full animate-spin mb-6"></div>
          <h2 className="text-2xl font-bold mb-2">Terminando de carregar os anexos…</h2>
          <p className="text-[#CADB2A] font-medium text-sm">Faltam {pendentes} de {totalAnexos}. A janela de impressão abre sozinha em seguida.</p>
        </div>
      )}
    </>
  );
}
