import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Scales its content down (never up) so the whole block stays visible inside the box, whatever the
 * screen's shape and however many lines the mosque shows. Sizes elsewhere are in vmin, which fits a
 * square-ish screen but overflows a 16:9 wall screen once logo, welcome lines, announcements and QR are all on.
 */
export function FitBox({ className = '', innerClassName = '', children }: { className?: string; innerClassName?: string; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const cs = getComputedStyle(o);
      const availW = o.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const availH = o.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      // offsetWidth/Height are layout sizes, unaffected by the transform already applied.
      const w = i.offsetWidth;
      const h = i.offsetHeight;
      if (!w || !h || availW <= 0 || availH <= 0) return;
      const s = Math.min(1, availW / w, availH / h);
      setScale((prev) => (Math.abs(prev - s) < 0.005 ? prev : s));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} className={className}>
      <div ref={inner} className={innerClassName} style={scale < 1 ? { transform: `scale(${scale})` } : undefined}>
        {children}
      </div>
    </div>
  );
}
