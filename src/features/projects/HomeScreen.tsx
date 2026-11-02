/**
 * Project browser (home). Basic version — the projects module extends it with
 * templates, import/export, rename/duplicate and thumbnails.
 */
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { platform } from '@/platform';
import type { ProjectMeta } from '@/core/model/types';
import { Button, EmptyState } from '@/ui/primitives';
import { Wordmark } from '@/app/Logo';
import { createProject, openProject } from './projectService';

export function HomeScreen() {
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  useEffect(() => {
    platform.projects.list().then(setProjects, (e) => toast.error(String(e)));
  }, []);
  const create = async () => {
    const id = await createProject('Untitled');
    await openProject(id);
  };
  return (
    <div className="k-home">
      <header className="k-home__bar k-drag-region">
        <Wordmark />
      </header>
      <div style={{ padding: 32 }}>
        <Button variant="primary" icon={<Plus />} onClick={create}>
          New project
        </Button>
        {projects && projects.length === 0 && <EmptyState title="No projects yet">Create your first project to get started.</EmptyState>}
        <ul>
          {projects?.map((p) => (
            <li key={p.id}>
              <button onClick={() => openProject(p.id)}>{p.name}</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
