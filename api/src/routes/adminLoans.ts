import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";
import {
  addLoanNote,
  cancelLoan,
  CONTACT_METHODS,
  getAdminLoanDetail,
  LOAN_FILTERS,
  listAdminLoans,
  PAYMENT_METHODS,
  recordPayment,
  rescheduleNextPayment,
  voidPayment,
  writeOffLoan,
} from "../db/loanServicing.js";
import { getAcceptedTilaDisclosure } from "../db/repayment.js";
import { getAdminAuth, requireAdminAuth } from "../middleware/requireAdmin.js";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-15");
const reason = z.string().trim().min(1, "Please give a reason").max(1000);

const listQuery = z.object({
  filter: z.enum(LOAN_FILTERS).default("all"),
  q: z.string().max(200).optional(),
});
const loanParam = z.object({ loanId: z.string().uuid() });
const paymentParam = loanParam.extend({ paymentId: z.string().uuid() });

const reasonBody = z.object({ reason });
const rescheduleBody = z.object({ nextDueDate: isoDate, reason });
const paymentBody = z.object({
  amount: z.number().positive("Amount must be more than $0").max(100000),
  receivedOn: isoDate,
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(200).optional(),
  payoff: z.boolean().default(false),
});
const noteBody = z.object({
  body: z.string().trim().min(1, "Write a note first").max(5000),
  contactMethod: z.enum(CONTACT_METHODS).nullable().optional(),
});

/** Admin loan servicing — mounted at /api/admin/loans. */
export function adminLoansRouter(): Router {
  const router = Router();
  router.use(requireAdminAuth);

  router.get("/", async (req, res, next) => {
    try {
      const { filter, q } = listQuery.parse(req.query);
      res.json(await listAdminLoans(filter, q));
    } catch (err) {
      next(err);
    }
  });

  router.get("/:loanId", async (req, res, next) => {
    try {
      const { loanId } = loanParam.parse(req.params);
      const [detail, disclosure] = await Promise.all([
        getAdminLoanDetail(loanId),
        getAcceptedTilaDisclosure(loanId),
      ]);
      res.json({ ...detail, disclosure });
    } catch (err) {
      next(err);
    }
  });

  /** Runs an action, then returns the refreshed loan detail. */
  const action =
    (fn: (req: Request, actor: string) => Promise<unknown>) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { loanId } = loanParam.parse(req.params);
        await fn(req, getAdminAuth(req).username);
        const [detail, disclosure] = await Promise.all([
          getAdminLoanDetail(loanId),
          getAcceptedTilaDisclosure(loanId),
        ]);
        res.json({ ...detail, disclosure });
      } catch (err) {
        next(err);
      }
    };

  router.post(
    "/:loanId/cancel",
    action((req, actor) =>
      cancelLoan(
        loanParam.parse(req.params).loanId,
        reasonBody.parse(req.body).reason,
        actor,
      ),
    ),
  );

  router.post(
    "/:loanId/write-off",
    action((req, actor) =>
      writeOffLoan(
        loanParam.parse(req.params).loanId,
        reasonBody.parse(req.body).reason,
        actor,
      ),
    ),
  );

  router.post(
    "/:loanId/reschedule",
    action((req, actor) => {
      const body = rescheduleBody.parse(req.body);
      return rescheduleNextPayment(
        loanParam.parse(req.params).loanId,
        body.nextDueDate,
        body.reason,
        actor,
      );
    }),
  );

  router.post(
    "/:loanId/payments",
    action((req, actor) =>
      recordPayment(
        loanParam.parse(req.params).loanId,
        paymentBody.parse(req.body),
        actor,
      ),
    ),
  );

  router.post(
    "/:loanId/payments/:paymentId/void",
    action((req, actor) => {
      const { loanId, paymentId } = paymentParam.parse(req.params);
      return voidPayment(
        loanId,
        paymentId,
        reasonBody.parse(req.body).reason,
        actor,
      );
    }),
  );

  router.post(
    "/:loanId/notes",
    action((req, actor) =>
      addLoanNote(
        loanParam.parse(req.params).loanId,
        noteBody.parse(req.body),
        actor,
      ),
    ),
  );

  return router;
}
