"use client";
// Product photo with a branded fallback for missing or broken images.
// Sizing comes from the parent (.foodImg, .customImage), which sets the aspect ratio.
import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";

export default function FoodPhoto({
  src,
  alt,
  eager = false,
}: {
  src: string;
  alt: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <span className="foodFallback" role="img" aria-label={alt}>
        <UtensilsCrossed size={34} strokeWidth={1.6} />
      </span>
    );
  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
