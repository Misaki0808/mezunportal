import { parentPort, workerData } from 'node:worker_threads';
import { extractText, getDocumentProxy } from 'unpdf';

// Ayrı iş parçacığı sonlandırılabilir; PDF.js'in mesajları ana süreçte loglanmaz.
let document;
try {
  document = await getDocumentProxy(workerData.bytes, {
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    maxImageSize: 1,
    verbosity: 0,
    stopAtErrors: true,
  });
  if (document.numPages > workerData.maxPages) {
    parentPort.postMessage({ code: 'CV_TOO_MANY_PAGES' });
  } else {
    const result = await extractText(document, { mergePages: true });
    if (result.text.length > workerData.maxText)
      parentPort.postMessage({ code: 'CV_PDF_UNREADABLE' });
    else parentPort.postMessage({ text: result.text });
  }
} catch {
  parentPort.postMessage({ code: 'CV_PDF_UNREADABLE' });
} finally {
  await document?.cleanup?.().catch(() => {});
}
