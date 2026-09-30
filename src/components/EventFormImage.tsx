import { useEffect, useState } from "react";
import { loadEventFormImageData } from "@/lib/eventFormSparkApi";
import type { EventFormImageRef } from "@/types/eventForms";

export function EventFormImage({ image, className = "", publicAccess = false }: { image?: EventFormImageRef | null; className?: string; publicAccess?: boolean }) {
  const [url, setUrl] = useState("");
  const assetId = image?.assetId;
  const downloadUrl = image?.downloadUrl;

  useEffect(() => {
    let active = true;
    setUrl(downloadUrl || "");
    if (!assetId || downloadUrl) return () => { active = false; };
    void loadEventFormImageData(assetId, publicAccess).then((value) => { if (active) setUrl(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [assetId, downloadUrl, publicAccess]);
  if (!image || !url) return null;
  return <img src={url} alt={image.alt} className={`max-w-full object-contain ${className}`} />;
}
