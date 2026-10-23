'use client';

/**
 * Transforma o print de uma publicação (PDF ou imagem) em fatias do tamanho das áreas de print
 * das páginas do anexo, para que TODO o conteúdo apareça no relatório final.
 *
 * 1. Cada página do PDF (ou a imagem) é desenhada na mesma largura e as margens brancas de cima
 *    e de baixo são removidas: o resultado é uma "faixa" contínua.
 *    Em PDFs, o cabeçalho e o rodapé que o navegador imprime (data, endereço, "1/2") são descartados.
 * 2. A faixa é cortada na altura de cada área (a primeira, menor, e as de continuação).
 *    O corte procura uma faixa branca logo acima do limite, para não cortar uma linha de texto ao meio.
 *    Uma sobra pequena no fim não vira página própria: entra na página anterior, um pouco reduzida.
 * 3. Localizador de citação: em PDFs com texto, procura "Sicoob" (maiúsculas ou minúsculas) e
 *    devolve em qual(is) parte(s) a palavra aparece. Trava de segurança: PDF sem texto (escaneado,
 *    print salvo como imagem) ou imagem que ocupa mais de uma parte devolvem `null` (não dá para
 *    saber), e o anexo usa a coluna posicao_citacao da planilha.
 */

const LARGURA_PX = 1300; // resolução das fatias (≈ 1,8x a largura da área em tela; ~175 dpi no PDF)
const SOBRA_MAX = 0.25;  // sobra menor que 25% de uma área é absorvida pela página anterior

/** uma fatia pronta: endereço da imagem e se ela precisa ser reduzida para caber (sobra absorvida) */
export interface Fatia { src: string; reduzida: boolean }
/** fatias + partes (1, 2...) em que o Sicoob aparece; null = não foi possível ler */
export interface Resultado { fatias: Fatia[]; citacao: number[] | null; tipo: 'imagem' | 'pdf' | 'pdf-sem-texto' }

const SICOOB = /s\s?i\s?c\s?o\s?o\s?b/gi;
const TEXTO_MINIMO = 30; // menos letras que isso no PDF inteiro = PDF sem camada de texto

declare global { interface Window { pdfjsLib?: PdfJs } }
interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: ArrayBuffer }): { promise: Promise<PdfDoc> };
  Util: { transform(a: number[], b: number[]): number[] };
}
interface ItemTexto { str?: string; transform?: number[]; height?: number }
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage> }
interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number; transform: number[] };
  getTextContent(): Promise<{ items: ItemTexto[] }>;
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<void> };
}

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
let carregandoPdfJs: Promise<PdfJs> | null = null;
function pdfjs(): Promise<PdfJs> {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  carregandoPdfJs ||= new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = PDFJS + 'pdf.min.js';
    s.onload = () => {
      if (!window.pdfjsLib) return erro(new Error('Conversor de PDF indisponível'));
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
      ok(window.pdfjsLib);
    };
    s.onerror = () => { carregandoPdfJs = null; erro(new Error('Não foi possível baixar o conversor de PDF')); };
    document.head.appendChild(s);
  });
  return carregandoPdfJs;
}

/** trecho de uma página dentro da faixa contínua */
interface Trecho {
  canvas: HTMLCanvasElement; y0: number; altura: number; branca: Uint8Array;
  /** linhas (dentro do trecho) em que "Sicoob" aparece no texto do PDF */
  marcas?: number[];
}

function linhasBrancas(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { width: w, height: h } = canvas;
  const dados = ctx.getImageData(0, 0, w, h).data;
  const branca = new Uint8Array(h);
  for (let y = 0; y < h; y++) {
    let ok = 1;
    for (let x = 0; x < w; x += 5) {
      const i = (y * w + x) * 4;
      if (dados[i] < 238 || dados[i + 1] < 238 || dados[i + 2] < 238) { ok = 0; break; }
    }
    branca[y] = ok;
  }
  return branca;
}

/**
 * Cabeçalho/rodapé do navegador: um bloco baixo (até 2% da página), colado na borda
 * (nos 7% de cima ou de baixo) e separado do resto por um espaço branco de pelo menos 2,5%.
 * Só esses blocos são descartados; texto no meio da página nunca é removido.
 */
function limparBordas(branca: Uint8Array) {
  const h = branca.length, gapMin = h * 0.025, altMax = h * 0.02, borda = h * 0.07;
  const blocos: [number, number][] = [];
  for (let y = 0; y < h; ) {
    while (y < h && branca[y]) y++;
    if (y >= h) break;
    const ini = y;
    while (y < h && !branca[y]) y++;
    blocos.push([ini, y - 1]);
  }
  // junta blocos separados por espaços pequenos (linhas de um mesmo parágrafo)
  const unidos: [number, number][] = [];
  blocos.forEach(b => {
    const u = unidos[unidos.length - 1];
    if (u && b[0] - u[1] < gapMin) u[1] = b[1]; else unidos.push([b[0], b[1]]);
  });
  const apagar = (b: [number, number]) => { for (let y = b[0]; y <= b[1]; y++) branca[y] = 1; };
  if (unidos.length > 1) {
    const [a] = unidos;
    if (a[1] < borda && a[1] - a[0] < altMax) apagar(a);
    const z = unidos[unidos.length - 1];
    if (z[0] > h - borda && z[1] - z[0] < altMax) apagar(z);
  }
  return branca;
}

/** remove as margens brancas de cima e de baixo, deixando um respiro */
function aparar(canvas: HTMLCanvasElement, semBordas = false): Trecho | null {
  const branca = semBordas ? limparBordas(linhasBrancas(canvas)) : linhasBrancas(canvas);
  let ini = 0, fim = branca.length - 1;
  while (ini < fim && branca[ini]) ini++;
  while (fim > ini && branca[fim]) fim--;
  if (fim <= ini) return null; // página em branco
  const folga = Math.round(canvas.width * 0.015);
  ini = Math.max(0, ini - folga); fim = Math.min(branca.length - 1, fim + folga);
  return { canvas, y0: ini, altura: fim - ini + 1, branca: branca.subarray(ini, fim + 1) };
}

function novoCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  return { c, ctx };
}

/**
 * Onde "Sicoob" aparece numa página do PDF, em linhas do canvas (meio da linha de texto).
 * Junta os pedaços de texto da página para achar a palavra mesmo quando o PDF a divide ("Sic" + "oob").
 */
async function procurarSicoob(lib: PdfJs, pagina: PdfPage, vp: { transform: number[] }): Promise<{ ys: number[]; letras: number }> {
  let itens: ItemTexto[] = [];
  try { itens = (await pagina.getTextContent()).items || []; } catch { return { ys: [], letras: 0 }; }
  let texto = '';
  const inicio: number[] = []; // posição de cada item no texto juntado
  itens.forEach(it => { inicio.push(texto.length); texto += it.str || ''; });
  const letras = texto.replace(/\s/g, '').length;
  const ys: number[] = [];
  for (const m of texto.matchAll(SICOOB)) {
    let k = inicio.length - 1;
    while (k > 0 && inicio[k] > (m.index || 0)) k--;
    const it = itens[k];
    if (!it?.transform) continue;
    const [, , , , , base] = lib.Util.transform(vp.transform, it.transform);
    const alt = Math.abs((it.height || 0) * vp.transform[3]) || 10;
    ys.push(base - alt / 2);
  }
  return { ys, letras };
}

async function faixaDoArquivo(blob: Blob): Promise<{ trechos: Trecho[]; textoLido: boolean | null }> {
  if (blob.type.startsWith('image/')) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((ok, erro) => {
        const i = new Image(); i.onload = () => ok(i); i.onerror = () => erro(new Error('Imagem inválida')); i.src = url;
      });
      const w = Math.min(LARGURA_PX, img.naturalWidth);
      // o navegador limita a altura de um canvas; imagens muito longas são divididas em partes
      const escala = w / img.naturalWidth, altTotal = Math.round(img.naturalHeight * escala), MAX = 12000;
      const trechos: Trecho[] = [];
      for (let y = 0; y < altTotal; y += MAX) {
        const h = Math.min(MAX, altTotal - y);
        const { c, ctx } = novoCanvas(w, h);
        ctx.drawImage(img, 0, y / escala, img.naturalWidth, h / escala, 0, 0, w, h);
        trechos.push({ canvas: c, y0: 0, altura: h, branca: linhasBrancas(c) });
      }
      const ap = trechos.length === 1 ? aparar(trechos[0].canvas) : null;
      return { trechos: ap ? [ap] : trechos, textoLido: null };
    } finally { URL.revokeObjectURL(url); }
  }
  const lib = await pdfjs();
  const pdf = await lib.getDocument({ data: await blob.arrayBuffer() }).promise;
  const trechos: Trecho[] = [];
  let letras = 0;
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const base = pagina.getViewport({ scale: 1 });
    const vp = pagina.getViewport({ scale: LARGURA_PX / base.width });
    const { c, ctx } = novoCanvas(Math.round(vp.width), Math.round(vp.height));
    await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
    const busca = await procurarSicoob(lib, pagina, vp);
    letras += busca.letras;
    const t = aparar(c, true);
    if (t) {
      // só vale a citação que ficou visível (fora do cabeçalho/rodapé descartado e das margens)
      t.marcas = busca.ys.map(y => Math.round(y - t.y0)).filter(y => {
        if (y < 0 || y >= t.altura) return false;
        for (let k = Math.max(0, y - 6); k <= Math.min(t.altura - 1, y + 6); k++) if (!t.branca[k]) return true;
        return false;
      });
      // o que foi marcado como cabeçalho/rodapé dentro do trecho é pintado de branco
      const ctx2 = c.getContext('2d', { willReadFrequently: true })!;
      ctx2.fillStyle = '#fff';
      for (let y = 0; y < t.altura; y++) if (t.branca[y]) ctx2.fillRect(0, t.y0 + y, c.width, 1);
      trechos.push(t);
    }
  }
  return { trechos, textoLido: letras >= TEXTO_MINIMO };
}

/**
 * @param proporcoes altura/largura de cada área: [primeira, continuação]
 * @returns fatias na ordem (a 1ª vai na página do anexo, as demais nas continuações) e as partes
 *          em que o Sicoob aparece
 */
export async function fatiarArquivo(blob: Blob, proporcoes: [number, number]): Promise<Resultado> {
  const { trechos, textoLido } = await faixaDoArquivo(blob);
  if (!trechos.length) return { fatias: [], citacao: null, tipo: 'imagem' };
  const largura = trechos[0].canvas.width;
  // índice global de linhas da faixa
  const total = trechos.reduce((a, t) => a + t.altura, 0);
  const branca = new Uint8Array(total);
  let pos = 0;
  trechos.forEach(t => { branca.set(t.branca, pos); pos += t.altura; });

  // 1. planeja os cortes
  const cortes: { ini: number; fim: number; alvo: number }[] = [];
  let y = 0;
  while (y < total && branca[y]) y++;
  while (y < total) {
    const alvo = Math.round(largura * (cortes.length === 0 ? proporcoes[0] : proporcoes[1]));
    let fim = Math.min(total, y + alvo);
    if (fim < total) {
      // procura, nos últimos 15% da fatia, 4 linhas brancas seguidas para cortar entre linhas de texto
      const limite = fim - Math.round(alvo * 0.15);
      for (let k = fim; k > limite; k--) {
        if (branca[k] && branca[k - 1] && branca[k - 2] && branca[k - 3]) { fim = k; break; }
      }
    }
    cortes.push({ ini: y, fim, alvo });
    y = fim;
    while (y < total && branca[y]) y++; // não começa a próxima fatia com espaço em branco
  }
  // 2. sobra pequena no fim entra na fatia anterior (que será exibida um pouco reduzida)
  const ult = cortes[cortes.length - 1], ant = cortes[cortes.length - 2];
  let absorveu = false;
  if (ant && ult.fim - ult.ini < ult.alvo * SOBRA_MAX && ult.fim - ant.ini <= ant.alvo * (1 + SOBRA_MAX)) {
    ant.fim = ult.fim; cortes.pop(); absorveu = true;
  }

  // 3. desenha cada fatia (pode atravessar várias páginas do PDF)
  const fatias: Fatia[] = [];
  for (const [i, c] of cortes.entries()) {
    const { c: tela, ctx } = novoCanvas(largura, c.fim - c.ini);
    let inicioTrecho = 0;
    for (const t of trechos) {
      const a = Math.max(c.ini, inicioTrecho), b = Math.min(c.fim, inicioTrecho + t.altura);
      if (b > a) ctx.drawImage(t.canvas, 0, t.y0 + (a - inicioTrecho), largura, b - a, 0, a - c.ini, largura, b - a);
      inicioTrecho += t.altura;
    }
    const arquivo = await new Promise<Blob>((ok, erro) => tela.toBlob(b => (b ? ok(b) : erro(new Error('Falha ao gerar imagem'))), 'image/jpeg', 0.88));
    tela.width = tela.height = 0; // libera a memória do canvas
    fatias.push({ src: URL.createObjectURL(arquivo), reduzida: absorveu && i === cortes.length - 1 });
  }
  trechos.forEach(t => { t.canvas.width = t.canvas.height = 0; });

  // 4. localizador de citação (trava: imagem com mais de uma parte ou PDF sem texto = null)
  let citacao: number[] | null;
  if (textoLido === null) citacao = fatias.length === 1 ? [1] : null;
  else if (!textoLido) citacao = null;
  else {
    const partes = new Set<number>();
    let base = 0;
    for (const t of trechos) {
      (t.marcas || []).forEach(y => {
        const g = base + y;
        const i = cortes.findIndex(c => g < c.fim);
        partes.add((i < 0 ? cortes.length - 1 : i) + 1);
      });
      base += t.altura;
    }
    citacao = [...partes].sort((a, b) => a - b);
  }
  return { fatias, citacao, tipo: textoLido === null ? 'imagem' : textoLido ? 'pdf' : 'pdf-sem-texto' };
}
