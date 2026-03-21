import { ReactNode, useEffect } from "react";

import { cn } from "../../lib/utils";

type Props = {
  children: ReactNode;
  contentClassName?: string;
  open: boolean;
};

export default function ModalShell({ children, contentClassName, open }: Props) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-[rgba(29,23,19,0.5)] p-4 backdrop-blur-sm"
      role="dialog"
    >
      <div className="flex min-h-full items-start justify-center py-4 md:py-8">
        <div className={cn("w-full", contentClassName)}>{children}</div>
      </div>
    </div>
  );
}
