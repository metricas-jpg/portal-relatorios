'use client';
import { useState } from 'react';

declare global { interface Window { pdfjsLib: any; } }

export default function PrintController({ clippings }: { clippings: any[] }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);

  const extractDriveId = (url: string) => {
    if (!url) return null;
    const match = url.match(/[-\w]{25,}/);
    return match ? match[0] : null;
  };

  const handlePrint = async () => {
    if (!window.pdfjsLib) {
      alert('Aguarde o carregamento do conversor e tente novamente.');
      return;
    }
    
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    setLoading(true);

    const clipsComAnexo = clippings.filter(c => c.printUrl);
    setTotal(clipsComAnexo.length);
    let current = 0;

    for (const clip of clipsComAnexo) {
      current++;
      setProgress(current);
      
      const id = extractDriveId(clip.printUrl);
      if (!id) continue;

      const coverContainer = document.getElementById(`print-container-cover-${clip.idUnico}`);
      const clippingPageNode = document.getElementById(`clipping-page-${clip.idUnico}`);
      if (!coverContainer || !clippingPageNode || coverContainer.dataset.processed === 'true') continue;

      try {
        const res = await fetch(`/api/relatorios/file?id=${id}&download=true`);
        const blob = await res.blob();

        if (blob.type.includes('image')) {
          const url = URL.createObjectURL(blob);
          coverContainer.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:contain;" />`;
          coverContainer.dataset.processed = 'true';
          continue;
        }

        const arrayBuffer = await blob.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        coverContainer.innerHTML = ''; 

        // RENDERIZA PRIMEIRA PÁGINA NO ESPAÇO RESERVADO
        const page1 = await pdf.getPage(1);
        const viewport1 = page1.getViewport({ scale: 2.0 });
        const canvas1 = document.createElement('canvas');
        const ctx1 = canvas1.getContext('2d')!;
        canvas1.width = viewport1.width; canvas1.height = viewport1.height;
        ctx1.fillStyle = '#ffffff'; ctx1.fillRect(0, 0, canvas1.width, canvas1.height);
        await page1.render({ canvasContext: ctx1, viewport: viewport1 }).promise;
        coverContainer.innerHTML = `<img src="${canvas1.toDataURL('image/jpeg', 0.95)}" style="width:100%; height:100%; object-fit:contain;" />`;

        // GERA NOVAS PÁGINAS A4 PARA O RESTANTE DO PDF
        let insertAfterNode = clippingPageNode;
        for (let pageNum = 2; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d')!;
          canvas.width = viewport.width; canvas.height = viewport.height;
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          
          const newSection = document.createElement('section');
          newSection.className = 'page custom-print-page';
          newSection.innerHTML = `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#fff;"><img src="${canvas.toDataURL('image/jpeg', 0.95)}" style="max-width:100%; max-height:100%; object-fit:contain;" /></div>`;
          insertAfterNode.insertAdjacentElement('afterend', newSection);
          insertAfterNode = newSection; 
        }

        coverContainer.dataset.processed = 'true';
      } catch (e) {
        console.error(`Erro ao converter arquivo do clip ${clip.idUnico}:`, e);
        coverContainer.innerHTML = `<span class="t z10 b c-cinza c" style="width:100%; text-align:center;">Erro ao renderizar anexo. Verifique o link no Google Drive.</span>`;
      }
    }

    setLoading(false);
    setTimeout(() => window.print(), 500); // Dispara a impressão nativa
  };

  return (
    <>
      <button onClick={handlePrint} className="bg-[#00AE9D] hover:bg-[#008f81] text-white text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition shadow-md border border-[#00AE9D]/30">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
        <span className="hidden sm:inline">Gerar Relatório Final</span>
        <span className="sm:hidden">Gerar Relatório</span>
      </button>

      {/* MODAL DE LOADING (Invisível na impressão) */}
      {loading && (
        <div className="print-hidden fixed inset-0 bg-[#003641]/95 z-[9999] flex flex-col items-center justify-center text-white backdrop-blur-sm">
          <div className="w-14 h-14 border-4 border-[#00AE9D] border-t-transparent rounded-full animate-spin mb-6"></div>
          <h2 className="text-2xl font-bold mb-2">Processando anexos e montando PDF...</h2>
          <p className="text-[#CADB2A] font-medium text-sm">Convertendo anexo {progress} de {total} para alta resolução.</p>
          <p className="text-slate-400 text-xs mt-6">Por favor, não feche nem minimize esta janela.</p>
        </div>
      )}
    </>
  );
}