export interface RunContextSelection {
  skillIds?: string[];
  pluginIds?: string[];
  mcpServerIds?: string[];
  connectorIds?: string[];
  workspaceItems?: WorkspaceContextItem[];
  /**
   * Visual deck template pinned for this user turn (Canvas → Slide / Home
   * picker). Survives project re-entry via message `runContextJson` even when
   * live `project.metadata.selectedDeckTemplate*` is briefly empty.
   */
  selectedDeckTemplateId?: string;
  selectedDeckTemplateTitle?: string;
  /**
   * Clone fill lineage on the persisted user message. Chat stores the brief
   * only; this flag keeps prompt-fill vs JSON slot-fill after reload.
   */
  templateCloneFill?: 'prompt' | 'json';
  /** Design system pin for this turn — chip restore after reload. */
  designSystemId?: string;
  designSystemTitle?: string;
}

export type WorkspaceContextKind =
  | 'design-files'
  | 'design-system'
  | 'file'
  | 'folder'
  | 'browser'
  | 'terminal'
  | 'side-chat'
  | 'live-artifact';

export interface WorkspaceContextItem {
  id: string;
  kind: WorkspaceContextKind;
  label: string;
  tabId?: string;
  path?: string;
  absolutePath?: string;
  url?: string;
  title?: string;
}

export interface ProjectContextPluginRef {
  id: string;
  title: string;
  description?: string;
}

export interface ProjectContextMcpServerRef {
  id: string;
  label?: string;
  transport?: string;
  url?: string;
  command?: string;
}

export interface ProjectContextConnectorRef {
  id: string;
  name: string;
  provider?: string;
  category?: string;
  description?: string;
  status?: string;
  accountLabel?: string;
}
