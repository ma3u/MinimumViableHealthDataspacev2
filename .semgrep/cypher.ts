// Fixture for `semgrep --test .semgrep/`; not part of any build.
declare const req: any, session: any, request: any;
declare function runQuery<T>(q: string, p?: object): Promise<T[]>;

async function bad() {
  const id = req.query.id;
  // ruleid: cypher-built-from-request-input
  await session.run(`MATCH (p:Patient {id: '${id}'}) RETURN p`);
  const name = new URL(request.url).searchParams.get("name");
  // ruleid: cypher-built-from-request-input
  await runQuery<{ n: string }>(
    "MATCH (n) WHERE n.name = '" + name + "' RETURN n",
  );
}

async function good() {
  const id = req.query.id;
  // ok: cypher-built-from-request-input
  await session.run("MATCH (p:Patient {id: $id}) RETURN p", { id });
  const FIELDS = "p.id AS id";
  // ok: cypher-built-from-request-input
  await runQuery(`MATCH (p) RETURN ${FIELDS}`);
  const limit = Number(req.query.limit);
  // ok: cypher-built-from-request-input
  await session.run(`MATCH (p) RETURN p LIMIT ${limit}`);
}

async function goodGeneric() {
  const id = req.query.id;
  // ok: cypher-built-from-request-input
  await runQuery<{ n: string }>(`MATCH (n {id: $id}) RETURN n`, { id });
  // ruleid: cypher-built-from-request-input
  await runQuery<{ n: string }>(`MATCH (n {id: '${id}'}) RETURN n`, {});
}
