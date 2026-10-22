'use client';

import { useEffect, useState } from 'react';
import { normalizar, validar, type Acesso, type AreaAcesso, type TipoAcesso } from '@/lib/acessos';

type Item = Acesso & { publicado: boolean };

const AREAS: { valor: AreaAcesso; rotulo: string; dica: string }[] = [
  { valor: 'portal', rotulo: 'Portal', dica: 'Consulta e baixa os relatórios' },
  { valor: 'gerador', rotulo: 'Portal + gerador', dica: 'Também gera relatórios novos' },
];

const dataBR = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function GerenciarAcessos() {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [removendo, setRemovendo] = useState<Acesso[]>([]);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState('');

  async function chamar(metodo: 'POST' | 'DELETE', corpo: object) {
    const res = await fetch('/api/acessos', {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(dados.error || 'Não foi possível concluir. Tente de novo.');
    setItens(dados.acessos);
    setRemovendo(dados.removendo || []);
  }

  useEffect(() => {
    let vivo = true;
    fetch('/api/acessos')
      .then(async res => {
        const dados = await res.json().catch(() => ({}));
        if (!vivo) return;
        if (!res.ok) { setErro(dados.error || 'Não foi possível carregar a lista.'); setItens([]); return; }
        setItens(dados.acessos); setRemovendo(dados.removendo || []);
      })
      .catch(() => { if (vivo) { setErro('Não foi possível carregar a lista.'); setItens([]); } });
    return () => { vivo = false; };
  }, []);

  async function executar(id: string, acao: () => Promise<void>) {
    setOcupado(id); setErro('');
    try { await acao(); } catch (e) { setErro((e as Error).message); } finally { setOcupado(''); }
  }

  const pendentes = (itens || []).some(i => !i.publicado) || removendo.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {erro && <div className="bg-[#FFF6CC] border border-[#E8D277] text-[#6B5300] text-sm p-4 rounded-xl leading-relaxed">{erro}</div>}
      {pendentes && (
        <div className="bg-[#00AE9D]/10 border border-[#00AE9D]/30 text-[#003641] text-sm p-4 rounded-xl leading-relaxed">
          Alterações salvas. O site está sendo republicado e elas passam a valer em 1 a 2 minutos. Recarregue esta página para conferir.
        </div>
      )}
      {(['email', 'dominio'] as TipoAcesso[]).map(tipo => (
        <Secao
          key={tipo} tipo={tipo} ocupado={ocupado}
          itens={itens?.filter(i => i.tipo === tipo) ?? null}
          removendo={removendo.filter(r => r.tipo === tipo)}
          adicionar={(valor, area) => executar(`add-${tipo}`, () => chamar('POST', { tipo, valor, area }))}
          remover={valor => executar(`del-${tipo}-${valor}`, () => chamar('DELETE', { tipo, valor }))}
          mudarArea={(valor, area) => executar(`area-${tipo}-${valor}`, () => chamar('POST', { tipo, valor, area }))}
        />
      ))}
      <p className="text-xs text-slate-500 leading-relaxed">
        A lista fica no código do site (arquivo <code>config/acessos.json</code> no GitHub). Cada alteração vira um registro no
        histórico do repositório, com quem fez e quando.
      </p>
    </div>
  );
}

function Secao({ tipo, itens, removendo, ocupado, adicionar, remover, mudarArea }: {
  tipo: TipoAcesso; itens: Item[] | null; removendo: Acesso[]; ocupado: string;
  adicionar: (valor: string, area: AreaAcesso) => Promise<void>;
  remover: (valor: string) => Promise<void>;
  mudarArea: (valor: string, area: AreaAcesso) => Promise<void>;
}) {
  const [valor, setValor] = useState('');
  const [area, setArea] = useState<AreaAcesso>('portal');
  const [aviso, setAviso] = useState('');
  const email = tipo === 'email';
  const titulo = email ? 'E-mails específicos' : 'Domínios inteiros';
  const exemplo = email ? 'pessoa@sicoob.com.br' : 'sicoob.com.br';

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const v = normalizar(tipo, valor);
    const problema = validar(tipo, v);
    if (problema) { setAviso(problema); return; }
    setAviso('');
    await adicionar(v, area);
    setValor('');
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-slate-100">
        <h2 className="font-bold text-sm">{titulo}</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {email ? 'Libera só a pessoa do e-mail.' : `Libera qualquer e-mail do domínio (ex.: todos os @${exemplo}).`}
        </p>
      </div>

      <form onSubmit={enviar} className="p-4 flex flex-col sm:flex-row gap-2 bg-[#f4f7f8]/60 border-b border-slate-100">
        <label className="sr-only" htmlFor={`novo-${tipo}`}>{email ? 'Novo e-mail' : 'Novo domínio'}</label>
        <input
          id={`novo-${tipo}`} value={valor} onChange={e => { setValor(e.target.value); setAviso(''); }}
          placeholder={exemplo} type={email ? 'email' : 'text'} autoComplete="off" spellCheck={false}
          className="flex-1 min-w-0 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-sm outline-none focus:border-[#00AE9D] focus:ring-2 focus:ring-[#00AE9D]/20"
        />
        <select
          value={area} onChange={e => setArea(e.target.value as AreaAcesso)} aria-label="Acesso"
          className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm outline-none focus:border-[#00AE9D]"
        >
          {AREAS.map(a => <option key={a.valor} value={a.valor}>{a.rotulo}</option>)}
        </select>
        <button
          type="submit" disabled={!!ocupado}
          className="bg-[#00AE9D] hover:bg-[#008f81] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg whitespace-nowrap"
        >
          {ocupado === `add-${tipo}` ? 'Salvando…' : 'Adicionar'}
        </button>
      </form>
      {aviso && <p className="px-5 pt-3 text-xs text-[#B23A3A]">{aviso}</p>}

      {itens === null ? (
        <p className="px-5 py-6 text-sm text-slate-400">Carregando…</p>
      ) : !itens.length && !removendo.length ? (
        <p className="px-5 py-6 text-sm text-slate-500">Nenhum {email ? 'e-mail' : 'domínio'} liberado.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {itens.map(i => (
            <li key={i.valor} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <div className="flex-1 min-w-[12rem]">
                <span className="text-sm font-medium break-all">{email ? i.valor : `@${i.valor}`}</span>
                {!i.publicado && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-[#C77700]">publicando</span>}
                <span className="block text-[11px] text-slate-400 mt-0.5">por {i.adicionado_por} · {dataBR(i.adicionado_em)}</span>
              </div>
              <select
                value={i.area} disabled={!!ocupado} aria-label={`Acesso de ${i.valor}`}
                onChange={e => mudarArea(i.valor, e.target.value as AreaAcesso)}
                title={AREAS.find(a => a.valor === i.area)?.dica}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs outline-none focus:border-[#00AE9D]"
              >
                {AREAS.map(a => <option key={a.valor} value={a.valor}>{a.rotulo}</option>)}
              </select>
              <button
                onClick={() => { if (confirm(`Remover o acesso de ${email ? i.valor : '@' + i.valor}?`)) remover(i.valor); }}
                disabled={!!ocupado}
                className="text-xs text-slate-400 hover:text-[#B23A3A] disabled:opacity-50"
              >
                {ocupado === `del-${tipo}-${i.valor}` ? 'Removendo…' : 'Remover'}
              </button>
            </li>
          ))}
          {removendo.map(r => (
            <li key={`rm-${r.valor}`} className="px-5 py-3 text-sm text-slate-400">
              <span className="line-through">{email ? r.valor : `@${r.valor}`}</span>{' '}
              <span className="ml-1 text-[10px] font-bold uppercase tracking-wide text-[#C77700]">removendo</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
