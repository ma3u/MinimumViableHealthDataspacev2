import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-[var(--surface-2)] rounded-lg p-8 max-w-md w-full mx-4 text-center">
        <ShieldCheck size={48} className="mx-auto mb-4 text-red-400" />
        <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-[var(--text-secondary)] mb-6">
          You do not have the required role to access this resource. Contact
          your dataspace administrator to request access.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
        >
          Return to Home
        </Link>
      </div>
    </div>
  );
}
