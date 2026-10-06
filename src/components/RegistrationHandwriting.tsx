import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import HandwritingCanvas, { type HandwritingCanvasHandle } from "@/components/HandwritingCanvas";
import { ForceDeleteMemoButton } from "@/components/ForceDeleteMemoButton";
import { useAuth } from "@/hooks/useAuth";
import { useCounselingHandwriting, MIN_HANDWRITING_WRITE_INTERVAL } from "@/hooks/useCounselingHandwriting";
import { registrationHandwritingApi, newRegistrationMemo, registrationCanvasMemo, type RegistrationMemo } from "@/lib/registrationHandwritingApi";
import { getHandwritingDraft, timestampMillis, type HandwritingMemo, type MemoTargetType } from "@/lib/counselingHandwriting";

function RegistrationBoard({ memo, uid, close }: { memo: HandwritingMemo; uid: string; close: () => void }) {
 const board = useCounselingHandwriting(memo, uid, MIN_HANDWRITING_WRITE_INTERVAL, registrationHandwritingApi);
 const canvas = useRef<HandwritingCanvasHandle>(null);
 const [busy,setBusy]=useState(false), [error,setError]=useState("");
 const save = async (closing=false) => {
  if(busy) return; setBusy(true);setError("");
  try { canvas.current?.finalize(); await board.flush(); if(closing) close(); }
  catch {setError("임시저장하지 못했습니다. 필기는 보존됩니다. 상태와 연결을 확인해 주세요.");}
  finally {setBusy(false);}
 };
 return <div className="flex min-h-0 flex-1 flex-col gap-2">
  <p role="status">{board.status}</p>{error && <p role="alert">{error}</p>}
  {board.recovery && <p role="alert">복구할 필기를 보존했습니다. 서버 메모를 자동으로 다시 만들지 않습니다.</p>}
  <HandwritingCanvas ref={canvas} strokes={board.strokes} width={memo.width} height={memo.height} onChange={board.change} onPending={board.stage} disabled={busy || board.deleted || board.invalid}/>
  <div className="flex flex-wrap gap-2"><Button disabled={busy || board.deleted} onClick={()=>void save()}>임시저장</Button><Button disabled={busy} onClick={()=>void save(true)}>저장 후 닫기</Button><Button variant="outline" disabled={busy} onClick={()=>{canvas.current?.finalize();close();}}>닫기 · 임시자료 유지</Button></div>
 </div>;
}
export function RegistrationHandwriting({ targetType, draftId, pendingOnly=false }: { targetType: MemoTargetType; draftId?: string; pendingOnly?: boolean }) {
 const {user}=useAuth();const [staff,setStaff]=useState(false),[memos,setMemos]=useState<RegistrationMemo[]>([]),[selected,setSelected]=useState<HandwritingMemo|null>(null),[notice,setNotice]=useState("");
 useEffect(()=>{let active=true;setStaff(false);if(user)void user.getIdTokenResult().then(token=>{if(active)setStaff(["admin","social_worker"].includes(String(token.claims.role)));}).catch(()=>{});return()=>{active=false;};},[user]);
 useEffect(()=>{if(!user||!staff)return;return registrationHandwritingApi.subscribePending(items=>setMemos(items.filter(m=>m.targetType===targetType)),()=>setNotice("임시 손글씨 목록을 불러오지 못했습니다."));},[user,staff,targetType]);
 if(!user||!staff)return null;
 const open=async(id:string)=>{try {const remote=await registrationHandwritingApi.load(id);setSelected(remote||getHandwritingDraft(user.uid,id)?.memo||newRegistrationMemo(targetType,id,user.uid));}catch {setNotice("손글씨를 불러오지 못했습니다. 다시 확인해 주세요.");}};
 return <section className="space-y-2 no-print" aria-label="신규등록 임시 손글씨">
  {!pendingOnly&&draftId&&<Button variant="outline" onClick={()=>void open(draftId)}>✏️ 손글씨 메모</Button>}
  {notice&&<p role="status">{notice}</p>}
  {pendingOnly&&memos.length>0&&<><p>신규등록 임시 손글씨 · 등록 전 자료도 유지됩니다.</p>{memos.map(m=><div key={m.draftId} className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>void open(m.draftId)}>{m.registered?"등록 완료":"미완료 등록"} · {timestampMillis(m.createdAt)?new Date(timestampMillis(m.createdAt)).toLocaleString("ko-KR"):"임시자료"} · {m.draftId.slice(0,8)} 열기</Button><ForceDeleteMemoButton memo={registrationCanvasMemo(m)} uid={user.uid} service={registrationHandwritingApi} onDeleted={()=>{setMemos(items=>items.filter(item=>item.draftId!==m.draftId));setNotice("임시 손글씨를 삭제했습니다.");}}/></div>)}</>}
  <Dialog open={Boolean(selected)} onOpenChange={open=>{if(!open)setSelected(null);}}><DialogContent className="flex h-[92dvh] max-w-[1400px] flex-col no-print" onPointerDownOutside={e=>e.preventDefault()}><DialogHeader><DialogTitle>{targetType} 신규등록 손글씨</DialogTitle><DialogDescription>필요한 내용을 정식 정보에 입력한 후 직원이 확인하여 삭제합니다. 등록·취소·닫기로 자동 삭제하지 않습니다.</DialogDescription></DialogHeader>{selected&&<RegistrationBoard key={selected.id} memo={selected} uid={user.uid} close={()=>setSelected(null)}/>}</DialogContent></Dialog>
 </section>;
}
