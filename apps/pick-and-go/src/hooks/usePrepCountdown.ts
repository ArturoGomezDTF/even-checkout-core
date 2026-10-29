import { useEffect, useRef, useState } from "react";

const EXTENSION_MINUTES = 5;

export function usePrepCountdown(
  createdAt: string,
  prepTimeMinutes: number,
  cookingStatus: string,
): { secondsLeft: number; windowSeconds: number; extraMinutesAdded: number } {
  const isActive = cookingStatus === "preparing";

  const deadlineRef = useRef<number>(0);
  const extraRef = useRef<number>(0);
  const windowSecondsRef = useRef<number>(prepTimeMinutes * 60);

  const [secondsLeft, setSecondsLeft] = useState(0);
  const [windowSeconds, setWindowSeconds] = useState(prepTimeMinutes * 60);
  const [extraMinutesAdded, setExtraMinutesAdded] = useState(0);

  useEffect(() => {
    if (extraRef.current === 0 && createdAt) {
      const baseline = new Date(createdAt).getTime() + prepTimeMinutes * 60_000;
      deadlineRef.current = baseline;
      windowSecondsRef.current = prepTimeMinutes * 60;
      setWindowSeconds(prepTimeMinutes * 60);
    }

    if (!isActive) {
      setSecondsLeft(0);
      return;
    }

    const tick = () => {
      let remaining = Math.round((deadlineRef.current - Date.now()) / 1000);
      let extended = false;

      while (remaining <= 0) {
        deadlineRef.current += EXTENSION_MINUTES * 60_000;
        extraRef.current += EXTENSION_MINUTES;
        remaining = Math.round((deadlineRef.current - Date.now()) / 1000);
        extended = true;
      }

      if (extended) {
        windowSecondsRef.current = EXTENSION_MINUTES * 60;
        setWindowSeconds(EXTENSION_MINUTES * 60);
        setExtraMinutesAdded(extraRef.current);
      }
      setSecondsLeft(remaining);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isActive, createdAt, prepTimeMinutes]);

  return { secondsLeft, windowSeconds, extraMinutesAdded };
}
