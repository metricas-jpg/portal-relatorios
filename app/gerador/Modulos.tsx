'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  MODULOS, desligadosDe, padrao, resolver,
  type EscolhasSalvas, type ModuloId, type Origem, type Selecao,
} from '@/lib/modulos';

/**
 * Escolha dos módulos do relatório (linha do tempo, acionamentos, contexto, gatilhos, anexos).
 * - Guardada por planilha e edição, compartilhada pela equipe (app/api/modulos). Sem o
 *   armazenamento configurado, fica só neste navegador.
 * - Muda a prévia na hora; nada do painel sai na impressão.
 */

type Status = 'carregando' | 'pronto' | 'salvando' | 'salvo' | 'erro';

interface Contexto {
  selecao: Selecao;
  ligado: (id: ModuloId) => boolean;
  alternar: (id: ModuloId) => void;
  restaurar: () => void;
  contagem: Record<ModuloId, number>;
  origem: Origem;
  status: Status;
  compartilhado: boolean;
}

const Ctx = createContext<Contexto | null>(null);

/** módulos ligados; fora do provedor (ex.: testes), tudo ligado */
export function useModulos(): Pick<Contexto, 'ligado' | 'selecao'> {
  const c = useContext(Ctx);
  return c ?? { ligado: () => true, selecao: Object.fromEntries(MODULOS.map(m => [m.id, true])) as Selecao };
}

const chaveLocal = (planilha: string) => `modulos:${planilha}`;
function lerLocal(planilha: string): EscolhasSalvas {
  try { return JSON.parse(localStorage.getItem(chaveLocal(planilha)) || '{}') as EscolhasSalvas; } catch { return {}; }
}
function gravarLocal(planilha: string, salvas: EscolhasSalvas) {
  try { localStorage.setItem(chaveLocal(planilha), JSON.stringify(salvas)); } catch { /* navegador sem armazenamento */ }
}

export function ModulosProvider({ planilha, edicao, contagem, children }: {
  planilha: string; edicao: number; contagem: Record<ModuloId, number>; children: ReactNode;
}) {
  const [selecao, setSelecao] = useState<Selecao>(() => padrao(contagem));
  const [origem, setOrigem] = useState<Origem>({ tipo: 'padrao' });
  const [status, setStatus] = useState<Status>('carregando');
  const [compartilhado, setCompartilhado] = useState(true);
  const salvasRef = useRef<EscolhasSalvas>({});
  const selecaoRef = useRef(selecao);
  useEffect(() => { selecaoRef.current = selecao; }, [selecao]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // carrega a escolha salva (da equipe ou, sem armazenamento, deste navegador)
  useEffect(() => {
    let vivo = true;
    fetch(`/api/modulos?planilha=${encodeURIComponent(planilha)}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { compartilhado: false, salvas: {} }))
      .catch(() => ({ compartilhado: false, salvas: {} }))
      .then((d: { compartilhado: boolean; salvas: EscolhasSalvas }) => {
        if (!vivo) return;
        const salvas = d.compartilhado ? d.salvas : lerLocal(planilha);
        salvasRef.current = salvas;
        const res = resolver(salvas, edicao, contagem);
        setCompartilhado(d.compartilhado);
        setSelecao(res.selecao);
        setOrigem(res.origem);
        setStatus('pronto');
      });
    return () => { vivo = false; };
  }, [planilha, edicao, contagem]);

  const salvar = useCallback((nova: Selecao) => {
    if (timer.current) clearTimeout(timer.current);
    setStatus('salvando');
    timer.current = setTimeout(async () => {
      const desligados = desligadosDe(nova);
      const local = { desligados, por: 'você', em: new Date().toISOString() };
      if (!compartilhado) {
        salvasRef.current = { ...salvasRef.current, [edicao]: local };
        gravarLocal(planilha, salvasRef.current);
        setOrigem({ tipo: 'edicao', edicao, por: local.por, em: local.em });
        setStatus('salvo');
        return;
      }
      try {
        const res = await fetch('/api/modulos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planilha, edicao, desligados }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const { salva } = await res.json();
        salvasRef.current = { ...salvasRef.current, [edicao]: salva };
        setOrigem({ tipo: 'edicao', edicao, por: salva.por, em: salva.em });
        setStatus('salvo');
      } catch {
        setStatus('erro');
      }
    }, 500);
  }, [compartilhado, edicao, planilha]);

  const alternar = useCallback((id: ModuloId) => {
    const nova = { ...selecaoRef.current, [id]: !selecaoRef.current[id] };
    selecaoRef.current = nova;
    setSelecao(nova);
    salvar(nova);
  }, [salvar]);

  const restaurar = useCallback(() => {
    const nova = padrao(contagem);
    setSelecao(nova);
    salvar(nova);
  }, [contagem, salvar]);

  const valor = useMemo<Contexto>(() => ({
    selecao, ligado: id => selecao[id], alternar, restaurar, contagem, origem, status, compartilhado,
  }), [selecao, alternar, restaurar, contagem, origem, status, compartilhado]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/* ============================== painel ============================== */

const quando = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const pessoa = (email: string) => (email.includes('@') ? email.split('@')[0] : email);

function textoOrigem(o: Origem, edicaoAtual: number) {
  if (o.tipo === 'padrao') return 'Padrão: tudo ligado, menos o que está sem dados.';
  if (o.tipo === 'anterior') return `Herdado da edição ${o.edicao} (${pessoa(o.por)}, ${quando(o.em)}). Ao mudar, salva para a edição ${edicaoAtual}.`;
  return `Escolha da edição ${o.edicao}: ${pessoa(o.por)}, ${quando(o.em)}.`;
}

/** total de folhas do relatório, atualizado quando páginas entram ou saem */
function useTotalPaginas() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const doc = document.querySelector('.doc');
    if (!doc) return;
    const contar = () => setN(doc.querySelectorAll(':scope > section.page, :scope section.page').length);
    contar();
    const obs = new MutationObserver(contar);
    obs.observe(doc, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);
  return n;
}

function Interruptor({ ligado, desativado, rotulo, onClick }: { ligado: boolean; desativado: boolean; rotulo: string; onClick: () => void }) {
  return (
    <button
      type="button" role="switch" aria-checked={ligado} aria-label={rotulo} onClick={onClick} disabled={desativado}
      className={`disabled:opacity-50 relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00AE9D] focus-visible:ring-offset-2 ${ligado ? 'bg-[#00AE9D]' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${ligado ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

export function PainelModulos({ edicao }: { edicao: number }) {
  const c = useContext(Ctx);
  const total = useTotalPaginas();
  if (!c) return null;
  const ligados = MODULOS.filter(m => c.selecao[m.id]).length;
  const meta = (id: ModuloId) => {
    const n = c.contagem[id];
    if (!n) return 'sem dados';
    if (id === 'anexos') return `${n} ${n === 1 ? 'publicação' : 'publicações'}`;
    if (id === 'contexto') return `${n} de 3 campos`;
    return `${n} ${n === 1 ? 'item' : 'itens'}`;
  };
  const statusTexto = c.status === 'carregando' ? 'Carregando escolha…'
    : c.status === 'salvando' ? 'Salvando…'
    : c.status === 'erro' ? 'Não foi possível salvar. Tente de novo.'
    : c.status === 'salvo' ? (c.compartilhado ? 'Salvo para toda a equipe.' : 'Salvo neste navegador.')
    : '';

  return (
    <aside
      aria-label="Montar relatório"
      className="print-hidden w-full max-w-[595pt] min-[1340px]:fixed min-[1340px]:left-5 min-[1340px]:top-5 min-[1340px]:w-60 min-[1340px]:max-w-none bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-[#1E2B30] z-40"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#003641]">Montar relatório</h2>
        <span className="text-xs text-slate-500" aria-live="polite">{total ? `${total} ${total === 1 ? 'página' : 'páginas'}` : ''}</span>
      </div>
      <p className="text-[11px] text-slate-500 mt-0.5">{ligados + 1} de {MODULOS.length + 1} partes</p>

      <ul className="mt-3 divide-y divide-slate-100">
        <li className="flex items-center justify-between gap-3 py-2">
          <span className="min-w-0">
            <span className="block text-sm font-medium">Página 1</span>
            <span className="block text-[11px] text-slate-500">Resumo, indicadores e gráfico</span>
          </span>
          <span className="text-slate-400" title="A página 1 sempre faz parte do relatório">
            <svg aria-label="fixa" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" strokeWidth="2" /><path d="M8 11V7a4 4 0 018 0v4" strokeWidth="2" strokeLinecap="round" /></svg>
          </span>
        </li>
        {MODULOS.map(m => {
          const on = c.selecao[m.id];
          const vazio = !c.contagem[m.id];
          return (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${on ? '' : 'text-slate-400'}`}>{m.nome}</span>
                <span className={`block text-[11px] ${vazio ? 'text-amber-700' : 'text-slate-500'}`}>{meta(m.id)}</span>
              </span>
              <Interruptor ligado={on} desativado={c.status === 'carregando'} rotulo={m.nome} onClick={() => c.alternar(m.id)} />
            </li>
          );
        })}
      </ul>

      <div className="mt-3 border-t border-slate-100 pt-3 space-y-1.5">
        <p className="text-[11px] leading-snug text-slate-500">{textoOrigem(c.origem, edicao)}</p>
        {!c.compartilhado && c.status !== 'carregando' && (
          <p className="text-[11px] leading-snug text-amber-700">A escolha fica só neste navegador: o armazenamento compartilhado ainda não foi configurado.</p>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[11px] ${c.status === 'erro' ? 'text-red-700' : 'text-[#00AE9D]'}`} aria-live="polite">{statusTexto}</span>
          <button type="button" onClick={c.restaurar} disabled={c.status === 'carregando'} className="text-[11px] font-semibold text-[#003641] hover:underline whitespace-nowrap">Restaurar padrão</button>
        </div>
      </div>
    </aside>
  );
}
