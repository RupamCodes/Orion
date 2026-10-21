// Robust PDF text extraction utility
export async function extractTextFromPdf(file: File): Promise<{ text: string; pages: { pageNum: number; text: string }[] }> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/parse-pdf', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const result = await response.json();
      if (result.text && result.text.trim().length > 0) {
        return {
          text: result.text.trim(),
          pages: [{ pageNum: 1, text: result.text.trim() }]
        };
      }
    }
  } catch (err) {
    console.warn('Server PDF parser fetch failed, attempting client parse:', err);
  }

  // Fallback client parser
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = await import('pdfjs-dist/build/pdf.js');
    if (typeof window !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
    }

    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (pageText) {
        fullText += pageText + '\n\n';
      }
    }

    if (fullText.trim().length > 0) {
      return {
        text: fullText.trim(),
        pages: [{ pageNum: 1, text: fullText.trim() }]
      };
    }
  } catch (clientErr) {
    console.error('All PDF parsing methods failed:', clientErr);
  }

  return {
    text: `Uploaded document: ${file.name} (Text extraction could not find a text layer in this PDF).`,
    pages: [{ pageNum: 1, text: '' }]
  };
}
