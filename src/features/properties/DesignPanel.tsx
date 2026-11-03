/**
 * Design tab: properties & styling of the selected layers (or page / document
 * settings when nothing is selected). Subscribes only to the selected nodes and
 * their parents.
 */
import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { buildScope } from './scope';
import { usePropsUI } from './propsStore';
import { BreakpointBanner, Header, StateBanner, StateSwitcher } from './sections/Header';
import { ContentSection } from './sections/Content';
import { AutoLayoutSection, LayoutSection, SpacingSection } from './sections/Layout';
import { BorderSection, EffectsSection, FillSection, StateAppearanceSection, TransitionsSection, TypographySection } from './sections/Style';
import { AdvancedSection } from './sections/Advanced';
import { PageSettings } from './sections/PageSettings';
import './properties.css';

export function DesignPanel() {
  const selection = useUI((s) => s.selection);
  const bp = useUI((s) => s.breakpoint);
  const editState = usePropsUI((s) => s.editState);
  const nodes = useDoc(useShallow((s) => selection.map((id) => s.doc.nodes[id]).filter(Boolean)));
  const parents = useDoc(useShallow((s) => nodes.map((n) => (n.parent ? s.doc.nodes[n.parent] : undefined))));
  const breakpoints = useDoc((s) => s.doc.breakpoints);
  const state = editState === 'default' ? null : editState;

  const scope = useMemo(() => (nodes.length ? buildScope(nodes, parents, bp, state, breakpoints) : null), [nodes, parents, bp, state, breakpoints]);
  const baseScope = useMemo(() => (nodes.length && state ? buildScope(nodes, parents, bp, null, breakpoints) : scope), [nodes, parents, bp, state, breakpoints, scope]);

  // leaving the Design tab: stop forcing an interaction state on the canvas
  useEffect(
    () => () => {
      if (usePropsUI.getState().editState !== 'default') usePropsUI.getState().setEditState('default');
    },
    [],
  );

  if (!scope || !baseScope) return <PageSettings />;
  const isRoot = nodes.some((n) => !n.parent);

  return (
    <div className="k-dp" key={selection.join(',')} data-testid="design-panel" data-edit-state={editState}>
      <Header scope={scope} />
      <BreakpointBanner scope={scope} />
      {!isRoot && <StateSwitcher nodes={nodes} />}
      <StateBanner scope={scope} />
      {state ? (
        <>
          <FillSection scope={scope} />
          <TypographySection scope={scope} />
          <BorderSection scope={scope} />
          <EffectsSection scope={scope} />
          <StateAppearanceSection scope={scope} />
          <TransitionsSection scope={baseScope} stateNodes={nodes} />
          <AdvancedSection scope={scope} />
        </>
      ) : (
        <>
          <ContentSection scope={scope} />
          <LayoutSection scope={scope} />
          <AutoLayoutSection scope={scope} />
          <SpacingSection scope={scope} />
          <TypographySection scope={scope} />
          <FillSection scope={scope} />
          <BorderSection scope={scope} />
          <EffectsSection scope={scope} />
          <TransitionsSection scope={scope} stateNodes={nodes} />
          <AdvancedSection scope={scope} />
        </>
      )}
    </div>
  );
}
