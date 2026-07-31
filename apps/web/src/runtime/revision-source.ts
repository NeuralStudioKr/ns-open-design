import type { FileRevisionSource } from '@open-design/contracts';

export function revisionSourceIcon(source: FileRevisionSource): string {
  switch (source) {
    case 'manual_edit':
      return 'edit-line';
    case 'inspect':
      return 'contrast-drop-2-line';
    case 'agent_element_patch':
    case 'agent_deck_patch':
    case 'agent_full_deck':
      return 'sparkling-2-line';
    case 'import':
      return 'download-2-line';
    case 'restore':
      return 'history-line';
    default:
      return 'file-edit-line';
  }
}
