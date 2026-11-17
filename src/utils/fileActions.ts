export interface SaveFileResult {
  method: 'picker' | 'download';
  filename: string;
}

export async function saveBlobToUserDevice(
  blob: Blob,
  filename: string,
  mimeType: string,
  description: string,
  extension: string
): Promise<SaveFileResult> {
  const win = window as unknown as {
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: Array<{
        description: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  };

  if (typeof win.showSaveFilePicker === 'function') {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description,
            accept: {[mimeType]: [extension]},
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return {method: 'picker', filename};
    } catch (err) {
      // Si l'utilisateur a annulé le sélecteur, propager l'annulation proprement
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Enregistrement annulé par l’utilisateur.');
      }
      // Sinon fallback vers téléchargement classique
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return {method: 'download', filename};
}

export type ShareResult = 'shared' | 'unsupported' | 'cancelled';

export async function shareBlobFile(
  blob: Blob,
  filename: string,
  mimeType: string,
  title: string,
  text: string
): Promise<ShareResult> {
  const file = new File([blob], filename, {type: mimeType});
  const nav = navigator as Navigator & {
    canShare?: (data: {files?: File[]}) => boolean;
  };

  if (typeof nav.share === 'function') {
    try {
      if (!nav.canShare || nav.canShare({files: [file]})) {
        await nav.share({
          title,
          text,
          files: [file],
        });
        return 'shared';
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }
  return 'unsupported';
}
