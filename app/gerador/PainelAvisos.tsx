'use client';

import { useEffect, useState } from 'react';
import { avisarRelatorio } from './avisos-cliente';

/**
 * Painel amarelo (não sai na impressão) com:
 * - avisos de preenchimento calculados no servidor;
 * - textos da página 1 que passaram do limite de linhas (elementos com data-limite);
 * - blocos maiores que uma página (avisados pelo Paginador).
 */
export default function PainelAvisos({ avisos }: { avisos: string[] }) {
  const [cliente, setCliente] = useState<string[]>([]);

  useEffect(() => {
    const atualizar = () => setCliente([...(window.__avisosRelatorio || [])]);
    window.addEventListener('relatorio-aviso', atualizar);
    atualizar();
    const verificar = () => {
      document.querySelectorAll<HTMLElement>('[data-limite]').forEach(el => {
        const cortado = el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
        if (cortado) avisarRelatorio(`Página 1: "${el.dataset.limite}" passou do espaço disponível e foi cortado. Encurte o texto na planilha.`);
      });
    };
    (document.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(verificar, 300));
    return () => window.removeEventListener('relatorio-aviso', atualizar);
  }, []);

  const todos = [...avisos, ...cliente];
  if (!todos.length) return null;
  return (
    <div className="print-hidden w-full max-w-[595pt] bg-[#FFF6CC] border border-[#E8D277] text-[#6B5300] p-5 rounded-xl shadow-sm">
      <h3 className="font-bold text-sm mb-3">Confira antes de gerar: {todos.length} {todos.length === 1 ? 'ponto' : 'pontos'} na planilha</h3>
      <ul className="text-xs grid grid-cols-1 gap-1.5 list-disc pl-5 bg-white/50 p-3 rounded border border-[#E8D277]/50">
        {todos.map((a, i) => <li key={i}>{a}</li>)}
      </ul>
      <p className="text-xs mt-3 opacity-90">Corrija na planilha e recarregue a página. O relatório abaixo já mostra como ficará com os dados atuais.</p>
    </div>
  );
}
