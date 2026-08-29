import { useEffect, useState } from "react";

interface Props {
  images: string[];
  alt: string;
}

/**
 * The photographs, as a coverflow.
 *
 * Neighbouring images are turned away in perspective so the current one reads
 * as the subject rather than as the first of a row. Images are the reason a
 * traveller believes a place is worth an afternoon, so they get the top of the
 * card at full width rather than a thumbnail strip.
 *
 * An image that fails to load is removed rather than left as a broken frame:
 * these URLs point at third-party hosts that can rate-limit or move a file.
 */
export default function Coverflow({ images, alt }: Props) {
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set());

  const usable = images.filter((url) => !broken.has(url));

  useEffect(() => {
    if (active > usable.length - 1) setActive(0);
  }, [usable.length, active]);

  if (usable.length === 0) return null;

  return (
    <div className="relative -mx-4 -mt-4 mb-3 overflow-hidden bg-ink/90">
      <div
        className="flex h-44 items-center justify-center"
        style={{ perspective: "900px" }}
      >
        {usable.map((url, index) => {
          const offset = index - active;
          if (Math.abs(offset) > 2) return null;
          return (
            <button
              key={url}
              type="button"
              aria-label={`${alt}, photo ${index + 1} of ${usable.length}`}
              aria-current={offset === 0}
              onClick={() => setActive(index)}
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
                className="h-full w-full object-cover"
                onError={() => setBroken((current) => new Set(current).add(url))}
              />
            </button>
          );
        })}
      </div>

      {usable.length > 1 && (
        <div className="absolute inset-x-0 bottom-1.5 flex justify-center gap-1">
          {usable.map((url, index) => (
            <span
              key={url}
              className={`h-1 rounded-full transition-all ${
                index === active ? "w-4 bg-white" : "w-1 bg-white/50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
