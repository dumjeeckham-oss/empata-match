import manualText from "../../docs/MANUAL.md?raw";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Manual = () => {
  return (
    <div className="mx-auto max-w-5xl space-y-4 print:max-w-none print:p-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <h1 className="page-header mb-1">사용 매뉴얼</h1>
          <p className="text-sm text-muted-foreground">시스템 통합 사용자 매뉴얼 및 데이터 구조 가이드</p>
        </div>
        <Button onClick={() => window.print()} className="w-full sm:w-auto">인쇄하기</Button>
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardHeader className="border-b print:hidden">
          <CardTitle className="text-base">문서 미리보기</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 print:p-0">
          <article className="prose prose-sm max-w-none whitespace-pre-wrap leading-7 text-foreground print:prose-sm print:leading-6">
            {manualText}
          </article>
        </CardContent>
      </Card>
    </div>
  );
};

export default Manual;
