# Quickstart Guide: Telemetry Transformation UI Demo

**Feature**: 001-telemetry-transform-ui  
**Last Updated**: November 1, 2025

## Overview

This guide helps developers quickly understand and start implementing the telemetry transformation UI demo. It covers setup, architecture, and development workflow.

---

## Prerequisites

- **Node.js**: 20.x or later
- **npm/pnpm**: Latest version
- **Code Editor**: VS Code recommended (with TypeScript, ESLint, Tailwind CSS IntelliSense extensions)
- **Git**: For version control

---

## Initial Setup

### 1. Project Initialization

```bash
# Create Next.js project with TypeScript and App Router
npx create-next-app@latest otel-transformation \
  --typescript \
  --app \
  --src-dir \
  --tailwind \
  --eslint \
  --no-turbopack

cd otel-transformation
```

### 2. Install Dependencies

```bash
# Core dependencies
npm install zustand @dnd-kit/core @dnd-kit/sortable framer-motion

# OpenTelemetry types (for reference, not runtime)
npm install --save-dev @opentelemetry/api @opentelemetry/otlp-transformer

# Testing dependencies
npm install --save-dev vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @playwright/test

# Shadcn UI CLI
npx shadcn@latest init
```

**Shadcn Configuration** (when prompted):
- TypeScript: Yes
- Style: Default
- Base color: Slate
- CSS variables: Yes
- Location: `src/components/ui`

### 3. Install Shadcn UI Components

```bash
# Install components needed for the UI
npx shadcn@latest add button
npx shadcn@latest add input
npx shadcn@latest add tooltip
npx shadcn@latest add label
npx shadcn@latest add separator
npx shadcn@latest add scroll-area
```

### 4. Project Structure Setup

```bash
# Create directory structure
mkdir -p src/lib/{telemetry,transformations/{operations},state,utils}
mkdir -p src/components/{panels,telemetry-display,transformations,keyboard-hints,section-header}
mkdir -p src/types
mkdir -p tests/{unit/{transformations,telemetry,utils},component,e2e}
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js App Router                    │
│                      (src/app/)                          │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
    ┌────▼─────┐                  ┌──────▼────┐
    │  INPUT   │                  │  OUTPUT   │
    │  Panel   │                  │   Panel   │
    └────┬─────┘                  └──────┬────┘
         │                               │
    ┌────▼──────────────┐          ┌─────▼──────┐
    │ Telemetry Tree    │          │ Readonly   │
    │ + Transformations │          │ Tree View  │
    └────┬──────────────┘          └─────▲──────┘
         │                               │
         │         ┌─────────────────────┘
         │         │
    ┌────▼─────────▼────┐
    │ Transformation     │
    │     Engine         │
    └────┬───────────────┘
         │
    ┌────▼─────┐
    │ Zustand  │
    │  State   │
    └──────────┘
```

**Data Flow**:
1. Hardcoded OTLP sample → Telemetry Parser → Display Tree
2. User interactions → Transformation Store (Zustand)
3. Run button → Transformation Engine → Result → OUTPUT panel

---

## Development Workflow

### Phase 1: Core Data Layer (Week 1)

**Goal**: Set up data structures and transformation engine

1. **Copy contract types to src/**:
   ```bash
   cp specs/001-telemetry-transform-ui/contracts/*.ts src/types/
   ```

2. **Create hardcoded sample data**:
   ```typescript
   // src/lib/telemetry/sample-data.ts
   import { ResourceSpan } from '@/types/telemetry-types';
   
   export const SAMPLE_TELEMETRY: ResourceSpan = {
     // Paste the hardcoded sample from spec
     resource: { /* ... */ },
     scopeSpans: [ /* ... */ ]
   };
   ```

3. **Build telemetry parser**:
   ```typescript
   // src/lib/telemetry/telemetry-parser.ts
   export function parseTelemetryToTree(data: ResourceSpan): TelemetryTree {
     // Extract resource attributes
     // Extract scope info
     // Extract span attributes
     // Return structured tree
   }
   ```

4. **Create transformation store**:
   ```typescript
   // src/lib/state/transformation-store.ts
   import { create } from 'zustand';
   
   export const useTransformationStore = create<TransformationStore>((set, get) => ({
     transformations: [],
     addTransformation: (t) => set((state) => ({
       transformations: [...state.transformations, t]
     })),
     // ... other actions
   }));
   ```

5. **Implement transformation operations**:
   ```typescript
   // src/lib/transformations/operations/add-attribute.ts
   export function addAttribute(
     data: ResourceSpan,
     params: AddStaticParams
   ): ResourceSpan {
     // Deep clone data
     // Find insertion point
     // Add new attribute
     // Return new data structure
   }
   ```

6. **Build transformation engine**:
   ```typescript
   // src/lib/transformations/transformation-engine.ts
   export function executeTransformations(
     inputData: ResourceSpan,
     transformations: Transformation[]
   ): TransformationResult {
     // Sort by order
     // Reduce over transformations
     // Track errors
     // Return result
   }
   ```

**Testing**: Write unit tests for each transformation operation

---

### Phase 2: Basic UI (Week 2)

**Goal**: Display telemetry and handle panel layout

1. **Create split panel layout**:
   {% raw %}
   ```typescript
   // src/components/panels/split-panel.tsx
   export function SplitPanel({ children }: { children: React.ReactNode[] }) {
     const [leftWidth, setLeftWidth] = useState(50);
     // Handle resize logic
     return (
       <div className="flex h-screen">
         <div style={{ width: `${leftWidth}%` }}>{children[0]}</div>
         <PanelDivider onResize={setLeftWidth} />
         <div style={{ width: `${100 - leftWidth}%` }}>{children[1]}</div>
       </div>
     );
   }
   ```
   {% endraw %}

2. **Build telemetry tree component**:
   ```typescript
   // src/components/telemetry-display/telemetry-tree.tsx
   export function TelemetryTree({ tree }: { tree: TelemetryTree }) {
     return (
       <div className="font-mono text-sm">
         {tree.sections.map(section => (
           <TreeSection key={section.id} section={section} />
         ))}
       </div>
     );
   }
   ```

3. **Create attribute row component**:
   ```typescript
   // src/components/telemetry-display/attribute-row.tsx
   export function AttributeRow({ attribute }: { attribute: DisplayAttribute }) {
     return (
       <div className="flex items-center gap-2 hover:bg-slate-100 px-2 py-1">
         <span className="text-slate-600">{attribute.key}</span>
         <span className="text-slate-900">{attribute.value}</span>
       </div>
     );
   }
   ```

4. **Wire up main page**:
   ```typescript
   // src/app/page.tsx
   'use client';
   
   import { useMemo } from 'react';
   import { SAMPLE_TELEMETRY } from '@/lib/telemetry/sample-data';
   import { parseTelemetryToTree } from '@/lib/telemetry/telemetry-parser';
   import { SplitPanel } from '@/components/panels/split-panel';
   import { InputPanel } from '@/components/panels/input-panel';
   import { OutputPanel } from '@/components/panels/output-panel';
   
   export default function Home() {
     const inputTree = useMemo(() => parseTelemetryToTree(SAMPLE_TELEMETRY), []);
     
     return (
       <SplitPanel>
         <InputPanel tree={inputTree} />
         <OutputPanel />
       </SplitPanel>
     );
   }
   ```

**Testing**: Component tests for tree rendering

---

### Phase 3: Transformation UI (Week 3)

**Goal**: Interactive transformation creation

1. **Add transformation forms** (one at a time):
   - Add static attribute form
   - Delete button
   - Mask value selector
   - Rename key form
   - Substring attribute form
   - Raw OTTL form

2. **Add transformation row component**:
   ```typescript
   // src/components/transformations/transformation-row.tsx
   export function TransformationRow({ transformation }: Props) {
     return (
       <div className={`p-2 ${getBackgroundColor(transformation.type)}`}>
         <DragHandle />
         <TransformationLabel transformation={transformation} />
         <UndoButton transformationId={transformation.id} />
       </div>
     );
   }
   ```

3. **Wire up state**:
   - Connect forms to Zustand store
   - Handle save/cancel/undo actions
   - Update UI on state changes

**Testing**: Component tests for each form

---

### Phase 4: Execution & Preview (Week 3-4)

**Goal**: Run transformations and show results

1. **Add Run button to INPUT panel**:
   ```typescript
   function InputPanel({ tree }) {
     const { transformations, executeTransformations } = useTransformationStore();
     
     const handleRun = () => {
       const result = executeTransformations(SAMPLE_TELEMETRY, transformations);
       // Update OUTPUT panel with result
     };
     
     return (
       <div>
         <header>
           <h2>INPUT</h2>
           <Button onClick={handleRun}>Run</Button>
         </header>
         {/* ... */}
       </div>
     );
   }
   ```

2. **Show results in OUTPUT panel**:
   ```typescript
   function OutputPanel() {
     const { lastExecutionResult } = useTransformationStore();
     
     if (!lastExecutionResult) {
       return <EmptyState message="Run transformation to preview" />;
     }
     
     return <TelemetryTree tree={lastExecutionResult.transformedTree} />;
   }
   ```

**Testing**: E2E test for transformation workflow

---

### Phase 5: Drag-and-Drop (Week 4)

**Goal**: Reorder transformations

1. **Set up DnD context**:
   ```typescript
   // src/app/page.tsx
   import { DndContext, closestCenter } from '@dnd-kit/core';
   import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
   
   function TransformationList() {
     const { transformations, reorderTransformations } = useTransformationStore();
     
     const handleDragEnd = (event) => {
       const { active, over } = event;
       reorderTransformations(active.id, over.id);
     };
     
     return (
       <DndContext onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
         <SortableContext items={transformations} strategy={verticalListSortingStrategy}>
           {transformations.map(t => <TransformationRow key={t.id} {...t} />)}
         </SortableContext>
       </DndContext>
     );
   }
   ```

**Testing**: E2E test for drag-and-drop

---

### Phase 6: Keyboard Navigation (Week 5)

**Goal**: Full keyboard support

1. **Set up keyboard context**:
   ```typescript
   // src/lib/utils/keyboard.ts
   export function useKeyboardNavigation() {
     useEffect(() => {
       function handleKeyDown(e: KeyboardEvent) {
         if (e.key === 'ArrowDown') {
           // Move focus down
         }
         // ... other keys
       }
       
       window.addEventListener('keydown', handleKeyDown);
       return () => window.removeEventListener('keydown', handleKeyDown);
     }, []);
   }
   ```

2. **Add keyboard hints bar**:
   ```typescript
   // src/components/keyboard-hints/keyboard-hints-bar.tsx
   export function KeyboardHintsBar() {
     const { mode } = useUIStore();
     const hints = getHintsForMode(mode);
     
     return (
       <div className="fixed bottom-0 w-full bg-slate-800 text-white p-2">
         {hints.map(h => <KeyHint key={h.key} {...h} />)}
       </div>
     );
   }
   ```

**Testing**: E2E test for keyboard navigation

---

## Development Commands

```bash
# Start development server
npm run dev

# Run unit tests
npm run test

# Run component tests
npm run test:component

# Run E2E tests
npm run test:e2e

# Lint code
npm run lint

# Format code
npm run format

# Build for production
npm run build

# Type check
npm run type-check
```

---

## Testing Guidelines

### Unit Tests (Vitest)

```typescript
// tests/unit/transformations/add-attribute.test.ts
import { describe, it, expect } from 'vitest';
import { addAttribute } from '@/lib/transformations/operations/add-attribute';

describe('addAttribute', () => {
  it('should add attribute to resource section', () => {
    const input = { /* ... */ };
    const params = { key: 'test', value: 'value', insertionPoint: 'resource' };
    
    const result = addAttribute(input, params);
    
    expect(result.resource.attributes).toContainEqual({
      key: 'test',
      value: { stringValue: 'value' }
    });
  });
});
```

### Component Tests (React Testing Library)

```typescript
// tests/component/add-attribute-form.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { AddAttributeForm } from '@/components/transformations/add-attribute-form';

test('should save attribute on enter', () => {
  const onSave = vi.fn();
  render(<AddAttributeForm onSave={onSave} />);
  
  const input = screen.getByPlaceholderText('Enter new_key = new_value');
  fireEvent.change(input, { target: { value: 'foo = bar' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  
  expect(onSave).toHaveBeenCalledWith({ key: 'foo', value: 'bar' });
});
```

### E2E Tests (Playwright)

```typescript
// tests/e2e/transformation-workflow.spec.ts
import { test, expect } from '@playwright/test';

test('complete transformation workflow', async ({ page }) => {
  await page.goto('/');
  
  // Add transformation
  await page.click('button[aria-label="Add static attribute"]');
  await page.fill('input[placeholder*="new_key"]', 'test = value');
  await page.press('input[placeholder*="new_key"]', 'Enter');
  
  // Run transformation
  await page.click('button:has-text("Run")');
  
  // Verify output
  await expect(page.locator('#output-panel')).toContainText('test');
  await expect(page.locator('#output-panel')).toContainText('value');
});
```

---

## Troubleshooting

### Common Issues

**Issue**: TypeScript errors with Zustand store
**Solution**: Ensure store interfaces are properly typed and imported

**Issue**: Drag-and-drop not working
**Solution**: Check DndContext is wrapping sortable items properly

**Issue**: Keyboard shortcuts conflict with browser
**Solution**: Use `event.preventDefault()` for conflicting shortcuts

**Issue**: State not updating in UI
**Solution**: Verify Zustand selectors are using shallow equality

---

## Next Steps

After completing the quickstart:
1. Review the [spec.md](./spec.md) for complete requirements
2. Check [data-model.md](./data-model.md) for data structure details
3. Implement transformation types incrementally
4. Add tests as you go (TDD recommended)
5. Run E2E tests against acceptance scenarios from spec

---

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Shadcn UI Components](https://ui.shadcn.com/)
- [Zustand Documentation](https://zustand-demo.pmnd.rs/)
- [@dnd-kit Documentation](https://docs.dndkit.com/)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)

---

**Status**: ✅ Quickstart complete
**Estimated Time**: 5 weeks for full implementation




