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

export default function Home() {
  const inputPanelWidth = 44;
  const queuePanelWidth = 28;
  const outputPanelWidth = 28;
  const totalWidth = inputPanelWidth + queuePanelWidth + outputPanelWidth;
  const outerSplitLeftWidth = (queuePanelWidth / totalWidth) * 100;
  const innerSplitLeftWidth = (inputPanelWidth / (inputPanelWidth + outputPanelWidth)) * 100;

  const [inputTree, setInputTree] = useState(() =>
    TelemetryParser.parse(SAMPLE_TELEMETRY_DATA.resourceSpans)
  );

  const transformations = useTransformations();
  const lastResult = useLastExecutionResult();
  const { executeTransformations } = useTransformationActions();

  const [hasChanges, setHasChanges] = useState(false);

  // Track if transformations have changed since last run
  useEffect(() => {
    if (lastResult === null && transformations.length > 0) {
      setHasChanges(true);
    } else if (lastResult !== null && transformations.length !== lastResult.appliedTransformations) {
      setHasChanges(true);
    }
  }, [transformations, lastResult]);

  // Handle Run button
  const handleRun = useCallback(() => {
    const result = executeTransformations(SAMPLE_TELEMETRY_DATA.resourceSpans[0]);
    setHasChanges(false);
  }, [executeTransformations]);

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
    <main className="h-screen w-screen overflow-hidden pb-14">
      <SplitPanel
        initialLeftWidth={outerSplitLeftWidth}
        leftPanel={
          <TransformationQueuePanel
            sections={inputTree.sections}
          />
        }
        rightPanel={
          <SplitPanel
            initialLeftWidth={innerSplitLeftWidth}
            leftPanel={
              <InputPanel onPreview={handleRun}>
                <TelemetryTree tree={inputTree} />
              </InputPanel>
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
