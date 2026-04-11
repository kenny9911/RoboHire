import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows' | 'style'> & {
  minRows?: number;
  maxHeightVh?: number;
  className?: string;
};

const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, Props>(function AutoGrowTextarea(
  { minRows = 3, maxHeightVh = 40, className = '', value, onInput, ...rest },
  ref
) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

  const resize = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxPx = Math.round((window.innerHeight * maxHeightVh) / 100);
    const target = Math.min(el.scrollHeight, maxPx);
    el.style.height = `${target}px`;
    el.style.overflowY = el.scrollHeight > maxPx ? 'auto' : 'hidden';
  }, [maxHeightVh]);

  useEffect(() => {
    resize();
  }, [value, resize]);

  useEffect(() => {
    const handler = () => resize();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [resize]);

  return (
    <textarea
      {...rest}
      ref={innerRef}
      rows={minRows}
      value={value}
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
      className={`resize-y ${className}`}
    />
  );
});

export default AutoGrowTextarea;
