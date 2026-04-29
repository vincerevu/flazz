import type { PresentationDomExportRequest, PresentationDomExportResponse } from '@flazz/shared';

export const presentationExportIpc = {
  exportDomPptx(request: PresentationDomExportRequest): Promise<PresentationDomExportResponse> {
    return window.ipc.invoke('presentation:exportDomPptx', request);
  },
};
