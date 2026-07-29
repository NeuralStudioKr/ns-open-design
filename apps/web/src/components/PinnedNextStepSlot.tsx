import type { DesignToolboxActionId } from '../runtime/design-toolbox';
import type { SkillSummary } from '../types';
import { NextStepActions } from './NextStepActions';

interface Props {
  artifactName: string;
  onShare?: (fileName: string) => void;
  onDownload?: (fileName: string) => void;
  onToolboxAction?: (id: DesignToolboxActionId) => void;
  onPickSkill?: (skillId: string) => void;
  skills?: SkillSummary[];
  toolboxSkillNames?: Partial<Record<DesignToolboxActionId, string | null>>;
  onShareToOpenDesign?: () => void;
  shareToOpenDesignBusy?: boolean;
}

export function PinnedNextStepSlot({
  artifactName,
  onShare,
  onDownload,
  onToolboxAction,
  onPickSkill,
  skills,
  toolboxSkillNames,
  onShareToOpenDesign,
  shareToOpenDesignBusy = false,
}: Props) {
  return (
    <div className="chat-pinned-next-step" data-testid="chat-pinned-next-step">
      <NextStepActions
        fileName={artifactName}
        onShare={onShare}
        onDownload={onDownload}
        onToolboxAction={onToolboxAction}
        onPickSkill={onPickSkill}
        skills={skills}
        toolboxSkillNames={toolboxSkillNames}
        onShareToOpenDesign={onShareToOpenDesign}
        shareToOpenDesignBusy={shareToOpenDesignBusy}
        pinned
      />
    </div>
  );
}
