/**
 * "Describe a motion" — generate animations for the selected layers with the local
 * model, right where animations are applied (selection bar popover, Animate
 * workspace). The run happens in the background: the top-bar AI button shows its
 * progress and a toast reports the result, so this never opens the assistant.
 */
import { useEffect, useState } from 'react';
import { Sparkles, Square } from 'lucide-react';
import type { NodeId } from '@/core/model/types';
import { useUI } from '@/core/store/uiStore';
import { Button } from '@/ui/primitives';
import { phaseShortLabel, useAI, useResolvedModel } from './aiStore';
import './ai.css';

const IDEAS = ['Playful bouncy entrance', 'Subtle hover lift', 'Gentle looping float', 'Staggered reveal on scroll'];

export function startAIMotion(ids: NodeId[], prompt: string) {
  const ai = useAI.getState();
  if (ai.run.status === 'running' || !ids.length) return;
  useUI.getState().select(ids);
  ai.set({ mode: 'animate', prompt: prompt.trim() });
  void ai.start();
}

export function AIMotionPrompt({ ids, compact = false }: { ids: NodeId[]; compact?: boolean }) {
  const [text, setText] = useState('');
  const status = useAI((s) => s.status);
  const run = useAI((s) => s.run);
  const model = useResolvedModel('animation');
  const running = run.status === 'running';
  const ours = running && run.mode === 'animate';
  const ready = status === 'connected' && !!model;

  // The assistant normally checks the connection; do it here too so this works without opening it.
  useEffect(() => {
    const s = useAI.getState();
    if (s.status === 'unknown' || (s.status !== 'checking' && Date.now() - s.lastChecked > 30_000)) void s.refresh({ quiet: true });
  }, []);

  const submit = (prompt = text) => {
    if (!ready || running) return;
    startAIMotion(ids, prompt);
  };

  return (
    <div className="k-aimotion" data-compact={compact || undefined} data-testid="ai-motion">
      <div className="k-aimotion__row">
        <Sparkles className="k-aimotion__icon" aria-hidden />
        <input
          className="k-aimotion__input"
          value={text}
          placeholder={ready ? 'Describe a motion…' : 'AI motion needs Ollama'}
          aria-label="Describe a motion for AI to create"
          disabled={!ready || running}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          data-testid="ai-motion-input"
        />
        {ours ? (
          <Button size="sm" variant="outline" icon={<Square />} onClick={() => useAI.getState().cancel()} data-testid="ai-motion-cancel">
            {phaseShortLabel(run.phase)}…
          </Button>
        ) : ready ? (
          <Button size="sm" variant="primary" disabled={running} onClick={() => submit()} data-testid="ai-motion-go">
            Animate
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => useUI.getState().set({ assistantOpen: true })}>
            Set up
          </Button>
        )}
      </div>
      {ready && !running && !compact && (
        <div className="k-aimotion__ideas">
          {IDEAS.map((idea) => (
            <button key={idea} className="k-aimotion__idea" onClick={() => submit(idea)}>
              {idea}
            </button>
          ))}
        </div>
      )}
      {running && !ours && <div className="k-aimotion__note">AI is busy with another request…</div>}
    </div>
  );
}
