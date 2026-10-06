import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EventFormAddressAnswer } from "@/types/eventForms";

type KakaoData = { zonecode: string; roadAddress: string; jibunAddress: string; buildingName?: string; bname?: string; userSelectedType?: "R" | "J" };
declare global { interface Window { daum?: { Postcode: new (options: { oncomplete: (data: KakaoData) => void; width?: string; height?: string }) => { embed: (element: HTMLElement) => void } } } }

let scriptPromise: Promise<void> | null = null;
function loadPostcode(): Promise<void> {
  if (window.daum?.Postcode) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("주소 검색 서비스를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function KakaoAddressField({ value, onChange, idPrefix = "event-address", labelledBy, describedBy, required = false, invalid = false }: { value?: EventFormAddressAnswer; onChange: (value: EventFormAddressAnswer) => void; idPrefix?: string; labelledBy?: string; describedBy?: string; required?: boolean; invalid?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !container.current) return;
    void loadPostcode().then(() => {
      if (!container.current || !window.daum) return;
      new window.daum.Postcode({ oncomplete: (data) => {
        const roadAddress = data.roadAddress;
        if (!roadAddress) { setError("도로명주소가 있는 결과를 선택해주세요."); return; }
        setError("");
        onChange({ zonecode: data.zonecode, roadAddress, jibunAddress: data.jibunAddress, detailAddress: "", extraAddress: data.buildingName || data.bname || "", displayAddress: roadAddress });
        setOpen(false);
      }, width: "100%", height: "100%" }).embed(container.current);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [open, onChange]);
  const zoneId = `${idPrefix}-zonecode`;
  const roadId = `${idPrefix}-road`;
  const detailId = `${idPrefix}-detail`;
  const internalErrorId = `${idPrefix}-search-error`;
  const described = [describedBy, error ? internalErrorId : ""].filter(Boolean).join(" ") || undefined;
  return <div className="space-y-2">
    <div className="flex gap-2"><label htmlFor={zoneId} className="sr-only">우편번호</label><Input id={zoneId} data-question-control readOnly value={value?.zonecode || ""} placeholder="우편번호" className="w-28" aria-labelledby={labelledBy} aria-label="우편번호" aria-describedby={described} aria-invalid={invalid || undefined} required={required} /><Button type="button" variant="outline" className="min-h-11 min-w-11" onClick={() => setOpen(true)}>주소 검색</Button></div>
    <label htmlFor={roadId} className="sr-only">도로명주소</label><Input id={roadId} readOnly value={value?.roadAddress || ""} placeholder="도로명 기본주소 (검색 결과만 입력)" aria-label="도로명주소" aria-describedby={described} aria-invalid={invalid || undefined} required={required} />
    <label htmlFor={detailId} className="sr-only">상세주소</label><Input id={detailId} value={value?.detailAddress || ""} placeholder="상세주소를 직접 입력하세요" aria-label="상세주소" aria-describedby={described} aria-invalid={invalid || undefined} required={required} onChange={(e) => { const detailAddress = e.target.value; onChange({ zonecode: value?.zonecode || "", roadAddress: value?.roadAddress || "", jibunAddress: value?.jibunAddress || "", extraAddress: value?.extraAddress || "", detailAddress, displayAddress: [value?.roadAddress, detailAddress].filter(Boolean).join(" ") }); }} />
    {error && <p id={internalErrorId} role="alert" className="text-sm text-destructive">{error}</p>}{open && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-label="도로명주소 검색"><div className="flex h-[70dvh] w-full max-w-xl flex-col rounded-lg bg-background p-3"><div className="mb-2 flex items-center justify-between"><strong>도로명주소 검색</strong><Button type="button" variant="ghost" className="min-h-11 min-w-11" onClick={() => setOpen(false)}>닫기</Button></div><div ref={container} className="min-h-0 flex-1 overflow-hidden" /></div></div>}
  </div>;
}
