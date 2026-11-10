'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Reordenavel } from '@/lib/relatorio';

/**
 * Modo edição do gerador (interruptor na barra). Nesta fase:
 * - mostra o painel "Montar relatório";
 * - permite reordenar itens EMPATADOS (mesma Data Coleta e mesma Data do post, nos anexos; mesmo
 *   dia de post, na linha do tempo) com ↑ ↓, e gravar a ordem na coluna "prioridade" da planilha.
 * A ordem editada vale para as duas listas: a prioridade é por linha da planilha.
 * Desligado, a tela fica igual ao PDF.
 */

type Status = { tipo: 'ocioso' } | { tipo: 'salvando' } | { tipo: 'salvo'; linhas: number[] } | { tipo: 'erro'; mensagem: string };

interface Contexto {
  ligado: boolean;
  alternar: () => void;
  /** a planilha tem a coluna prioridade */
  temPrioridade: boolean;
  /** devolve os itens na ordem atual (com as mudanças ainda não salvas) */
  ordenar: <T extends Reordenavel>(itens: T[]) => T[];
  /** move o item dentro do seu grupo de empate (na lista já ordenada) */
  mover: <T extends Reordenavel>(lista: T[], linha: number, direcao: -1 | 1) => void;
  /** tamanho do grupo de empate do item na lista (1 = sem empate) */
  empatados: <T extends Reordenavel>(lista: T[], item: T) => number;
  pendentes: number;
  salvar: () => Promise<void>;
  descartar: () => void;
  voltarAutomatica: () => void;
  status: Status;
}

const Ctx = createContext<Contexto | null>(null);

const SEM_EDICAO: Contexto = {
  ligado: false, alternar: () => {}, temPrioridade: false, ordenar: i => i, mover: () => {}, empatados: () => 1,
  pendentes: 0, salvar: async () => {}, descartar: () => {}, voltarAutomatica: () => {}, status: { tipo: 'ocioso' },
};
export const useEdicao = () => useContext(Ctx) ?? SEM_EDICAO;

/** blocos de itens vizinhos com o mesmo grupo (só agrupa quem tem grupo) */
function blocos<T extends Reordenavel>(lista: T[]): T[][] {
  const out: T[][] = [];
  lista.forEach(it => {
    const ult = out[out.length - 1];
    if (ult && it.grupo && ult[0].grupo === it.grupo) ult.push(it); else out.push([it]);
  });
  return out;
}

export function EdicaoProvider({ planilha, temPrioridade, itens, children }: {
  planilha: string; temPrioridade: boolean;
  /** todos os itens reordenáveis do relatório (anexos e linha do tempo), para saber a prioridade lida */
  itens: Reordenavel[];
  children: ReactNode;
}) {
  const [ligado, setLigado] = useState(false);
  // prioridades alteradas nesta tela (linha → prioridade; null = apagar)
  const [mudancas, setMudancas] = useState<Map<number, number | null>>(new Map());
  // prioridades já gravadas nesta sessão (a página não recarrega depois de salvar)
  const [gravadas, setGravadas] = useState<Map<number, number | null>>(new Map());
  const [status, setStatus] = useState<Status>({ tipo: 'ocioso' });

  const porLinha = useMemo(() => {
    const m = new Map<number, Reordenavel>();
    itens.forEach(i => { if (!m.has(i.linha)) m.set(i.linha, i); });
    return m;
  }, [itens]);

  const prio = useCallback((it: Reordenavel) => {
    if (mudancas.has(it.linha)) return mudancas.get(it.linha) ?? null;
    if (gravadas.has(it.linha)) return gravadas.get(it.linha) ?? null;
    return it.prioridade;
  }, [mudancas, gravadas]);

  const ordenar = useCallback(<T extends Reordenavel>(lista: T[]): T[] => {
    if (!mudancas.size && !gravadas.size) return lista;
    return blocos(lista).flatMap(b => b.length < 2 ? b : b
      .map((it, pos) => ({ it, pos }))
      .sort((a, c) => ((prio(a.it) ?? Infinity) - (prio(c.it) ?? Infinity) || 0) || a.pos - c.pos)
      .map(x => x.it));
  }, [mudancas, gravadas, prio]);

  const empatados = useCallback(<T extends Reordenavel>(lista: T[], item: T) => {
    if (!item.grupo) return 1;
    return lista.filter(i => i.grupo === item.grupo).length;
  }, []);

  const mover = useCallback(<T extends Reordenavel>(lista: T[], linha: number, direcao: -1 | 1) => {
    const bloco = blocos(lista).find(b => b.some(i => i.linha === linha));
    if (!bloco || bloco.length < 2) return;
    const i = bloco.findIndex(x => x.linha === linha), j = i + direcao;
    if (j < 0 || j >= bloco.length) return;
    const nova = [...bloco];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setMudancas(m => {
      const n = new Map(m);
      nova.forEach((it, k) => n.set(it.linha, k + 1));
      return n;
    });
    setStatus({ tipo: 'ocioso' });
  }, []);

  // só conta o que de fato difere do que está na planilha
  const alteradas = useMemo(() => [...mudancas].filter(([linha, p]) => {
    const it = porLinha.get(linha);
    const atual = gravadas.has(linha) ? gravadas.get(linha) ?? null : it?.prioridade ?? null;
    return it && atual !== p;
  }), [mudancas, gravadas, porLinha]);

  const salvar = useCallback(async () => {
    if (!alteradas.length) return;
    setStatus({ tipo: 'salvando' });
    try {
      const res = await fetch('/api/prioridade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planilha,
          itens: alteradas.map(([linha, prioridade]) => {
            const it = porLinha.get(linha)!;
            return { linha, prioridade, idPrint: it.idPrint, fato: it.fato };
          }),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `O servidor respondeu ${res.status}`);
      setGravadas(g => { const n = new Map(g); alteradas.forEach(([l, p]) => n.set(l, p)); return n; });
      setMudancas(new Map());
      setStatus({ tipo: 'salvo', linhas: d.gravadas || alteradas.map(([l]) => l) });
    } catch (e) {
      setStatus({ tipo: 'erro', mensagem: (e as Error).message });
    }
  }, [alteradas, planilha, porLinha]);

  const descartar = useCallback(() => { setMudancas(new Map()); setStatus({ tipo: 'ocioso' }); }, []);

  // "Voltar à ordem automática": apaga a prioridade de todos os itens que têm uma
  const voltarAutomatica = useCallback(() => {
    setMudancas(() => {
      const n = new Map<number, number | null>();
      porLinha.forEach((it, linha) => {
        const atual = gravadas.has(linha) ? gravadas.get(linha) ?? null : it.prioridade;
        if (atual != null) n.set(linha, null);
      });
      return n;
    });
    setStatus({ tipo: 'ocioso' });
  }, [porLinha, gravadas]);

  const valor = useMemo<Contexto>(() => ({
    ligado, alternar: () => setLigado(l => !l), temPrioridade, ordenar, mover, empatados,
    pendentes: alteradas.length, salvar, descartar, voltarAutomatica, status,
  }), [ligado, temPrioridade, ordenar, mover, empatados, alteradas.length, salvar, descartar, voltarAutomatica, status]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/* ============================== controles ============================== */

/** interruptor "Modo edição" (barra do gerador) */
export function InterruptorEdicao() {
  const e = useEdicao();
  return (
    <button
      type="button" role="switch" aria-checked={e.ligado} onClick={e.alternar}
      className="shrink-0 inline-flex items-center gap-2 text-xs font-semibold text-white/90 hover:text-white"
      title="Mostra os controles de edição (não saem no PDF)"
    >
      <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${e.ligado ? 'bg-[#00AE9D]' : 'bg-white/25'}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${e.ligado ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
      Modo edição
      {e.pendentes > 0 && <span className="rounded-full bg-[#C9D200] text-[#003641] px-1.5 text-[10px] font-bold">{e.pendentes}</span>}
    </button>
  );
}

/** faixa abaixo da barra, com salvar / voltar à ordem automática */
export function FaixaEdicao({ grupos }: { grupos: number }) {
  const e = useEdicao();
  if (!e.ligado) return null;
  const st = e.status;
  return (
    <div className="print-hidden w-full max-w-[595pt] rounded-xl border border-[#B5E6E0] bg-[#E3F6F4] text-[#00695F] px-4 py-3 text-xs flex flex-wrap items-center gap-x-4 gap-y-2" aria-live="polite">
      <span className="min-w-0 flex-1">
        <b className="text-[#003641]">Modo edição.</b>{' '}
        {!e.temPrioridade
          ? <>Para reordenar empates nesta planilha, crie a coluna <b>prioridade</b> no Registro_Central e recarregue a página.</>
          : grupos
            ? <>Use ↑ ↓ para reordenar itens com a mesma data ({grupos} {grupos === 1 ? 'grupo empatado' : 'grupos empatados'}).</>
            : <>Nenhum item empatado neste relatório.</>}
        {st.tipo === 'salvo' && <span className="block mt-1 text-[#00695F]">✓ Prioridade gravada na planilha (linha {st.linhas.join(', ')}).</span>}
        {st.tipo === 'erro' && <span className="block mt-1 text-red-700">{st.mensagem}</span>}
      </span>
      {e.temPrioridade && (
        <span className="flex items-center gap-2">
          <button type="button" onClick={e.voltarAutomatica} className="font-semibold text-[#003641] hover:underline">Voltar à ordem automática</button>
          {e.pendentes > 0 && <button type="button" onClick={e.descartar} className="font-semibold text-[#003641] hover:underline">Descartar</button>}
          <button
            type="button" onClick={e.salvar} disabled={!e.pendentes || st.tipo === 'salvando'}
            className="rounded-lg bg-[#003641] text-white font-bold px-3 py-1.5 disabled:opacity-40"
          >
            {st.tipo === 'salvando' ? 'Salvando…' : e.pendentes ? `Salvar na planilha (${e.pendentes})` : 'Salvar na planilha'}
          </button>
        </span>
      )}
    </div>
  );
}

/** botões ↑ ↓ (não saem no PDF) */
export function Setas({ podeSubir, podeDescer, onMover, rotulo }: { podeSubir: boolean; podeDescer: boolean; onMover: (d: -1 | 1) => void; rotulo: string }) {
  const cls = 'w-[18pt] h-[16pt] grid place-items-center rounded-md border border-[#B5E6E0] bg-white text-[#00695F] font-bold hover:bg-[#E3F6F4] disabled:opacity-30';
  return (
    <span className="print-hidden inline-flex gap-1">
      <button type="button" className={cls} disabled={!podeSubir} onClick={() => onMover(-1)} aria-label={`Subir ${rotulo}`}>↑</button>
      <button type="button" className={cls} disabled={!podeDescer} onClick={() => onMover(1)} aria-label={`Descer ${rotulo}`}>↓</button>
    </span>
  );
}
