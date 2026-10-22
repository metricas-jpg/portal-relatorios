'use client';

/**
 * Troca de edição na barra do relatório: muda o ?edicao= do endereço.
 * Recarrega a página inteira, para os anexos e avisos da edição anterior não ficarem na tela.
 */
export default function SeletorEdicao({ edicoes, atual }: { edicoes: { numero: number; rotulo: string; data: string }[]; atual: number }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-300">
      Edição
      <select
        value={atual}
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa de propósito (ver acima)
        onChange={e => window.location.assign(`?edicao=${e.target.value}`)}
        className="bg-white/10 border border-white/20 text-white rounded-lg px-2 py-1.5 text-xs font-semibold outline-none focus:border-[#00AE9D]"
      >
        {[...edicoes].reverse().map(e => (
          <option key={e.numero} value={e.numero} className="text-[#003641]">
            {e.rotulo}{e.data ? ` · ${e.data}` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
