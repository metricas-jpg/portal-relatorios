'use client';

/**
 * Transforma o print de uma publicação (PDF ou imagem) em fatias do tamanho das áreas de print
 * das páginas do anexo, para que TODO o conteúdo apareça no relatório final.
 *
 * 1. Cada página do PDF (ou a imagem) é desenhada na mesma largura e as margens brancas de cima
 *    e de baixo são removidas: o resultado é uma "faixa" contínua.
 * 2. A faixa é cortada na altura de cada área (a primeira, menor, e as de continuação).
 *    O corte procura uma faixa branca logo acima do limite, para não cortar uma linha de texto ao meio.
 */

const LARGURA_PX = 1400; // resolução das fatias (≈ 2,6x a largura da área em tela)

declare global { interface Window { pdfjsLib?: PdfJs } }
interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: ArrayBuffer }): { promise: Promise<PdfDoc> };
}
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage> }
interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
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
interface Trecho { canvas: HTMLCanvasElement; y0: number; altura: number; branca: Uint8Array }

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

/** remove as margens brancas de cima e de baixo, deixando um respiro */
function aparar(canvas: HTMLCanvasElement): Trecho | null {
  const branca = linhasBrancas(canvas);
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

async function faixaDoArquivo(blob: Blob): Promise<Trecho[]> {
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
      return ap ? [ap] : trechos;
    } finally { URL.revokeObjectURL(url); }
  }
  const lib = await pdfjs();
  const pdf = await lib.getDocument({ data: await blob.arrayBuffer() }).promise;
  const trechos: Trecho[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const base = pagina.getViewport({ scale: 1 });
    const vp = pagina.getViewport({ scale: LARGURA_PX / base.width });
    const { c, ctx } = novoCanvas(Math.round(vp.width), Math.round(vp.height));
    await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
    const t = aparar(c);
    if (t) trechos.push(t);
  }
  return trechos;
}

/**
 * @param proporcoes altura/largura de cada área: [primeira, continuação]
 * @returns imagens (data URL) na ordem; a 1ª vai na página do anexo, as demais nas continuações
 */
export async function fatiarArquivo(blob: Blob, proporcoes: [number, number]): Promise<string[]> {
  const trechos = await faixaDoArquivo(blob);
  if (!trechos.length) return [];
  const largura = trechos[0].canvas.width;
  // índice global de linhas da faixa
  const total = trechos.reduce((a, t) => a + t.altura, 0);
  const branca = new Uint8Array(total);
  let pos = 0;
  trechos.forEach(t => { branca.set(t.branca, pos); pos += t.altura; });

  const fatias: string[] = [];
  let y = 0;
  while (y < total) {
    const alt = Math.round(largura * (fatias.length === 0 ? proporcoes[0] : proporcoes[1]));
    let fim = Math.min(total, y + alt);
    if (fim < total) {
      // procura, nos últimos 15% da fatia, 4 linhas brancas seguidas para cortar entre linhas de texto
      const limite = fim - Math.round(alt * 0.15);
      for (let k = fim; k > limite; k--) {
        if (branca[k] && branca[k - 1] && branca[k - 2] && branca[k - 3]) { fim = k; break; }
      }
    }
    const { c, ctx } = novoCanvas(largura, fim - y);
    // copia o intervalo [y, fim) da faixa, que pode atravessar várias páginas do PDF
    let inicioTrecho = 0;
    for (const t of trechos) {
      const a = Math.max(y, inicioTrecho), b = Math.min(fim, inicioTrecho + t.altura);
      if (b > a) ctx.drawImage(t.canvas, 0, t.y0 + (a - inicioTrecho), largura, b - a, 0, a - y, largura, b - a);
      inicioTrecho += t.altura;
    }
    fatias.push(c.toDataURL('image/jpeg', 0.9));
    y = fim;
    while (y < total && branca[y]) y++; // não começa a próxima fatia com espaço em branco
  }
  return fatias;
}
