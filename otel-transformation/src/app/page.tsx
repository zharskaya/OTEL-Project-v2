'use client';

import { useEffect, useState, useCallback } from 'react';
import { SplitPanel } from '@/components/panels/split-panel';
import { InputPanel } from '@/components/panels/input-panel';
import { OutputPanel } from '@/components/panels/output-panel';
import { TransformationQueuePanel } from '@/components/panels/transformation-queue-panel';
import { TelemetryTree } from '@/components/telemetry-display/telemetry-tree';
import { ReadOnlyTelemetryTree } from '@/components/telemetry-display/read-only-telemetry-tree';
import { KeyboardHintsBar } from '@/components/keyboard-hints/keyboard-hints-bar';
import { SAMPLE_TELEMETRY_DATA } from '@/lib/telemetry/sample-data';
import { TelemetryParser } from '@/lib/telemetry/telemetry-parser';
import {
  useTransformations,
  useLastExecutionResult,
  useTransformationActions,
} from '@/lib/state/hooks';
import type { Transformation } from '@/types/transformation-types';

function serializeTransformations(transformations: Transformation[]): string {
  return JSON.stringify(
    [...transformations]
      .sort((first, second) => {
        if (first.order !== second.order) {
          return first.order - second.order;
        }
        return first.id.localeCompare(second.id);
      })
      .map(
        ({
          id,
          type,
          sectionId,
          status,
          order,
          pairedTransformationId,
          params,
        }) => ({
          id,
          type,
          sectionId,
          status,
          order,
          pairedTransformationId,
          params,
        })
      )
  );
}

export default function Home() {
  const inputPanelWidth = 44;
  const queuePanelWidth = 28;
  const outputPanelWidth = 28;
  const totalWidth = inputPanelWidth + queuePanelWidth + outputPanelWidth;
  const outerSplitLeftWidth = (inputPanelWidth / totalWidth) * 100;
  const innerSplitLeftWidth = (queuePanelWidth / (queuePanelWidth + outputPanelWidth)) * 100;

  const [inputTree, setInputTree] = useState(() =>
    TelemetryParser.parse(SAMPLE_TELEMETRY_DATA.resourceSpans)
  );

  const transformations = useTransformations();
  const lastResult = useLastExecutionResult();
  const { executeTransformations } = useTransformationActions();

  const [hasChanges, setHasChanges] = useState(false);
  const [lastExecutedSignature, setLastExecutedSignature] = useState(() =>
    serializeTransformations(transformations)
  );

  // Track if transformations have changed since last run
  useEffect(() => {
    const currentSignature = serializeTransformations(transformations);
    if (currentSignature !== lastExecutedSignature) {
      if (!hasChanges) {
      setHasChanges(true);
      }
    } else if (hasChanges) {
      setHasChanges(false);
    }
  }, [hasChanges, lastExecutedSignature, transformations]);

  // Handle Run button
  const handleRun = useCallback(() => {
    const result = executeTransformations(SAMPLE_TELEMETRY_DATA.resourceSpans[0]);
    setLastExecutedSignature(serializeTransformations(transformations));
    setHasChanges(false);
  }, [executeTransformations, transformations]);

  // Keyboard shortcut: Cmd+Enter or Ctrl+Enter to run
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRun();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRun]);

  return (
    <main className="h-screen w-screen overflow-hidden">
      <SplitPanel
        initialLeftWidth={outerSplitLeftWidth}
        leftPanel={
          <InputPanel>
            <TelemetryTree tree={inputTree} />
          </InputPanel>
        }
        rightPanel={
          <SplitPanel
            initialLeftWidth={innerSplitLeftWidth}
            leftPanel={
              <TransformationQueuePanel
                sections={inputTree.sections}
                onPreview={handleRun}
              />
            }
            rightPanel={
              <OutputPanel
                isEmpty={lastResult === null}
                hasChanges={hasChanges}
                executionTime={lastResult?.executionTime}
              >
                {lastResult && (
                  <ReadOnlyTelemetryTree tree={lastResult.transformedTree} />
                )}
              </OutputPanel>
            }
          />
        }
      />
      <KeyboardHintsBar />
    </main>
  );
}
