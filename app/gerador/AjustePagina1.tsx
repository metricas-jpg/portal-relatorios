'use client';

import { useEffect } from 'react';
import { avisarRelatorio } from './avisos-cliente';

/**
 * Página 1 elástica.
 *
 * "O que mudou" (ideal 4 linhas) e "O que significa para o Sicoob" (ideal 5 linhas) podem crescer
 * juntos até LINHAS_EXTRA linhas a mais. O espaço sai, nesta ordem:
 *   1. espaços em branco do cabeçalho escuro (até 30pt);
 *   2. espaços entre os cards e dentro deles (até 28pt);
 *   3. altura das barras do gráfico (até 37,2pt).
 * As fontes não mudam. Acima do máximo, o texto é cortado com "…".
 *
 * Os avisos (que não saem na impressão) dizem quantos caracteres cabem no ideal e no máximo
 * e quantos é preciso retirar. A conta é feita medindo o texto real com a fonte do relatório.
 */

const LINHA = 11.9;            // pt, entrelinha dos dois textos
const LINHAS_EXTRA = 8;        // limite absoluto, somando os dois textos
const MAX_CAB = 30, MAX_CARDS = 28, MAX_GRAF = 37.2; // pt (30 + 28 + 37,2 = 95,2 = 8 linhas)

export default function AjustePagina1() {
  useEffect(() => {
    let cancelado = false;
    (document.fonts?.ready ?? Promise.resolve()).then(() => {
      const pagina = document.getElementById('p1');
      if (cancelado || !pagina) return;

      // textos curtos que precisam caber numa largura fixa (ex.: "Última: 19/10 (Veículo)" no card escuro):
      // 1º quebra em 2 linhas no ponto previsto; 2º reduz a fonte até 6pt; só então corta e avisa
      pagina.querySelectorAll<HTMLElement>('[data-encaixe]').forEach(el => {
        const cabe = () => el.scrollWidth <= el.clientWidth + 1;
        if (cabe()) return;
        if (el.querySelector('.det-b')) { el.classList.add('duas'); if (cabe()) return; }
        for (const fs of [6.5, 6]) { el.style.setProperty('--fs', `${fs}pt`); if (cabe()) return; }
        avisarRelatorio(`Página 1 · “${el.dataset.encaixe}” não coube mesmo em 2 linhas e com fonte menor; foi cortado. Encurte o texto na planilha.`);
      });

      const els = [...pagina.querySelectorAll<HTMLElement>('[data-elastico]')];
      if (els.length !== 2) return;

      // cópia invisível, sem limite de linhas, para medir o texto inteiro
      const medidor = (el: HTMLElement) => {
        const c = el.cloneNode(true) as HTMLElement;
        c.removeAttribute('data-elastico');
        Object.assign(c.style, { visibility: 'hidden', display: 'block', webkitLineClamp: 'unset', maxHeight: 'none', overflow: 'visible', top: '0', left: '-10000px' });
        pagina.appendChild(c);
        return c;
      };
      const pxLinha = parseFloat(getComputedStyle(els[0]).lineHeight) || 15.87;
      const linhasDe = (c: HTMLElement) => Math.max(1, Math.round(c.scrollHeight / pxLinha));

      const dados = els.map(el => {
        const c = medidor(el);
        const ideal = Number(el.dataset.ideal) || 4;
        const linhas = el.textContent?.trim() ? linhasDe(c) : 0;
        return { el, c, nome: el.dataset.elastico || '', ideal, linhas, texto: c.textContent || '' };
      });

      // divide as linhas extras: se os dois juntos passarem do limite, na proporção do que cada um pede
      const pedido = dados.map(d => Math.max(0, d.linhas - d.ideal));
      const total = pedido[0] + pedido[1];
      const extra = total <= LINHAS_EXTRA ? pedido : (() => {
        const a = Math.min(pedido[0], Math.round((LINHAS_EXTRA * pedido[0]) / total));
        return [a, Math.min(pedido[1], LINHAS_EXTRA - a)];
      })();

      // quanto espaço tirar de cada região (pt)
      const E = (extra[0] + extra[1]) * LINHA;
      const ga = Math.min(MAX_CAB, E);
      const gb = Math.min(MAX_CARDS, E - ga);
      const gc = Math.min(MAX_GRAF, E - ga - gb);
      const v = (n: number) => `${n.toFixed(2)}pt`;
      const vars: Record<string, string> = {
        // cabeçalho: menos respiro no topo, entre a linha amarela e o título, antes e depois da linha de datas
        '--dh1': v(-ga * 4 / 30), '--dh2': v(-ga * 12 / 30), '--dh3': v(-ga * 22 / 30), '--rbg': v(ga),
        // cards: menos espaço acima, dentro e entre eles
        '--dc1': v(-(ga + gb * 4.4 / 28)), '--dc2': v(-(ga + gb * 8.4 / 28)), '--rcr': v(gb * 8 / 28),
        '--dk1': v(-(ga + gb * 15.4 / 28)), '--dk2': v(-(ga + gb * 18.4 / 28)), '--rck': v(gb * 6 / 28),
        // textos começam mais acima; o gráfico desce só o que as barras encolhem
        '--dt': v(-(ga + gb)), '--dsep': v(-(ga + gb) + extra[0] * LINHA), '--dg': v(gc), '--altmax': v(121.2 - gc),
      };
      Object.entries(vars).forEach(([k, val]) => pagina.style.setProperty(k, val));
      dados.forEach((d, i) => d.el.style.setProperty('--linhas', String(d.ideal + extra[i])));

      // maior quantidade de caracteres que cabe em N linhas (busca binária na cópia invisível).
      // O texto é repetido para medir a capacidade mesmo quando ele é mais curto que o limite.
      const cabem = (c: HTMLElement, original: string, n: number) => {
        let texto = original;
        while (texto.length < 160 * n) texto += ' ' + original;
        let lo = 0, hi = texto.length;
        while (lo < hi) {
          const meio = Math.ceil((lo + hi) / 2);
          c.textContent = texto.slice(0, meio);
          if (c.scrollHeight <= n * pxLinha + 1) lo = meio; else hi = meio - 1;
        }
        return lo;
      };

      dados.forEach((d, i) => {
        if (d.linhas <= d.ideal) return;
        const outro = dados[1 - i];
        const maxLinhas = d.ideal + LINHAS_EXTRA - extra[1 - i];
        const nIdeal = cabem(d.c, d.texto, d.ideal);
        const nMax = cabem(d.c, d.texto, maxLinhas);
        const tem = d.texto.length;
        const divide = outro.linhas > outro.ideal ? ` O máximo considera o tamanho atual de “${outro.nome}”, que divide o mesmo espaço.` : '';
        if (d.linhas > d.ideal + extra[i]) {
          avisarRelatorio(`Página 1 · “${d.nome}” tem ${tem} caracteres e passou do MÁXIMO (${nMax}). O texto está cortado no relatório: retire ${tem - nMax} caracteres. Para o tamanho ideal (${nIdeal}), retire ${tem - nIdeal}.${divide}`);
        } else {
          avisarRelatorio(`Página 1 · “${d.nome}” tem ${tem} caracteres e passou do tamanho ideal (${nIdeal}). O layout foi compactado para caber; o máximo é ${nMax}. Para voltar ao ideal, retire ${tem - nIdeal} caracteres.${divide}`);
        }
      });
      dados.forEach(d => d.c.remove());
    });
    return () => { cancelado = true; };
  }, []);
  return null;
}
