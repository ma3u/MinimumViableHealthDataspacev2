import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { T } from "@/lib/i18n/translate";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-(--surface-2) rounded-lg p-8 max-w-md w-full mx-4 text-center">
        <ShieldCheck size={48} className="mx-auto mb-4 text-red-400" />
        <h1 className="text-2xl font-bold text-white mb-2">
          <T area="admin">{"Access Denied"}</T>
        </h1>
        <p className="text-(--text-secondary) mb-6">
          <T area="admin">
            {
              "You do not have the required role to access this resource. Contact your dataspace administrator to request access."
            }
          </T>
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
        >
          <T area="admin">{"Return to Home"}</T>
        </Link>
      </div>
    </div>
  );
}
