'use client';

import React from 'react';
import { tokenizeValue, getTokenColorClass } from '@/lib/utils/syntax-highlighter';
import { ValueType } from '@/types/telemetry-types';

interface SyntaxHighlighterProps {
  value: string;
  valueType?: ValueType;
  className?: string;
  showQuotes?: boolean;
}

export function SyntaxHighlighter({
  value,
  valueType,
  className = '',
  showQuotes = true,
}: SyntaxHighlighterProps) {
  const tokens = tokenizeValue(value);
  
  // Only add quotes if the value type is explicitly STRING
  const shouldAddQuotes = showQuotes && valueType === ValueType.STRING;

  return (
    <span className={className}>
      {shouldAddQuotes && (
        <span
          className={`${getTokenColorClass('string')} select-none pointer-events-none`}
          aria-hidden="true"
          data-quote="open"
        >
          "
        </span>
      )}
      {tokens.map((token, index) => {
        const tokenClass = getTokenColorClass(shouldAddQuotes ? 'string' : token.type);
        return (
          <span key={index} className={tokenClass} data-value-token="true">
            {token.value}
          </span>
        );
      })}
      {shouldAddQuotes && (
        <span
          className={`${getTokenColorClass('string')} select-none pointer-events-none`}
          aria-hidden="true"
          data-quote="close"
        >
          "
        </span>
      )}
    </span>
  );
}

