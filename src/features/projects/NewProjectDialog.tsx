import { useEffect, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Button, Dialog, TextInput } from '@/ui/primitives';
import { TEMPLATES } from '@/core/templates';
import { TemplatePreview } from './TemplatePreview';

export function NewProjectDialog({
  open,
  initialTemplate,
  busy,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  initialTemplate: string;
  busy?: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (name: string, templateId: string) => void;
}) {
  const [name, setName] = useState('');
  const [tpl, setTpl] = useState(initialTemplate);
  useEffect(() => {
    if (open) {
      setTpl(initialTemplate);
      setName('');
    }
  }, [open, initialTemplate]);
  const def = TEMPLATES.find((t) => t.id === tpl);
  const submit = () => onCreate(name.trim() || (tpl === 'blank' ? 'Untitled' : (def?.name ?? 'Untitled')), tpl);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      width={760}
      title="New project"
      description="Name your project and pick a starting point."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Plus />} loading={busy} onClick={submit}>
            Create project
          </Button>
        </>
      }
    >
      <div className="k-newproj">
        <label className="k-label" htmlFor="k-newproj-name">
          Project name
        </label>
        <TextInput
          id="k-newproj-name"
          autoFocus
          value={name}
          placeholder={def && tpl !== 'blank' ? def.name : 'Untitled'}
          onChange={setName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <span className="k-label" style={{ marginTop: 6 }}>
          Template
        </span>
        <div className="k-newproj__grid" role="radiogroup" aria-label="Template">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tpl === t.id}
              className="k-newproj__tpl"
              data-selected={tpl === t.id ? 'true' : undefined}
              data-template={t.id}
              onClick={() => setTpl(t.id)}
              onDoubleClick={submit}
            >
              <TemplatePreview template={t} />
              <span className="k-newproj__name">{t.name}</span>
              {tpl === t.id && (
                <span className="k-newproj__check">
                  <Check />
                </span>
              )}
            </button>
          ))}
        </div>
        {def && <p className="k-newproj__desc">{def.description}</p>}
      </div>
    </Dialog>
  );
}
