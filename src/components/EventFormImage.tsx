import { useEffect, useState } from "react";
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "@/lib/firebase";
import type { EventFormImageRef } from "@/types/eventForms";

export function EventFormImage({ image, className = "" }: { image?: EventFormImageRef | null; className?: string }) {
  const [url, setUrl] = useState("");
  const assetId = image?.assetId;
  const downloadUrl = image?.downloadUrl;
  const storagePath = image?.storagePath;

  useEffect(() => {
    let active = true;
    setUrl(downloadUrl || "");
    if (!assetId || downloadUrl || !storagePath) return () => { active = false; };
    void getDownloadURL(ref(storage, storagePath)).then((value) => { if (active) setUrl(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [assetId, downloadUrl, storagePath]);
  if (!image || !url) return null;
  return <img src={url} alt={image.alt} className={`max-w-full object-contain ${className}`} />;
}
