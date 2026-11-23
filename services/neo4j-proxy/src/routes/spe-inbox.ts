import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { type Session } from "neo4j-driver";
import { app, generalLimiter } from "../app.js";
import {
  SPE_INBOX_PUBLIC_URL,
  SPE_INBOX_STREAM_MAX_RECORDS,
  SPE_INBOX_TTL_SECONDS,
} from "../config.js";
import {
  DataplaneNotConfiguredError,
  requireDataplane,
  verifyDataplaneToken,
} from "../dataplane-token.js";
import { logger } from "../logger.js";
import {
  AlreadyImportedError,
  appendImport,
  bundleToRecords,
  ImportShapeError,
  markStreamDataset,
  TooManyRecordsError,
  writeImport,
  type ImportRequest,
} from "../spe-import.js";
import {
  appendPushEvent,
  closeInbox,
  decideAttestation,
  dropBuffer,
  eventOf,
  findInbox,
  IdentityInPushError,
  inboxState,
  inboxView,
  isPushProfile,
  isStreamProfile,
  newInboxToken,
  refuseIdentity,
  sha256Hex,
  startStream,
  STREAM_PROFILES,
  storeInbox,
  streamDigest,
  tokenMatches,
  writeFile,
  type Inbox,
  type PushEvent,
  type PushProfile,
} from "../spe-inbox.js";
import { noteSpeQueried, readWorkspace, speEntry } from "../spe-status.js";
import {
  checkTarget,
  DATASET_ID,
  notAnswering,
  SPE_IDS,
  unavailable,
} from "./spe-import.js";

// ---- A push into an SPE inbox (ADR-095) ---------------------------------------
//
// The consumer's data plane opens the inbox with a token it signs (scope
// inbox:open); the provider's data plane delivers with the inbox's own token.
// What is kept per inbox, and what a restart costs, is in spe-inbox.ts.

/** A bundle is at most what the import takes (app.ts, jsonImport). */
const DATA_LIMIT = "20mb";
/**
 * One chunk of a stream. A stream as a whole has no byte limit: each chunk
 * is written as it arrives, nothing is held (SPE_INBOX_STREAM_MAX_RECORDS
 * bounds it in records).
 */
const CHUNK_LIMIT = "8mb";
/** HttpFile-PUSH: the file is stored in the workspace's graph (ADR-095). */
const FILE_LIMIT = "16mb";

/** Agreement ids and participant DIDs: printable, no spaces, bounded. */
const PLAIN_TEXT = /^[^\s\u0000-\u001f\u007f]{1,512}$/;

const text = (v: unknown, max = 512) =>
  typeof v === "string" ? v.slice(0, max) : "";

const bearer = (req: Request) =>
  (req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

/** Flows whose inbox is being opened right now: a second open waits its turn as a 409. */
const opening = new Set<string>();

/** Inboxes being written into right now: a second delivery is a 409, not a second write. */
const delivering = new Set<string>();

/** A refusal is answered whether or not its record could be written; a failed record is logged. */
async function recordRefusal(e: PushEvent): Promise<void> {
  try {
    await appendPushEvent(e);
  } catch (err) {
    logger.error(
      { err, flowId: e.flowId, speId: e.speId },
      "push refusal not on the audit chain",
    );
  }
}

/** Refuses a delivery: the status and `{error}`, and push-refused on the chain. */
async function refuseDelivery(
  res: Response,
  inbox: Inbox,
  status: number,
  reason: string,
  extra: Partial<Pick<PushEvent, "records" | "bytes" | "sha256">> = {},
): Promise<void> {
  await recordRefusal(
    eventOf(inbox, inbox.attestation, {
      type: "push-refused",
      outcome: "refused",
      actor: "provider",
      reason,
      ...extra,
    }),
  );
  res.status(status).json({ error: reason });
}

/**
 * The inbox a delivery names, when its token is the inbox's and the inbox is
 * open; otherwise the answer is sent and null returned. An unknown inbox is
 * a 401 like a wrong token, so the routes tell nobody which flows exist.
 */
function openInboxFor(
  req: Request,
  res: Response,
  profiles?: readonly PushProfile[],
): Inbox | null {
  const speId = String(req.params.speId);
  const flowId = String(req.params.flowId);
  const token = bearer(req);
  const inbox = findInbox(flowId);
  if (
    !token ||
    !inbox ||
    inbox.speId !== speId ||
    !tokenMatches(inbox, token)
  ) {
    res.status(401).json({ error: "The inbox token is not valid" });
    return null;
  }
  const state = inboxState(inbox);
  if (state === "expired") {
    dropBuffer(inbox);
    res.status(401).json({ error: "The inbox token has expired" });
    return null;
  }
  if (state !== "open") {
    res.status(410).json({ error: `The inbox for flow ${flowId} is ${state}` });
    return null;
  }
  if (profiles && !profiles.includes(inbox.profile)) {
    res.status(409).json({
      error: `The inbox for flow ${flowId} takes ${
        inbox.profile
      }, not ${profiles.join(" or ")}`,
    });
    return null;
  }
  if (delivering.has(flowId)) {
    res
      .status(409)
      .json({ error: `A delivery into flow ${flowId} is in progress` });
    return null;
  }
  return inbox;
}

class BodyTooLargeError extends Error {}

/** The request body as the bytes that arrived, at most `limit`. */
function readRaw(req: Request, res: Response, limit: string): Promise<Buffer> {
  const parse = express.raw({ type: () => true, limit });
  return new Promise((resolve, reject) => {
    parse(req, res, (err?: unknown) => {
      if (err) {
        const e = err as { type?: string; status?: number };
        reject(
          e.type === "entity.too.large" || e.status === 413
            ? new BodyTooLargeError(`The body is larger than ${limit}`)
            : err,
        );
        return;
      }
      resolve(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
    });
  });
}

type HashCheck =
  | { ok: true; sha256: string }
  | { ok: false; status: 400 | 422; reason: string };

/** X-Content-Sha256 against the bytes that arrived: 400 without it, 422 when it differs. */
function checkHash(req: Request, raw: Buffer): HashCheck {
  const sent = (req.header("x-content-sha256") ?? "").trim().toLowerCase();
  const sha256 = sha256Hex(raw);
  if (!sent) {
    return { ok: false, status: 400, reason: "X-Content-Sha256 is required" };
  }
  if (sent !== sha256) {
    return {
      ok: false,
      status: 422,
      reason: `The body's SHA-256 is ${sha256}, not the ${sent} that was sent`,
    };
  }
  return { ok: true, sha256 };
}

function importMeta(inbox: Inbox): ImportRequest {
  return {
    datasetId: inbox.flowId,
    speId: inbox.speId,
    transferId: inbox.flowId,
    agreementId: inbox.agreementId,
    assetId: inbox.datasetId,
    provider: inbox.provider,
    consumer: inbox.consumer,
    importedBy: "mvhd-dataplane",
    pseudonymised: true,
  };
}

/**
 * Writes what a delivery carried into the workspace. The receipt goes on the
 * chain first: a push that cannot be recorded is not written (503, the inbox
 * stays open), so the workspace never holds data the chain does not know of.
 * A write that then fails is recorded as push-refused with the reason.
 */
async function writeDelivery(
  res: Response,
  next: NextFunction,
  inbox: Inbox,
  receipt: Partial<Pick<PushEvent, "records" | "bytes" | "sha256">>,
  write: (session: Session) => Promise<void>,
): Promise<boolean> {
  const driver = checkTarget(res, inbox.speId, inbox.flowId);
  if (!driver) return false;
  try {
    await appendPushEvent(
      eventOf(inbox, inbox.attestation, {
        type: "push-received",
        outcome: "success",
        actor: "provider",
        ...receipt,
      }),
    );
  } catch (err) {
    logger.error(
      { err, flowId: inbox.flowId, speId: inbox.speId },
      "push receipt not on the audit chain; nothing written",
    );
    res.status(503).json({
      error:
        "The push was not written: its receipt could not be recorded on the audit chain (ADR-045). Try again.",
    });
    return false;
  }
  const session = driver.session({ database: "neo4j" });
  try {
    await write(session);
    // A push is use: the idle stop (ADR-072) counts it as a query.
    noteSpeQueried([inbox.speId]);
    return true;
  } catch (err) {
    if (err instanceof AlreadyImportedError) {
      await refuseDelivery(res, inbox, 409, err.message, receipt);
      return false;
    }
    await recordRefusal(
      eventOf(inbox, inbox.attestation, {
        type: "push-refused",
        outcome: "refused",
        actor: "provider",
        reason: `the workspace did not take the write: ${
          (err as Error).message.split("\n")[0]
        }`,
        ...receipt,
      }),
    );
    if (notAnswering(err)) {
      unavailable(res, `${inbox.speId} does not answer; it may be starting`);
      return false;
    }
    next(err);
    return false;
  } finally {
    await session.close();
  }
}

/**
 * A FHIR bundle into the inbox's workspace (HttpData-PUSH): identity
 * refused, records counted, then written with the import's writeImport as
 * dataset `flowId`.
 */
async function deliverBundle(
  res: Response,
  next: NextFunction,
  inbox: Inbox,
  bundle: unknown,
  sha256: string,
): Promise<void> {
  let counted: { records: unknown[]; references: unknown[] };
  try {
    refuseIdentity(bundle);
    counted = bundleToRecords(inbox.flowId, bundle);
  } catch (err) {
    if (err instanceof TooManyRecordsError) {
      await refuseDelivery(res, inbox, 413, err.message, { sha256 });
      return;
    }
    if (err instanceof IdentityInPushError || err instanceof ImportShapeError) {
      await refuseDelivery(res, inbox, 422, err.message, { sha256 });
      return;
    }
    throw err;
  }
  const records = counted.records.length;
  let relationships = counted.references.length;
  const written = await writeDelivery(
    res,
    next,
    inbox,
    { records, sha256 },
    async (session) => {
      const outcome = await writeImport(session, importMeta(inbox), bundle);
      relationships = outcome.relationships;
    },
  );
  if (!written) return;
  closeInbox(inbox, "completed");
  inbox.records = records;
  inbox.sha256 = sha256;
  res.json({
    flowId: inbox.flowId,
    speId: inbox.speId,
    records,
    relationships,
    sha256,
    completed: true,
  });
}

/** Runs a delivery with the inbox marked busy, so two cannot write at once. */
function delivery(
  profiles: readonly PushProfile[] | undefined,
  handle: (
    req: Request,
    res: Response,
    next: NextFunction,
    inbox: Inbox,
  ) => Promise<void>,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const inbox = openInboxFor(req, res, profiles);
    if (!inbox) return;
    delivering.add(inbox.flowId);
    try {
      await handle(req, res, next, inbox);
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        await refuseDelivery(res, inbox, 413, err.message);
        return;
      }
      next(err);
    } finally {
      delivering.delete(inbox.flowId);
    }
  };
}

/**
 * POST /spe/:speId/inbox
 *
 * The consumer's data plane, on DPS prepare. Bearer: a data plane token,
 * scope inbox:open, flowId = body.flowId. Body {flowId, agreementId,
 * datasetId, profile, consumer, provider}. 201 {flowId, speId, profile,
 * endpoint, token, expiresAt, attestation}; 409 with the attestation when the
 * workspace's latest attestation did not pass.
 */
app.post(
  "/spe/:speId/inbox",
  // named here as well as in app.ts: a route that checks a token says its limit
  generalLimiter,
  requireDataplane,
  async (req: Request, res: Response, next: NextFunction) => {
    const token = bearer(req);
    if (!token) {
      res.status(401).json({ error: "A data plane token is required" });
      return;
    }
    let claims;
    try {
      claims = await verifyDataplaneToken(token, "inbox:open");
    } catch (err) {
      if (err instanceof DataplaneNotConfiguredError) {
        res.status(503).json({ error: err.message });
        return;
      }
      logger.warn({ err: (err as Error).message }, "data plane token refused");
      res.status(401).json({ error: "The data plane token is not valid" });
      return;
    }

    const speId = String(req.params.speId);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const flowId = text(body.flowId, 256);
    const datasetId = text(body.datasetId, 256);
    const agreementId = text(body.agreementId);
    const consumer = text(body.consumer);
    const provider = text(body.provider);
    const profile = body.profile;
    if (!SPE_IDS.has(speId)) {
      res
        .status(400)
        .json({ error: `Unknown SPE '${speId}' (SPE-1 or SPE-2)` });
      return;
    }
    if (!DATASET_ID.test(flowId) || !DATASET_ID.test(datasetId)) {
      res
        .status(400)
        .json({ error: "A plain flowId and datasetId are required" });
      return;
    }
    if (
      !PLAIN_TEXT.test(agreementId) ||
      !PLAIN_TEXT.test(consumer) ||
      !PLAIN_TEXT.test(provider)
    ) {
      res
        .status(400)
        .json({ error: "agreementId, consumer and provider are required" });
      return;
    }
    if (!isPushProfile(profile)) {
      res.status(400).json({
        error:
          "profile must be HttpData-PUSH, HttpStream-PUSH or HttpFile-PUSH",
      });
      return;
    }
    if (claims.flowId !== flowId) {
      res
        .status(401)
        .json({ error: "The data plane token is for another flow" });
      return;
    }
    const driver = checkTarget(res, speId, flowId);
    if (!driver) return;

    // A flow has one inbox. One that is open, or that delivered, is not
    // replaced: the second would hide the first one's read-back.
    const held = findInbox(flowId);
    const heldState = held ? inboxState(held) : null;
    if (
      opening.has(flowId) ||
      heldState === "open" ||
      heldState === "completed"
    ) {
      res.status(409).json({
        error: `Flow ${flowId} has an inbox already (${
          heldState ?? "opening"
        })`,
      });
      return;
    }
    opening.add(flowId);
    try {
      let read;
      try {
        read = await readWorkspace(driver);
      } catch (err) {
        if (notAnswering(err)) {
          unavailable(res, `${speId} does not answer; it may be starting`);
          return;
        }
        throw err;
      }
      const decision = decideAttestation(
        speEntry(speId as "SPE-1" | "SPE-2", read, ""),
      );
      const parties = {
        flowId,
        agreementId,
        datasetId,
        consumer,
        provider,
        speId,
        profile,
      };
      if (!decision.open) {
        await recordRefusal(
          eventOf(parties, decision.attestation, {
            type: "push-refused",
            outcome: "refused",
            actor: "consumer",
            reason: decision.reason,
          }),
        );
        res
          .status(409)
          .json({ error: decision.reason, attestation: decision.attestation });
        return;
      }

      const now = new Date();
      const issued = newInboxToken();
      const inbox: Inbox = {
        ...parties,
        tokenHash: issued.tokenHash,
        openedAt: now.toISOString(),
        expiresAt: new Date(
          now.getTime() + SPE_INBOX_TTL_SECONDS * 1000,
        ).toISOString(),
        state: "open",
        attestation: decision.attestation,
        ...(isStreamProfile(profile) ? { stream: startStream() } : {}),
      };
      // No inbox without its record (ADR-045): fail closed.
      try {
        await appendPushEvent(
          eventOf(inbox, inbox.attestation, {
            type: "push-inbox-opened",
            outcome: "success",
            actor: "consumer",
          }),
        );
      } catch (err) {
        logger.error(
          { err, flowId, speId },
          "push inbox not opened: audit write failed",
        );
        res.status(503).json({
          error:
            "The inbox was not opened: its audit record could not be written (ADR-045). Try again.",
        });
        return;
      }
      storeInbox(inbox, now);
      res.status(201).json({
        flowId,
        speId,
        profile,
        endpoint: `${SPE_INBOX_PUBLIC_URL}/spe/${encodeURIComponent(
          speId,
        )}/inbox/${encodeURIComponent(flowId)}`,
        token: issued.token,
        expiresAt: inbox.expiresAt,
        attestation: inbox.attestation,
      });
    } catch (err) {
      next(err);
    } finally {
      opening.delete(flowId);
    }
  },
);

/**
 * POST /spe/:speId/inbox/:flowId/bundle (HttpData-PUSH)
 *
 * The provider's data plane: one FHIR Bundle, X-Content-Sha256 over the
 * bytes. 200 {flowId, speId, records, relationships, sha256, completed}.
 */
app.post(
  "/spe/:speId/inbox/:flowId/bundle",
  delivery(["HttpData-PUSH"], async (req, res, next, inbox) => {
    const raw = await readRaw(req, res, DATA_LIMIT);
    const hash = checkHash(req, raw);
    if (!hash.ok) {
      await refuseDelivery(res, inbox, hash.status, hash.reason);
      return;
    }
    let bundle: unknown;
    try {
      bundle = JSON.parse(raw.toString("utf8"));
    } catch {
      await refuseDelivery(res, inbox, 422, "The body is not JSON", {
        sha256: hash.sha256,
      });
      return;
    }
    await deliverBundle(res, next, inbox, bundle, hash.sha256);
  }),
);

/** A stream that delivered nothing for a TTL is over; each chunk gives it another. */
function extendExpiry(inbox: Inbox): void {
  inbox.expiresAt = new Date(
    Date.now() + SPE_INBOX_TTL_SECONDS * 1000,
  ).toISOString();
}

/**
 * POST /spe/:speId/inbox/:flowId/chunks/:seq (HttpStream-PUSH, Kafka-PUSH,
 * Kafka-PULL)
 *
 * One NDJSON chunk, one FHIR resource per line, at most 8 MiB; seq from 0,
 * each the next. Written into the dataset `flowId` at once, merged with what
 * earlier chunks wrote; the dataset stays `complete: false` until complete.
 * 202 {flowId, seq, records}.
 */
app.post(
  "/spe/:speId/inbox/:flowId/chunks/:seq",
  delivery(STREAM_PROFILES, async (req, res, next, inbox) => {
    const stream = inbox.stream ?? (inbox.stream = startStream());
    const seq = Number(req.params.seq);
    if (!Number.isInteger(seq) || seq !== stream.nextSeq) {
      res.status(409).json({
        error: `Chunk ${String(req.params.seq)} is out of order; the next is ${
          stream.nextSeq
        }`,
      });
      return;
    }
    const raw = await readRaw(req, res, CHUNK_LIMIT);
    const hash = checkHash(req, raw);
    if (!hash.ok) {
      await refuseDelivery(res, inbox, hash.status, hash.reason);
      return;
    }
    const resources: Array<Record<string, unknown>> = [];
    for (const line of raw.toString("utf8").split("\n")) {
      if (!line.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        parsed = null;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        await refuseDelivery(
          res,
          inbox,
          422,
          `Chunk ${seq} holds a line that is not one FHIR resource`,
          { sha256: hash.sha256 },
        );
        return;
      }
      resources.push(parsed as Record<string, unknown>);
    }
    try {
      refuseIdentity(resources);
    } catch (err) {
      if (!(err instanceof IdentityInPushError)) throw err;
      await refuseDelivery(res, inbox, 422, err.message, {
        sha256: hash.sha256,
      });
      return;
    }
    if (stream.received + resources.length > SPE_INBOX_STREAM_MAX_RECORDS) {
      await refuseDelivery(
        res,
        inbox,
        413,
        `The stream would hold more than ${SPE_INBOX_STREAM_MAX_RECORDS} records (SPE_INBOX_STREAM_MAX_RECORDS)`,
      );
      return;
    }
    let chunk: ReturnType<typeof bundleToRecords>;
    try {
      chunk = bundleToRecords(
        inbox.flowId,
        {
          resourceType: "Bundle",
          type: "collection",
          entry: resources.map((resource) => ({ resource })),
        },
        stream.written,
      );
    } catch (err) {
      if (!(err instanceof ImportShapeError)) throw err;
      await refuseDelivery(
        res,
        inbox,
        err instanceof TooManyRecordsError ? 413 : 422,
        err.message,
        { sha256: hash.sha256 },
      );
      return;
    }
    const prefix = `${inbox.flowId}/`;
    const local = chunk.records.map((r) => r.recordKey.slice(prefix.length));
    const added = local.filter((k) => !stream.written.has(k)).length;

    const driver = checkTarget(res, inbox.speId, inbox.flowId);
    if (!driver) return;
    // The workspace never holds data the chain does not know of (ADR-045):
    // before the first chunk is written the stream goes on the chain, and
    // without that record nothing is written (503, the chunk may come
    // again). push-received follows at completion.
    if (!stream.startRecorded) {
      try {
        await appendPushEvent(
          eventOf(inbox, inbox.attestation, {
            type: "push-stream-started",
            outcome: "success",
            actor: "provider",
          }),
        );
        stream.startRecorded = true;
      } catch (err) {
        logger.error(
          { err, flowId: inbox.flowId, speId: inbox.speId },
          "stream start not on the audit chain; nothing written",
        );
        res.status(503).json({
          error:
            "The chunk was not written: the stream's start could not be recorded on the audit chain (ADR-045). Try again.",
        });
        return;
      }
    }
    const session = driver.session({ database: "neo4j" });
    try {
      await appendImport(session, importMeta(inbox), chunk, {
        first: seq === 0,
        added,
      });
    } catch (err) {
      if (err instanceof AlreadyImportedError) {
        await refuseDelivery(res, inbox, 409, err.message, {
          sha256: hash.sha256,
        });
        return;
      }
      // Nothing of this chunk was written (one transaction) and the
      // sequence did not move: the provider may send the same chunk again.
      if (notAnswering(err)) {
        unavailable(res, `${inbox.speId} does not answer; it may be starting`);
        return;
      }
      next(err);
      return;
    } finally {
      await session.close();
    }
    noteSpeQueried([inbox.speId]);
    stream.hash.update(raw);
    stream.bytes += raw.byteLength;
    stream.received += resources.length;
    for (const k of local) stream.written.add(k);
    stream.relationships += chunk.references.length;
    stream.nextSeq += 1;
    inbox.records = stream.written.size;
    extendExpiry(inbox);
    res.status(202).json({
      flowId: inbox.flowId,
      seq,
      records: resources.length,
    });
  }),
);

/**
 * POST /spe/:speId/inbox/:flowId/complete (HttpStream-PUSH, Kafka-PUSH,
 * Kafka-PULL)
 *
 * Body {chunks, records, sha256}, the hash over every chunk body in order.
 * On a match the dataset is marked `complete: true`, push-received goes on
 * the chain, and the inbox closes. On a mismatch the dataset is marked
 * `complete: false, refused: true` with the reason; what arrived stays in the
 * workspace, and the inbox closes refused.
 */
app.post(
  "/spe/:speId/inbox/:flowId/complete",
  delivery(STREAM_PROFILES, async (req, res, next, inbox) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const stream = inbox.stream ?? (inbox.stream = startStream());
    const sha256 = streamDigest(stream);
    const sent = text(body.sha256, 128).toLowerCase();
    const records = stream.written.size;
    const mismatch =
      body.chunks !== stream.nextSeq || body.records !== stream.received
        ? `The stream holds ${stream.nextSeq} chunks and ${
            stream.received
          } records, not the ${String(body.chunks)} and ${String(
            body.records,
          )} that were sent`
        : sent !== sha256
          ? `The stream's SHA-256 is ${sha256}, not the ${
              sent || "(none)"
            } that was sent`
          : null;
    const driver = checkTarget(res, inbox.speId, inbox.flowId);
    if (!driver) return;

    if (mismatch) {
      const kept =
        stream.nextSeq > 0
          ? `; the ${records} records that arrived stay in ${inbox.speId}, marked refused`
          : "";
      const reason = `${mismatch}${kept}`;
      if (stream.nextSeq > 0) {
        const session = driver.session({ database: "neo4j" });
        try {
          await markStreamDataset(session, importMeta(inbox), {
            complete: false,
            refused: true,
            reason: mismatch,
          });
        } catch (err) {
          logger.error(
            { err, flowId: inbox.flowId, speId: inbox.speId },
            "refused stream not marked on its dataset",
          );
        } finally {
          await session.close();
        }
      }
      closeInbox(inbox, "refused");
      inbox.reason = reason;
      inbox.records = records;
      inbox.sha256 = sha256;
      await refuseDelivery(res, inbox, 422, reason, { records, sha256 });
      return;
    }

    // The receipt first, as for a bundle: a stream whose completion cannot
    // be recorded is not marked complete (503, the inbox stays open).
    try {
      await appendPushEvent(
        eventOf(inbox, inbox.attestation, {
          type: "push-received",
          outcome: "success",
          actor: "provider",
          records,
          sha256,
        }),
      );
    } catch (err) {
      logger.error(
        { err, flowId: inbox.flowId, speId: inbox.speId },
        "stream receipt not on the audit chain; not marked complete",
      );
      res.status(503).json({
        error:
          "The stream was not completed: its receipt could not be recorded on the audit chain (ADR-045). Try again.",
      });
      return;
    }
    const session = driver.session({ database: "neo4j" });
    try {
      await markStreamDataset(session, importMeta(inbox), {
        complete: true,
        refused: false,
        reason: null,
      });
    } catch (err) {
      await recordRefusal(
        eventOf(inbox, inbox.attestation, {
          type: "push-refused",
          outcome: "refused",
          actor: "provider",
          reason: `the workspace did not take the completion: ${
            (err as Error).message.split("\n")[0]
          }`,
          records,
          sha256,
        }),
      );
      if (notAnswering(err)) {
        unavailable(res, `${inbox.speId} does not answer; it may be starting`);
        return;
      }
      next(err);
      return;
    } finally {
      await session.close();
    }
    const relationships = stream.relationships;
    closeInbox(inbox, "completed");
    inbox.records = records;
    inbox.sha256 = sha256;
    res.json({
      flowId: inbox.flowId,
      speId: inbox.speId,
      records,
      relationships,
      sha256,
      completed: true,
    });
  }),
);

/**
 * PUT /spe/:speId/inbox/:flowId/file (HttpFile-PUSH)
 *
 * Raw bytes, any Content-Type, optional X-File-Name, at most 16 MiB.
 * Stored as (:ImportedDataset {datasetId: flowId})-[:CONTAINS]->(:ImportedFile).
 * 200 {flowId, speId, bytes, sha256, completed}.
 */
app.put(
  "/spe/:speId/inbox/:flowId/file",
  delivery(["HttpFile-PUSH"], async (req, res, next, inbox) => {
    const raw = await readRaw(req, res, FILE_LIMIT);
    const hash = checkHash(req, raw);
    if (!hash.ok) {
      await refuseDelivery(res, inbox, hash.status, hash.reason, {
        bytes: raw.byteLength,
      });
      return;
    }
    const file = {
      sha256: hash.sha256,
      bytes: raw.byteLength,
      mediaType:
        text(req.header("content-type"), 256) || "application/octet-stream",
      // A name to show, never a path: separators and control characters go.
      name:
        text(req.header("x-file-name"), 256).replace(
          /[/\\\u0000-\u001f\u007f]/g,
          "_",
        ) || inbox.flowId,
      content: raw.toString("base64"),
    };
    const written = await writeDelivery(
      res,
      next,
      inbox,
      { bytes: file.bytes, sha256: file.sha256 },
      async (session) => {
        await writeFile(session, importMeta(inbox), file);
      },
    );
    if (!written) return;
    closeInbox(inbox, "completed");
    inbox.bytes = file.bytes;
    inbox.sha256 = file.sha256;
    res.json({
      flowId: inbox.flowId,
      speId: inbox.speId,
      bytes: file.bytes,
      sha256: file.sha256,
      completed: true,
    });
  }),
);

/**
 * POST /spe/:speId/inbox/:flowId/refuse
 *
 * The provider's data plane will not deliver (for example the attestation
 * is below its floor). Body {reason}. Closes the inbox. 200 {flowId, refused}.
 */
app.post(
  "/spe/:speId/inbox/:flowId/refuse",
  delivery(undefined, async (req, res, _next, inbox) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const reason = text(body.reason, 1024) || "the provider gave no reason";
    closeInbox(inbox, "refused");
    inbox.reason = reason;
    await recordRefusal(
      eventOf(inbox, inbox.attestation, {
        type: "push-refused",
        outcome: "refused",
        actor: "provider",
        reason,
      }),
    );
    res.json({ flowId: inbox.flowId, refused: true });
  }),
);

/**
 * POST /spe/:speId/inbox/:flowId/started
 *
 * The consumer's data plane, when its control plane says the transfer has
 * started. Bearer: a data plane token, scope inbox:open, for this flow.
 * 200 {flowId, consumerStarted}. The provider reads it at .../ready.
 */
app.post(
  "/spe/:speId/inbox/:flowId/started",
  // named here as well as in app.ts: a route that checks a token says its limit
  generalLimiter,
  requireDataplane,
  async (req: Request, res: Response) => {
    const token = bearer(req);
    const flowId = String(req.params.flowId);
    let claims;
    try {
      if (!token) throw new Error("no token");
      claims = await verifyDataplaneToken(token, "inbox:open");
    } catch (err) {
      if (err instanceof DataplaneNotConfiguredError) {
        res.status(503).json({ error: err.message });
        return;
      }
      res.status(401).json({ error: "The data plane token is not valid" });
      return;
    }
    const inbox = findInbox(flowId);
    if (
      claims.flowId !== flowId ||
      !inbox ||
      inbox.speId !== String(req.params.speId)
    ) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    inbox.consumerStartedAt ??= new Date().toISOString();
    res.json({ flowId, consumerStarted: true });
  },
);

/**
 * GET /spe/:speId/inbox/:flowId/ready
 *
 * The provider's data plane, before it delivers. Bearer: the inbox token.
 * 200 {flowId, consumerStarted}.
 */
app.get(
  "/spe/:speId/inbox/:flowId/ready",
  delivery(undefined, async (_req, res, _next, inbox) => {
    res.json({
      flowId: inbox.flowId,
      consumerStarted: inbox.consumerStartedAt !== undefined,
    });
  }),
);

/**
 * GET /spe/:speId/inbox/:flowId
 *
 * An inbox as the checks and the UI read it back, called by the hub as the
 * other /spe routes are: {flowId, speId, profile, state, records?, bytes?,
 * sha256?, attestation, openedAt, closedAt?}. Never the token.
 */
app.get("/spe/:speId/inbox/:flowId", (req: Request, res: Response) => {
  const inbox = findInbox(String(req.params.flowId));
  if (!inbox || inbox.speId !== String(req.params.speId)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (inboxState(inbox) === "expired") dropBuffer(inbox);
  res.json(inboxView(inbox));
});
