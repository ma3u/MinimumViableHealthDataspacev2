import { type Request, type Response, type NextFunction } from "express";
import { getSession } from "../db.js";
import { app } from "../app.js";
import { auditContext, logTransferEvent } from "../audit.js";
import type { DataspaceGrant } from "../dataspace-token.js";
import {
  COLLECT_ANSWERS_CYPHER,
  PROGRAMME_ANSWER_DATASET,
  PROGRAMME_PUBLISHERS_CYPHER,
  publishedBy,
  toAnswer,
} from "../programme-answers.js";

// ---- A bonus program's answers (#934 step 8, ADR-091) ----------------------

/**
 * GET /programmes/answers
 *
 * What the insurer that published a bonus program collects over its agreement
 * with the hub: per member who joined and asked the hub to send it, the
 * program, the year, goal met yes or no and the member's reference (ADR-080,
 * decision 2). No name, no insurance number, no value behind the answer.
 *
 * It answers a pull only (routes/dataspace.ts): the connector has agreed the
 * bonus policy with the consumer and admitted its attested purpose (ADR-090),
 * and siglet's token names the consumer. A call that did not come through
 * /dataspace/data with a token for this asset is refused, whoever sends it.
 * The consumer receives the answers of the programs it published and no
 * other insurer's.
 */
app.get(
  "/programmes/answers",
  async (req: Request, res: Response, next: NextFunction) => {
    const grant = res.locals.dataspaceGrant as DataspaceGrant | undefined;
    if (!grant || grant.datasetId !== PROGRAMME_ANSWER_DATASET) {
      res.status(403).json({
        error:
          "A bonus program's answers are read over a dataspace transfer of the bonus agreement only",
      });
      return;
    }
    const session = getSession();
    try {
      const programmes = await session.run(PROGRAMME_PUBLISHERS_CYPHER);
      const programmeIds = programmes.records
        .filter((r) =>
          publishedBy(
            grant.consumer,
            grant.provider,
            r.get("publisherDid") as string | null,
          ),
        )
        .map((r) => String(r.get("programmeId")));
      const collected = programmeIds.length
        ? await session.run(COLLECT_ANSWERS_CYPHER, {
            programmeIds,
            consumer: grant.consumer,
          })
        : { records: [] };
      const answers = collected.records.map(toAnswer);

      res.json({ recipient: grant.consumer, answers });
      logTransferEvent(
        "/programmes/answers",
        "GET",
        grant.consumer,
        200,
        answers.length,
        {
          ...auditContext(req, res),
          datasetId: PROGRAMME_ANSWER_DATASET,
          contractId: grant.agreementId,
          purpose: "bonus-payout",
        },
      );
    } catch (err) {
      next(err);
    } finally {
      await session.close();
    }
  },
);
