'use client';

import { useMemo, useState } from 'react';
import type { Monitoramento } from '@/lib/planilhas';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca por nome entre os monitoramentos da planilha central. */
export default function BuscaMonitoramento({ lista }: { lista: Monitoramento[] }) {
  const [busca, setBusca] = useState('');
  const filtrada = useMemo(() => {
    const termos = semAcento(busca).split(/\s+/).filter(Boolean);
    return lista.filter(m => termos.every(t => semAcento(m.nome).includes(t)));
  }, [busca, lista]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 overflow-hidden">
      <div className="p-3 border-b border-slate-200/90">
        <label htmlFor="busca" className="sr-only">Buscar monitoramento</label>
        <input
          id="busca" type="search" autoFocus value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar pelo nome do monitoramento…"
          className="w-full px-4 py-2.5 rounded-xl bg-[#f4f7f8] border border-slate-200 text-sm outline-none focus:border-[#00AE9D] focus:ring-2 focus:ring-[#00AE9D]/20"
        />
      </div>
      {filtrada.length ? (
        <ul className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
          {filtrada.map(m => (
            <li key={m.id}>
              <a href={`/gerador/${m.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-[#00AE9D]/5 group">
                <span className="font-medium text-sm">{m.nome}</span>
                <span className="text-xs text-slate-400 group-hover:text-[#00AE9D] whitespace-nowrap">Abrir →</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-8 text-sm text-slate-500 text-center">
          {lista.length ? `Nenhum monitoramento com “${busca}”.` : 'Nenhum monitoramento com planilha cadastrada.'}
        </p>
      )}
      <p className="px-5 py-3 text-xs text-slate-500 bg-[#f4f7f8] border-t border-slate-200/90">
        {lista.length} {lista.length === 1 ? 'monitoramento' : 'monitoramentos'} com planilha na aba “Monitoramentos 2026”. Para incluir um novo, cole o link da planilha na coluna link_da_planilha_do_monitoramento.
      </p>
    </div>
  );
}
