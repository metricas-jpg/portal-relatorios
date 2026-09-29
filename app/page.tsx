'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';

interface Relatorio {
  id: string;
  nome: string;
  data: string;
  urlVisualizacao: string;
  urlDownload: string;
  titulo: string;
}

type TipoOrdenacao = 'data-desc' | 'data-asc' | 'nome-asc' | 'nome-desc';

function ConteudoHome() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const erroUrl = searchParams.get('erro');

  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  
  // Ordenação
  const [ordenacao, setOrdenacao] = useState<TipoOrdenacao>('data-desc');

  // Estados para o seletor de datas
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [tempInicio, setTempInicio] = useState('');
  const [tempFim, setTempFim] = useState('');
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [modalPdf, setModalPdf] = useState<Relatorio | null>(null);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    function handleClickFora(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownAberto(false);
      }
    }
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      async function carregar() {
        try {
          const res = await fetch('/api/relatorios');
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          setRelatorios(data.relatorios || []);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Erro ao carregar dados';
          setErro(msg);
        } finally {
          setLoading(false);
        }
      }
      carregar();
    }
  }, [status]);

  const getThumbnailUrl = (id: string) => {
    if (id) {
      return `/api/relatorios/thumbnail?id=${id}`;
    }
    return '';
  };

  const formatarParaIso = (dataStr: string) => {
    if (!dataStr) return '';
    const limpa = dataStr.trim();
    if (limpa.includes('/')) {
      const partes = limpa.split('/');
      if (partes.length === 3) {
        const [dia, mes, ano] = partes;
        return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
      }
    }
    return limpa;
  };

  const formatarParaBr = (str: string) => {
    if (!str) return '';
    if (str.includes('/')) return str;
    const [ano, mes, dia] = str.split('-');
    return `${dia}/${mes}/${ano}`;
  };

  const getLabelData = () => {
    if (dataInicio && dataFim) {
      return `${formatarParaBr(dataInicio)} – ${formatarParaBr(dataFim)}`;
    }
    if (dataInicio) {
      return `A partir de ${formatarParaBr(dataInicio)}`;
    }
    if (dataFim) {
      return `Até ${formatarParaBr(dataFim)}`;
    }
    return 'Todas as datas';
  };

  const aplicarFiltroData = () => {
    setDataInicio(tempInicio);
    setDataFim(tempFim);
    setDropdownAberto(false);
  };

  const aplicarPredefinido = (tipo: 'esteAno' | 'esteMes' | 'ultimos30' | 'tudo') => {
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');
    const diaAtual = String(hoje.getDate()).padStart(2, '0');

    if (tipo === 'esteAno') {
      setTempInicio(`${anoAtual}-01-01`);
      setTempFim(`${anoAtual}-12-31`);
    } else if (tipo === 'esteMes') {
      const ultimoDiaMes = new Date(anoAtual, hoje.getMonth() + 1, 0).getDate();
      setTempInicio(`${anoAtual}-${mesAtual}-01`);
      setTempFim(`${anoAtual}-${mesAtual}-${ultimoDiaMes}`);
    } else if (tipo === 'ultimos30') {
      const dataPassada = new Date();
      dataPassada.setDate(hoje.getDate() - 30);
      const anoP = dataPassada.getFullYear();
      const mesP = String(dataPassada.getMonth() + 1).padStart(2, '0');
      const diaP = String(dataPassada.getDate()).padStart(2, '0');
      setTempInicio(`${anoP}-${mesP}-${diaP}`);
      setTempFim(`${anoAtual}-${mesAtual}-${diaAtual}`);
    } else if (tipo === 'tudo') {
      setTempInicio('');
      setTempFim('');
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#003641] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-[#00AE9D] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium tracking-wide">Carregando autenticação...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-[#00262e] px-4 py-8">
        <div className="bg-[#003641] p-8 sm:p-10 rounded-3xl shadow-2xl max-w-md w-full text-center border border-white/10">
          <div className="flex items-center justify-center gap-5 mb-8 pb-6 border-b border-white/10">
            <Image 
              src="/logo-sicoob.svg" 
              alt="Logo Sicoob" 
              width={120} 
              height={36} 
              className="h-8 w-auto object-contain" 
            />
            <div className="h-6 w-px bg-white/20"></div>
            <Image 
              src="/logo-loggia.svg" 
              alt="Logo Loggia" 
              width={100} 
              height={30} 
              className="h-6 w-auto object-contain brightness-0 invert opacity-95" 
            />
          </div>

          <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">
            Central de Relatórios
          </h1>
          <p className="text-slate-300 text-sm mb-8 leading-relaxed">
            Consulte e pesquise os relatórios institucionais com autenticação protegida.
          </p>

          {erroUrl === 'AcessoNegado' && (
            <div className="bg-red-500/10 text-red-300 text-xs p-3.5 rounded-xl border border-red-500/30 mb-6 text-left leading-relaxed">
              <strong>Acesso negado:</strong> Seu e-mail não possui permissão concedida no Google Drive. Solicite a liberação ao administrador.
            </div>
          )}

          <button
            onClick={() => signIn('google')}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-[#003641] font-semibold py-3 px-4 rounded-xl shadow-md transition duration-200"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Entrar com o Google
          </button>
        </div>
      </div>
    );
  }

  // 1. Filtragem por busca e período
  const relatoriosFiltrados = relatorios.filter((item) => {
    const termo = busca.toLowerCase();
    const matchTermo =
      item.titulo.toLowerCase().includes(termo) ||
      item.nome.toLowerCase().includes(termo) ||
      item.id.toLowerCase().includes(termo);

    const dataItemIso = formatarParaIso(item.data);

    let matchRange = true;
    if (dataInicio && dataItemIso) {
      matchRange = matchRange && dataItemIso >= dataInicio;
    }
    if (dataFim && dataItemIso) {
      matchRange = matchRange && dataItemIso <= dataFim;
    }

    return matchTermo && matchRange;
  });

  // 2. Ordenação dos relatórios
  const relatoriosOrdenados = [...relatoriosFiltrados].sort((a, b) => {
    const dataA = formatarParaIso(a.data);
    const dataB = formatarParaIso(b.data);
    const tituloA = (a.titulo || a.nome).toLowerCase();
    const tituloB = (b.titulo || b.nome).toLowerCase();

    switch (ordenacao) {
      case 'data-desc':
        return dataB.localeCompare(dataA);
      case 'data-asc':
        return dataA.localeCompare(dataB);
      case 'nome-asc':
        return tituloA.localeCompare(tituloB, 'pt-BR');
      case 'nome-desc':
        return tituloB.localeCompare(tituloA, 'pt-BR');
      default:
        return 0;
    }
  });

  return (
    <div className="min-h-screen bg-[#f4f7f8] text-[#003641]">
      {/* Header Institucional */}
      <header className="bg-[#003641] text-white sticky top-0 z-40 border-b border-white/10 shadow-sm backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex justify-between items-center">
          
          <div className="flex items-center gap-4">
            <Image
              src="/logo-sicoob.svg"
              alt="Sicoob"
              width={110}
              height={32}
              className="h-7 w-auto object-contain"
              priority
            />
            <div className="h-5 w-px bg-white/20"></div>
            <Image
              src="/logo-loggia.svg"
              alt="Loggia"
              width={85}
              height={24}
              className="h-5 w-auto object-contain brightness-0 invert opacity-90"
              priority
            />
          </div>

          <div className="hidden md:flex flex-col items-center text-center">
            <h1 className="text-xl font-bold tracking-tight text-white leading-tight">
              Portal de Relatórios
            </h1>
            <span className="text-[12px] font-semibold text-[#00AE9D] tracking-wide uppercase mt-0.5">
              Monitoramento e Análise Estratégica
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <span className="text-[10px] text-slate-300 uppercase tracking-wider block font-medium">
                Conectado
              </span>
              <span className="text-xs font-medium text-white/90">
                {session?.user?.email}
              </span>
            </div>

            <button
              onClick={() => signOut()}
              className="bg-[#C24153] hover:bg-[#A83243] text-white text-xs font-semibold py-2 px-4 rounded-full transition-all duration-150 shadow-sm hover:shadow"
            >
              Sair
            </button>
          </div>

        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        
        {/* Barra de Filtros com Seletor Dropdown */}
        <div className="bg-white rounded-2xl p-2.5 shadow-sm border border-slate-200/90 flex flex-col md:flex-row items-center gap-3 mb-6 relative">
          
          <div className="relative flex-1 w-full">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Pesquisar por título, palavra-chave ou código..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-11 pr-4 py-2 text-sm text-[#003641] bg-transparent focus:outline-none placeholder-slate-400 font-medium"
            />
          </div>

          <div className="h-7 w-px bg-slate-200 hidden md:block"></div>

          <div className="relative w-full md:w-auto" ref={dropdownRef}>
            <button
              onClick={() => {
                setTempInicio(dataInicio);
                setTempFim(dataFim);
                setDropdownAberto(!dropdownAberto);
              }}
              className={`w-full md:w-auto flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                dataInicio || dataFim
                  ? 'border-[#00AE9D] bg-[#00AE9D]/10 text-[#003641]'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[#003641]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>{getLabelData()}</span>
              </div>
              <svg className={`w-3.5 h-3.5 transition-transform ${dropdownAberto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {dropdownAberto && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="mb-4 pb-3 border-b border-slate-100">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Predefinições
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => aplicarPredefinido('esteAno')}
                      className="text-left text-xs px-2.5 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition"
                    >
                      Este ano
                    </button>
                    <button
                      type="button"
                      onClick={() => aplicarPredefinido('esteMes')}
                      className="text-left text-xs px-2.5 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition"
                    >
                      Este mês
                    </button>
                    <button
                      type="button"
                      onClick={() => aplicarPredefinido('ultimos30')}
                      className="text-left text-xs px-2.5 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition"
                    >
                      Últimos 30 dias
                    </button>
                    <button
                      type="button"
                      onClick={() => aplicarPredefinido('tudo')}
                      className="text-left text-xs px-2.5 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition"
                    >
                      Todas as datas
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                  <div>
                    <label className="block text-[11px] font-bold text-[#003641] uppercase tracking-wider mb-1.5">
                      Data de início
                    </label>
                    <input
                      type="date"
                      value={tempInicio}
                      onChange={(e) => setTempInicio(e.target.value)}
                      className="w-full text-xs text-[#003641] border border-slate-200 bg-slate-50 rounded-xl px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#00AE9D]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#003641] uppercase tracking-wider mb-1.5">
                      Data de término
                    </label>
                    <input
                      type="date"
                      value={tempFim}
                      onChange={(e) => setTempFim(e.target.value)}
                      className="w-full text-xs text-[#003641] border border-slate-200 bg-slate-50 rounded-xl px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#00AE9D]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setDropdownAberto(false)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={aplicarFiltroData}
                    className="text-xs font-bold text-white bg-[#003641] hover:bg-[#00262e] px-4 py-2 rounded-xl transition shadow-sm"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            )}
          </div>

          {(busca || dataInicio || dataFim) && (
            <button
              onClick={() => {
                setBusca('');
                setDataInicio('');
                setDataFim('');
                setTempInicio('');
                setTempFim('');
              }}
              className="text-xs font-semibold text-slate-500 hover:text-[#C24153] px-3 py-2 rounded-xl transition whitespace-nowrap"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Linha de Status: Contador de Relatórios e Seletor de Ordenação */}
        {!loading && !erro && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 px-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00AE9D] animate-pulse"></span>
              <p className="text-sm font-semibold text-[#003641]">
                <strong className="text-base font-bold text-[#003641]">{relatoriosOrdenados.length}</strong> relatórios de Monitoramento de Crises ativos.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="ordenacao" className="text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                Ordenar por:
              </label>
              <select
                id="ordenacao"
                value={ordenacao}
                onChange={(e) => setOrdenacao(e.target.value as TipoOrdenacao)}
                className="bg-white border border-slate-200 text-xs font-medium text-[#003641] rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#00AE9D] shadow-sm cursor-pointer"
              >
                <option value="data-desc">Data: Mais recentes</option>
                <option value="data-asc">Data: Mais antigos</option>
                <option value="nome-asc">Título: A → Z</option>
                <option value="nome-desc">Título: Z → A</option>
              </select>
            </div>
          </div>
        )}

        {/* Estados de Carregamento e Erro */}
        {loading && (
          <div className="text-center py-20 text-slate-500 text-sm flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-[#003641] border-t-transparent rounded-full animate-spin"></div>
            Carregando relatórios disponíveis...
          </div>
        )}

        {erro && (
          <div className="bg-red-50 text-red-700 p-5 rounded-2xl border border-red-200 text-sm mb-6">
            <strong>Erro na requisição:</strong> {erro}
          </div>
        )}

        {/* Grade de Cards com Thumbnail e Placeholder de Fundo */}
        {!loading && !erro && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {relatoriosOrdenados.length === 0 ? (
              <div className="col-span-full text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300 p-8">
                <p className="text-slate-400 font-medium">Nenhum relatório encontrado para os filtros selecionados.</p>
              </div>
            ) : (
              relatoriosOrdenados.map((rel) => (
                <div 
                  key={rel.id} 
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 flex flex-col group"
                >
                  {/* Container da Capa com Placeholder Visual */}
                  <div 
                    onClick={() => setModalPdf(rel)}
                    className="relative w-full h-48 bg-slate-100 overflow-hidden cursor-pointer border-b border-slate-100 flex items-center justify-center group-hover:opacity-95 transition"
                  >
                    {/* Placeholder no fundo */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none select-none">
                      <svg className="w-12 h-12 mb-1.5 text-slate-300 group-hover:text-[#00AE9D] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400">Relatório PDF</span>
                    </div>

                    {/* Imagem autenticada */}
                    <img
                      src={getThumbnailUrl(rel.id)}
                      alt={`Capa de ${rel.titulo || rel.nome}`}
                      className="w-full h-full object-cover object-top relative z-10"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />

                    {/* Efeito Hover */}
                    <div className="absolute inset-0 z-20 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                      <span className="text-white text-xs font-medium bg-[#003641]/80 px-2.5 py-1 rounded-md backdrop-blur-sm">
                        Clique para expandir ↗
                      </span>
                    </div>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-[#00AE9D] bg-[#00AE9D]/10 px-2.5 py-0.5 rounded-full">
                          📅 {formatarParaBr(rel.data) || 'Sem data'}
                        </span>
                      </div>
                      
                      <h2 className="font-bold text-[#003641] text-base mb-1.5 line-clamp-2 leading-snug group-hover:text-[#49479D] transition-colors">
                        {rel.titulo || rel.nome}
                      </h2>
                      <p className="text-xs text-slate-400 font-mono truncate mb-4">
                        {rel.nome}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex gap-2">
                      <button
                        onClick={() => setModalPdf(rel)}
                        className="flex-1 bg-[#003641] hover:bg-[#00262e] text-white text-xs font-semibold py-2.5 px-3 rounded-xl text-center transition shadow-sm"
                      >
                        Ler na Tela
                      </button>
                      <a
                        href={rel.urlDownload}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-[#49479D] hover:bg-[#3d3b85] text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 transition shadow-sm"
                        title="Download do PDF"
                      >
                        ⬇ Baixar
                      </a>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* Modal Leitor de PDF */}
      {modalPdf && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-3 sm:p-6 backdrop-blur-sm">
          <div className="bg-white w-full max-w-6xl h-[92vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl border border-slate-700">
            <div className="flex justify-between items-center bg-[#003641] px-6 py-3.5 text-white">
              <h3 className="font-bold truncate text-sm max-w-xl">
                {modalPdf.titulo || modalPdf.nome}
              </h3>
              <div className="flex items-center gap-3">
                <a
                  href={modalPdf.urlDownload}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#49479D] hover:bg-[#3d3b85] text-white text-xs font-bold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition"
                >
                  ⬇ Baixar PDF
                </a>
                <button
                  onClick={() => setModalPdf(null)}
                  className="text-slate-300 hover:text-white text-2xl font-bold leading-none p-1 transition"
                  title="Fechar"
                >
                  &times;
                </button>
              </div>
            </div>
            <iframe 
              src={modalPdf.urlVisualizacao} 
              className="w-full flex-1 border-none bg-slate-100" 
              title="Leitor de PDF" 
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#003641] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-[#00AE9D] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium tracking-wide">Carregando aplicação...</p>
        </div>
      </div>
    }>
      <ConteudoHome />
    </Suspense>
  );
}