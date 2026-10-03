"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  basePath: string;
  alt: string;
}

/**
 * A phone that plays the app tour. The video is the light path (456 KB);
 * where a browser refuses to play it (iPhone Low Power Mode, Safari's
 * per-site autoplay setting, a power saver), the animated WebP takes its
 * place, so the phone never shows a still that looks like a picture. Visitors
 * who ask for reduced motion get the still on purpose.
 */
export function KlarbefundTourPhone({ basePath, alt }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const onError = () => setFallback(true);
    v.addEventListener("error", onError);
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        v.play()?.catch((err: unknown) => {
          // AbortError only means a pause() overtook the play(); anything
          // else (NotAllowedError, NotSupportedError) means it won't play.
          if ((err as { name?: string })?.name !== "AbortError") onError();
        });
      } else {
        v.pause();
      }
    });
    io.observe(v);
    return () => {
      io.disconnect();
      v.removeEventListener("error", onError);
    };
  }, []);

  const still = `${basePath}/klarbefund/klarbefund-tour-poster.png`;

  return (
    <div className="justify-self-center w-[min(70vw,260px)] rounded-[2.5rem] border-8 border-gray-900 dark:border-gray-700 bg-gray-900 shadow-xl overflow-hidden">
      {fallback ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="block w-full h-auto"
          src={`${basePath}/klarbefund/klarbefund-tour.webp`}
          alt={alt}
          width={440}
          height={956}
        />
      ) : (
        <video
          ref={videoRef}
          className="block w-full h-auto motion-reduce:hidden"
          src={`${basePath}/klarbefund/klarbefund-tour.mp4`}
          poster={still}
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          aria-label={alt}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="hidden w-full h-auto motion-reduce:block"
        src={still}
        alt={fallback ? "" : alt}
        width={440}
        height={956}
      />
    </div>
  );
}
