import { useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { useRevealOpen } from './RevealGate';

export type CountUpProps = {
  value: number;
  duration?: number;
  delay?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

type Counter = {
  startAt: number;
  duration: number;
  target: number;
  factor: number;
  shown: number;
  set: (next: number) => void;
};

const MIN_UPDATE_MS = 33;

const counters = new Set<Counter>();
let frame: number | null = null;
let lastTick = 0;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function tick() {
  frame = null;
  const now = performance.now();

  if (now - lastTick >= MIN_UPDATE_MS) {
    lastTick = now;
    for (const counter of counters) {
      if (now < counter.startAt) continue;
      const t = Math.min((now - counter.startAt) / counter.duration, 1);
      const next =
        t >= 1
          ? counter.target
          : Math.round(counter.target * easeOutCubic(t) * counter.factor) / counter.factor;
      if (next !== counter.shown) {
        counter.shown = next;
        counter.set(next);
      }
      if (t >= 1) counters.delete(counter);
    }
  }

  if (counters.size > 0) frame = requestAnimationFrame(tick);
}

function register(counter: Counter): () => void {
  counters.add(counter);
  if (frame == null) frame = requestAnimationFrame(tick);
  return () => {
    counters.delete(counter);
    if (counters.size === 0 && frame != null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  };
}

export function CountUp({
  value,
  duration = 980,
  delay = 0,
  decimals = 0,
  prefix = '',
  suffix = '',
  style,
  numberOfLines,
}: CountUpProps) {
  const open = useRevealOpen();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!open) return;
    return register({
      startAt: performance.now() + delay,
      duration: Math.max(duration, 1),
      target: value,
      factor: 10 ** decimals,
      shown: Number.NaN,
      set: setDisplay,
    });
  }, [open, value, duration, delay, decimals]);

  return (
    <Text style={style} numberOfLines={numberOfLines} allowFontScaling={false}>
      {`${prefix}${display.toFixed(decimals)}${suffix}`}
    </Text>
  );
}

export default CountUp;
