/**
 * Background-run notices: when an AI run finishes while the assistant drawer is
 * closed, tell the user what happened and offer to open it. (While the drawer is
 * open the run view already shows the result, so no toast.)
 */
import { toast } from 'sonner';
import { useUI } from '@/core/store/uiStore';

interface FinishedRun {
  status: string;
  error: string | null;
}

export function openAssistant() {
  useUI.getState().set({ assistantOpen: true });
}

export function notifyRunFinished(run: FinishedRun, summary: string) {
  const ui = useUI.getState();
  if (ui.route !== 'editor' || ui.assistantOpen) return;
  const action = { label: 'Open AI', onClick: openAssistant };
  if (run.status === 'applied') toast.success('AI finished', { description: summary || undefined, action });
  else if (run.status === 'preview') toast('AI results ready', { description: summary || 'Pick a variant to insert.', action: { label: 'Choose', onClick: openAssistant } });
  else if (run.status === 'error') toast.error('AI couldn’t finish', { description: run.error?.slice(0, 160) ?? undefined, action });
}
