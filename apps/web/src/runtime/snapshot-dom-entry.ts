import { domToPng } from 'modern-screenshot';

declare global {
  interface Window {
    __odSnapshotDomCapture?: {
      domToPng: typeof domToPng;
    };
  }
}

window.__odSnapshotDomCapture = { domToPng };
