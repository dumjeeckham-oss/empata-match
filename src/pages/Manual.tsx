import manualText from "../../docs/MANUAL.md?raw";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const Manual = () => {
  return (
    <div className="mx-auto max-w-5xl space-y-4 print:max-w-none print:p-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <h1 className="page-header mb-1">사용 매뉴얼</h1>
          <p className="text-sm text-muted-foreground">자주 사용하는 기능을 화면별로 쉽게 안내합니다.</p>
        </div>
        <Button onClick={() => window.print()} className="w-full sm:w-auto">인쇄하기</Button>
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardHeader className="border-b print:hidden">
          <CardTitle className="text-base">동백 활동지원센터 프로그램 안내</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 print:p-0">
          <article className="prose prose-slate max-w-none text-[15px] leading-7 text-foreground prose-headings:font-bold prose-h1:mb-8 prose-h1:border-b-2 prose-h1:border-primary prose-h1:pb-4 prose-h1:text-2xl prose-h1:text-primary prose-h2:mt-10 prose-h2:border-b prose-h2:border-border prose-h2:pb-2 prose-h2:text-xl prose-h2:text-primary prose-h3:mt-7 prose-h3:text-lg prose-p:my-3 prose-li:my-1 prose-strong:text-foreground prose-blockquote:rounded-r-lg prose-blockquote:border-primary prose-blockquote:bg-blue-50 prose-blockquote:px-4 prose-blockquote:py-2 prose-blockquote:not-italic prose-blockquote:text-foreground prose-th:bg-muted prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 print:prose-sm print:leading-6">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                table: ({ children }) => (
                  <div className="my-5 overflow-x-auto rounded-lg border border-border print:overflow-visible">
                    <table className="m-0 min-w-[560px] border-collapse print:min-w-0">
                      {children}
                    </table>
                  </div>
                ),
                a: ({ children, href }) => (
                  <a className="font-medium text-primary underline-offset-4 hover:underline" target="_blank" rel="noreferrer" href={href}>
                    {children}
                  </a>
                ),
              }}
            >
              {manualText}
            </ReactMarkdown>
          </article>
        </CardContent>
      </Card>
    </div>
  );
};

export default Manual;
