import { useCallback, useEffect, useRef, useState } from 'react';

type CoinToastPayload = {
  amount: number;
};

type CoinToastItem = CoinToastPayload & {
  id: number;
};

const COIN_AWARDED_EVENT = 'pusselpaus:coins-awarded';

export default function CoinToast() {
  const [items, setItems] = useState<CoinToastItem[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playCoinSound = useCallback(() => {
    try {
      const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContextCtor();
      }

      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;

      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.07, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

      const osc1 = ctx.createOscillator();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(1046.5, now + 0.08);
      osc1.connect(gain);
      osc1.start(now);
      osc1.stop(now + 0.09);

      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1174.66, now + 0.09);
      osc2.frequency.exponentialRampToValueAtTime(1318.51, now + 0.2);
      osc2.connect(gain);
      osc2.start(now + 0.09);
      osc2.stop(now + 0.22);
    } catch {
      // Silent fallback if audio context is unavailable or blocked.
    }
  }, []);

  useEffect(() => {
    const onAwarded = (event: Event) => {
      const customEvent = event as CustomEvent<CoinToastPayload>;
      const amount = customEvent.detail?.amount ?? 0;
      if (amount <= 0) return;

      playCoinSound();

      const id = Date.now() + Math.floor(Math.random() * 1000);
      setItems((prev) => [...prev, { id, amount }]);

      window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }, 2400);
    };

    window.addEventListener(COIN_AWARDED_EVENT, onAwarded as EventListener);
    return () => {
      window.removeEventListener(COIN_AWARDED_EVENT, onAwarded as EventListener);
    };
  }, [playCoinSound]);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-16 z-50 flex flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-xl border border-yellow-300/30 bg-yellow-500/20 px-3 py-2 text-sm font-bold text-yellow-200 shadow-lg backdrop-blur"
        >
          +{item.amount} coins 🪙
        </div>
      ))}
    </div>
  );
}
