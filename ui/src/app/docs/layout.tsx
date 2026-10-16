import type { ReactNode } from "react";
import { DocsTocInline, DocsTocSidebar } from "@/components/docs/DocsToc";

/** Every documentation page gets an index of its headings: a sticky column at
 *  the right on wide screens, a disclosure at the top on narrow ones. Pages
 *  keep their own width and centring inside the first column. */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_16rem] max-w-[90rem] mx-auto">
      <div className="min-w-0">
        <DocsTocInline />
        {children}
      </div>
      <DocsTocSidebar />
    </div>
  );
}
