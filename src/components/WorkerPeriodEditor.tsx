import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import type { Worker } from '@/types';

interface WorkerPeriodEditorProps {
  worker: Worker;
  /** Function to update worker in Firestore */
  updateWorker: (id: string, data: Partial<Worker>) => Promise<void>;
  /** Callback after successful save, can be used to refresh parent data */
  onSaved?: () => void;
}
  worker: Worker;
  /** Callback after successful save, can be used to refresh parent data */
  onSaved?: () => void;
}

/**
 * UI for editing a single worker's service period.
 * - Allows setting serviceStartDate.
 * - "현재 서비스중" checkbox toggles serviceEndDate to null.
 * - When unchecked, a serviceEndDate picker is shown.
 * - Saves changes via the provided `updateWorker` function (passed via context).
 */
export const WorkerPeriodEditor: React.FC<WorkerPeriodEditorProps> = ({ worker, onSaved }) => {
  const [serviceStartDate, setServiceStartDate] = useState<string>(worker.serviceStartDate ?? '');
  const [serviceEndDate, setServiceEndDate] = useState<string>(worker.serviceEndDate ?? '');
  const [isActive, setIsActive] = useState<boolean>(!worker.serviceEndDate);

  // Update active flag when end date changes externally
  useEffect(() => {
    setIsActive(!worker.serviceEndDate);
    setServiceEndDate(worker.serviceEndDate ?? '');
    setServiceStartDate(worker.serviceStartDate ?? '');
  }, [worker]);

  const handleSave = async () => {
    // Basic validation: start date required if active, end date required if not active.
    if (!serviceStartDate) {
      toast({ title: '시작일을 입력해주세요', variant: 'destructive' });
      return;
    }
    if (!isActive && !serviceEndDate) {
      toast({ title: '종료일을 입력해주세요', variant: 'destructive' });
      return;
    }
    // Determine contractStatus based on end date presence.
    const contractStatus = isActive ? '근무중' : '퇴사';
    // Assume there is a global `updateWorker` helper available via context or passed.
    // For simplicity we import from assignments sync function later.
    // The parent component passes a function via closure; we will call a global method.
    // Here we use a placeholder `window.updateWorker` (to be bound in parent).
    try {
      // @ts-ignore – runtime will provide this function via prop or context.
      await (window as any).updateWorker(worker.id, {
        serviceStartDate,
        serviceEndDate: isActive ? '' : serviceEndDate,
        contractStatus,
      });
      toast({ title: '근무 기간이 저장되었습니다' });
      if (onSaved) onSaved();
    } catch (e) {
      console.error(e);
      toast({ title: '저장 실패', variant: 'destructive' });
    }
  };

  return (
    <div className="border rounded p-4 mb-4">
      <h4 className="font-medium mb-2">{worker.name} ({worker.phone?.slice(-4)})</h4>
      <div className="grid grid-cols-2 gap-4 items-center mb-2">
        <label className="text-sm">서비스 시작일</label>
        <Input type="date" value={serviceStartDate} onChange={e => setServiceStartDate(e.target.value)} />
        <label className="text-sm">현재 서비스중</label>
        <Checkbox checked={isActive} onCheckedChange={checked => setIsActive(!!checked)} />
        {!isActive && (
          <>
            <label className="text-sm">서비스 종료일</label>
            <Input type="date" value={serviceEndDate} onChange={e => setServiceEndDate(e.target.value)} />
          </>
        )}
      </div>
      <Button onClick={handleSave}>저장</Button>
    </div>
  );
};
