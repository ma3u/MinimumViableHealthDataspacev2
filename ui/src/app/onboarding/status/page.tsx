"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function Redirector() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId");

  useEffect(() => {
    // Status is now shown inline on the onboarding page.
    // Redirect there, preserving tenantId for scroll/expand context.
    router.replace("/onboarding" + (tenantId ? "?tenantId=" + tenantId : ""));
  }, [router, tenantId]);

  return null;
}

export default function OnboardingStatusRedirect() {
  return (
    <Suspense fallback={null}>
      <Redirector />
    </Suspense>
  );
}
