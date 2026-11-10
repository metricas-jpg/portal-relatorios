'use client';

import { useState } from 'react';

/**
 * Troca de edição na barra do relatório: muda o ?edicao= do endereço.
 * Recarrega a página inteira, para os anexos e avisos da edição anterior não ficarem na tela.
 * A última opção, "+ Nova edição", cria a linha da próxima edição em Configuracoes_Gerais
 * (copia títulos, unidade, risco, status, protagonismo e análise; textos e data ficam vazios).
 */
export default function SeletorEdicao({ edicoes, atual, planilha }: { edicoes: { numero: number; rotulo: string; data: string }[]; atual: number; planilha: string }) {
  const [criando, setCriando] = useState(false);
  const ultima = edicoes[edicoes.length - 1];
  const rotulo = (n: number) => String(n).padStart(2, '0');

  const novaEdicao = async () => {
    if (!ultima) return;
    const n = ultima.numero + 1;
    const ok = window.confirm(
      `Criar a edição ${rotulo(n)} na planilha?\n\n` +
      `Copia da edição ${rotulo(ultima.numero)}: títulos, unidade, início do monitoramento, risco, status, protagonismo e análise do caso.\n` +
      'Ficam vazios: O que mudou, O que significa, textos de risco e status, data e hora da atualização.',
    );
    if (!ok) return;
    setCriando(true);
    try {
      const res = await fetch('/api/nova-edicao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planilha, ultima: ultima.numero }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `O servidor respondeu ${res.status}`);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa de propósito
      window.location.assign(`?edicao=${d.numero}`);
    } catch (e) {
      window.alert(`Não foi possível criar a edição.\n\n${(e as Error).message}`);
      setCriando(false);
    }
  };

  return (
    <label className="flex items-center gap-2 text-xs text-slate-300">
      Edição
      <select
        value={criando ? 'nova' : atual}
        disabled={criando}
        onChange={e => {
          if (e.target.value === 'nova') { void novaEdicao(); return; }
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa de propósito (ver acima)
          window.location.assign(`?edicao=${e.target.value}`);
        }}
        className="bg-white/10 border border-white/20 text-white rounded-lg px-2 py-1.5 text-xs font-semibold outline-none focus:border-[#00AE9D] disabled:opacity-60"
      >
        {ultima && (
          <option value="nova" className="text-[#00695F] font-bold">
            {criando ? 'Criando edição…' : `+ Nova edição (${rotulo(ultima.numero + 1)})`}
          </option>
        )}
        {[...edicoes].reverse().map(e => (
          <option key={e.numero} value={e.numero} className="text-[#003641]">
            {e.rotulo}{e.data ? ` · ${e.data}` : ' · em aberto'}
          </option>
        ))}
      </select>
    </label>
  );
}
