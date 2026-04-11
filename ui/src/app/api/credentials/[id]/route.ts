import { NextRequest, NextResponse } from "next/server";
import { runQuery } from "@/lib/neo4j";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/credentials/[id] — Remove a Verifiable Credential from Neo4j.
 *
 * Deletes the VerifiableCredential node and all its relationships.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Credential ID is required" },
      { status: 400 },
    );
  }

  const result = await runQuery<{ deleted: number }>(
    `MATCH (vc:VerifiableCredential { credentialId: $id })
     DETACH DELETE vc
     RETURN count(vc) AS deleted`,
    { id },
  );

  const deleted = result[0]?.deleted ?? 0;

  if (deleted === 0) {
    return NextResponse.json(
      { error: "Credential not found", id },
      { status: 404 },
    );
  }

  return NextResponse.json({ status: "deleted", id });
}
