import { useEffect, useState } from "react";
import { Download, MonitorDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

type InstallChoice = { outcome: "accepted" | "dismissed"; platform: string };
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [installed, setInstalled] = useState(() => typeof window !== "undefined" && isStandalone());

  useEffect(() => {
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      toast({ title: "PC 앱 설치 완료", description: "시작 메뉴나 바탕화면에서 동백 아이콘을 실행할 수 있습니다." });
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (installed) return null;

  const install = async () => {
    if (!installPrompt) {
      setGuideOpen(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "dismissed") setGuideOpen(true);
  };

  return (
    <>
      <Button variant="outline" size="sm" className="hidden shrink-0 rounded-full text-xs lg:inline-flex" onClick={() => void install()}>
        <MonitorDown className="mr-1 h-4 w-4" />PC에 설치
      </Button>
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-primary" />동백 프로그램을 PC 바탕화면에 설치</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border p-4"><p className="font-semibold">Microsoft Edge</p><p className="mt-1 text-muted-foreground">오른쪽 위 <b>…</b> → <b>앱</b> → <b>이 사이트를 앱으로 설치</b>를 선택하세요. 설치 후 표시되는 창에서 <b>바탕 화면 바로 가기 만들기</b>를 체크합니다.</p></div>
            <div className="rounded-lg border p-4"><p className="font-semibold">Google Chrome</p><p className="mt-1 text-muted-foreground">주소창 오른쪽의 <b>설치 아이콘</b>을 누르거나, 오른쪽 위 <b>⋮</b> 메뉴에서 <b>페이지를 앱으로 설치</b>를 선택하세요. 설치된 동백 앱을 시작 메뉴에서 찾아 바탕화면으로 끌어놓을 수도 있습니다.</p></div>
            <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">설치하면 브라우저 탭 없이 별도 창으로 열리고, 현재 동백 파비콘이 PC 앱과 바로가기 아이콘으로 사용됩니다.</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
