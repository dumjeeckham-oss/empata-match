import * as React from "react";

import { DialogContent, DialogHeader } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogContent>;

/**
 * Mobile detail screens use the full dynamic viewport so browser chrome changes
 * cannot move the dialog off-screen. Desktop keeps the centered modal layout.
 */
export const MobileDetailDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  DialogContentProps
>(({ className, ...props }, ref) => (
  <DialogContent
    ref={ref}
    aria-describedby={undefined}
    data-no-swipe
    className={cn(
      "left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-screen min-w-0 max-w-none flex-col translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 p-0",
      "sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[92dvh] sm:w-[96vw] sm:max-w-6xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border",
      className,
    )}
    {...props}
  />
));
MobileDetailDialogContent.displayName = "MobileDetailDialogContent";

export function MobileDetailDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <DialogHeader
      className={cn("w-full shrink-0 border-b bg-background px-4 py-4 pr-14 text-left sm:px-6", className)}
      {...props}
    />
  );
}

export function MobileDetailDialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("min-h-0 min-w-0 w-full flex-1 overflow-y-auto overscroll-contain break-words px-3 py-4 sm:px-6 sm:py-5", className)}
      {...props}
    />
  );
}

export function MobileDetailDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "grid w-full shrink-0 grid-cols-2 gap-2 border-t bg-background/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur",
        "sm:flex sm:justify-end sm:px-6 sm:py-3",
        "[&_button]:min-h-11 sm:[&_button]:min-h-9",
        className,
      )}
      {...props}
    />
  );
}
