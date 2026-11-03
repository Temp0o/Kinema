import { useEffect, useRef, useState } from 'react';
import { Copy, Download, FolderOpen, MoreHorizontal, PenLine, Trash2 } from 'lucide-react';
import type { ProjectMeta } from '@/core/model/types';
import { Dropdown, ContextMenuArea, type MenuEntry } from '@/ui/menu';
import { pluralize, timeAgo } from './format';

export interface ProjectCardActions {
  open: (p: ProjectMeta) => void;
  rename: (p: ProjectMeta, name: string) => void;
  duplicate: (p: ProjectMeta) => void;
  export: (p: ProjectMeta) => void;
  remove: (p: ProjectMeta) => void;
}

function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function ProjectCard({
  project,
  actions,
  renaming,
  setRenaming,
  index,
}: {
  project: ProjectMeta;
  actions: ProjectCardActions;
  renaming: boolean;
  setRenaming: (v: boolean) => void;
  index: number;
}) {
  const [val, setVal] = useState(project.name);
  const [imgOk, setImgOk] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setVal(project.name), [project.name, renaming]);
  useEffect(() => {
    if (renaming) requestAnimationFrame(() => inputRef.current?.select());
  }, [renaming]);
  useEffect(() => setImgOk(true), [project.thumbnail]);

  const menu: MenuEntry[] = [
    { label: 'Open', icon: <FolderOpen />, onSelect: () => actions.open(project) },
    { label: 'Rename', icon: <PenLine />, onSelect: () => setTimeout(() => setRenaming(true), 150) },
    { label: 'Duplicate', icon: <Copy />, onSelect: () => actions.duplicate(project) },
    { label: 'Export .kinema', icon: <Download />, onSelect: () => actions.export(project) },
    { type: 'separator' },
    { label: 'Delete…', icon: <Trash2 />, danger: true, onSelect: () => actions.remove(project) },
  ];

  const commit = () => {
    setRenaming(false);
    if (val.trim() && val.trim() !== project.name) actions.rename(project, val.trim());
  };
  const hue = hueOf(project.id);

  return (
    <ContextMenuArea items={menu}>
      <article
        className="k-pcard"
        tabIndex={0}
        role="button"
        aria-label={`Open ${project.name}`}
        data-project-id={project.id}
        style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
        onClick={() => !renaming && actions.open(project)}
        onKeyDown={(e) => {
          if (renaming) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            actions.open(project);
          } else if (e.key === 'F2') {
            e.preventDefault();
            setRenaming(true);
          }
        }}
      >
        <div className="k-pcard__thumb" style={{ ['--h' as string]: hue }}>
          {project.thumbnail && imgOk ? (
            <img src={project.thumbnail} alt="" draggable={false} onError={() => setImgOk(false)} />
          ) : (
            <div className="k-pcard__ph">
              <span>{project.name.trim().charAt(0).toUpperCase() || 'K'}</span>
            </div>
          )}
          <div className="k-pcard__actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <Dropdown
              align="end"
              items={menu}
              trigger={
                <button className="k-pcard__more" aria-label={`Actions for ${project.name}`}>
                  <MoreHorizontal />
                </button>
              }
            />
          </div>
        </div>
        <div className="k-pcard__meta">
          {renaming ? (
            <input
              ref={inputRef}
              className="k-pcard__rename"
              autoFocus
              value={val}
              aria-label="Project name"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') {
                  setVal(project.name);
                  setRenaming(false);
                }
              }}
              onBlur={commit}
            />
          ) : (
            <h3 className="k-pcard__name" title={project.name}>
              {project.name}
            </h3>
          )}
          <p className="k-pcard__sub">
            <span>Edited {timeAgo(project.updatedAt)}</span>
            <span className="k-pcard__dot" />
            <span>{pluralize(project.pageCount ?? 1, 'page')}</span>
          </p>
        </div>
      </article>
    </ContextMenuArea>
  );
}
