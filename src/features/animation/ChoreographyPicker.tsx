/**
 * One-click choreography for a section / the page (see core/anim/choreography).
 * Click a style: every element inside gets a fitting entrance in reading order and
 * the result plays immediately; one undo step, and re-running swaps the style.
 */
import { Waves } from 'lucide-react';
import { toast } from 'sonner';
import type { NodeId } from '@/core/model/types';
import { useDoc } from '@/core/store/docStore';
import { CHOREOGRAPHIES } from '@/core/anim/choreography';
import { Tooltip } from '@/ui/primitives';
import { applyChoreography } from './animActions';

export function ChoreographyPicker({ ids, title = 'Choreograph this section', compact = false }: { ids: NodeId[]; title?: string; compact?: boolean }) {
  return (
    <div className="k-choreo" data-compact={compact || undefined} data-testid="choreo">
      <div className="k-choreo__head">
        <Waves />
        <span>{title}</span>
      </div>
      <div className="k-choreo__list">
        {CHOREOGRAPHIES.map((c) => (
          <Tooltip key={c.id} content={c.description}>
            <button
              className="k-choreo__item"
              data-choreo={c.id}
              onClick={() => {
                const n = applyChoreography(ids, c);
                if (!n) toast('Nothing to animate here', { description: 'Choreography animates the text, buttons, images and cards inside a section.' });
                else toast(`${c.name}: ${n} element${n === 1 ? '' : 's'} animated`, { action: { label: 'Undo', onClick: () => useDoc.getState().undo() } });
              }}
            >
              {c.name}
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
