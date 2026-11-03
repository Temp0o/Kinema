import { useMemo } from 'react';
import { useDoc } from '@/core/store/docStore';
import { useCurrentRootId } from '@/core/store/actions';
import type { KNode, NodeId } from '@/core/model/types';

/** Animated nodes of the current page / component, in tree order with depth. */
export function useAnimatedNodes(): { node: KNode; depth: number }[] {
  const rootId = useCurrentRootId();
  const nodes = useDoc((s) => s.doc.nodes);
  return useMemo(() => {
    if (!rootId) return [];
    const out: { node: KNode; depth: number }[] = [];
    const walk = (id: NodeId, depth: number) => {
      const n = nodes[id];
      if (!n) return;
      if (n.animations?.length) out.push({ node: n, depth });
      for (const c of n.children) walk(c, depth + 1);
    };
    walk(rootId, 0);
    return out;
  }, [rootId, nodes]);
}
