import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  images: string[];
  alt: string;
}

/** How far a drag must travel before it counts as a swipe rather than a tap. */
const SWIPE_THRESHOLD_PX = 40;

/**
 * The photographs, as a coverflow.
 *
 * Neighbouring images are turned away in perspective so the current one reads
 * as the subject rather than as the first of a row. Images are the reason a
 * traveller believes a place is worth an afternoon, so they get the top of the
 * card at full width rather than a thumbnail strip.
 *
 * It answers to every way someone would try to move through it: dragging or
 * swiping across the images, clicking one behind, the arrow keys, or the dots.
 * A gallery that only responds to a click on a half-hidden neighbour is a
 * gallery most people will conclude is not interactive.
 *
 * An image that fails to load is removed rather than left as a broken frame:
 * these URLs point at third-party hosts that can rate-limit or move a file.
 */
export default function Coverflow({ images, alt }: Props) {
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const dragStartX = useRef<number | null>(null);
  const dragged = useRef(false);

  const usable = images.filter((url) => !broken.has(url));
  const lastIndex = usable.length - 1;

  useEffect(() => {
    if (active > lastIndex) setActive(0);
  }, [lastIndex, active]);

  const step = useCallback(
    (delta: number) => {
      setActive((current) => Math.min(lastIndex, Math.max(0, current + delta)));
    },
    [lastIndex],
  );

  function onPointerDown(event: React.PointerEvent) {
    dragStartX.current = event.clientX;
    dragged.current = false;
  }

  function onPointerMove(event: React.PointerEvent) {
    if (dragStartX.current === null) return;
    // Mark as a drag early so the pointerup does not also register as a tap on
    // whichever image happens to be under the finger.
    if (Math.abs(event.clientX - dragStartX.current) > SWIPE_THRESHOLD_PX / 2) {
      dragged.current = true;
    }
  }

  function onPointerUp(event: React.PointerEvent) {
    const start = dragStartX.current;
    dragStartX.current = null;
    if (start === null) return;

    const delta = event.clientX - start;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    // Dragging left moves forward, the way a physical stack would.
    step(delta < 0 ? 1 : -1);
  }

  if (usable.length === 0) return null;

  return (
    <div
      className="relative -mx-4 -mt-4 mb-3 select-none overflow-hidden bg-ink/90"
      role="group"
      aria-roledescription="carousel"
      aria-label={`Photographs of ${alt}`}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          step(1);
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          step(-1);
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragStartX.current = null;
      }}
      style={{ touchAction: "pan-y" }}
    >
      <div className="flex h-44 items-center justify-center" style={{ perspective: "900px" }}>
        {usable.map((url, index) => {
          const offset = index - active;
          if (Math.abs(offset) > 2) return null;
          return (
            <button
              key={url}
              type="button"
              aria-label={`${alt}, photo ${index + 1} of ${usable.length}`}
              aria-current={offset === 0}
              onClick={() => {
                // A click that ended a swipe is not also a selection.
                if (dragged.current) return;
                setActive(index);
              }}
              className="absolute h-40 w-56 overflow-hidden rounded-md transition-transform duration-300 ease-out"
              style={{
                transform: `translateX(${offset * 46}%) rotateY(${offset * -38}deg) scale(${
                  offset === 0 ? 1 : 0.82
                })`,
                zIndex: 10 - Math.abs(offset),
                filter: offset === 0 ? "none" : "brightness(0.6)",
              }}
            >
              <img
                src={url}
                alt=""
                loading="lazy"
                draggable={false}
                className="pointer-events-none h-full w-full object-cover"
                onError={() => setBroken((current) => new Set(current).add(url))}
              />
            </button>
          );
        })}
      </div>

      {usable.length > 1 && (
        <div className="absolute inset-x-0 bottom-1.5 flex justify-center gap-1.5">
          {usable.map((url, index) => (
            <button
              key={url}
              type="button"
              aria-label={`Show photo ${index + 1}`}
              onClick={() => setActive(index)}
              className={`h-2 rounded-full transition-all ${
                index === active ? "w-5 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
