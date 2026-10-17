import assert from "node:assert/strict";
import { computeRepaymentPlan } from "../src/lending/terms.ts";
import {
  allocatePayments,
  servicingStatus,
  payoffQuote,
  toCents,
  addDays,
} from "../src/lending/servicing.ts";

const plan = computeRepaymentPlan(1800, 12, new Date("2026-10-03T12:00:00Z"));
const inst = plan.schedule.map((p) => ({
  id: "i" + p.number,
  number: p.number,
  dueDate: p.dueDate,
  amountDueCents: toCents(p.amount),
  principalCents: toCents(p.principal),
  interestCents: toCents(p.interest),
  status: "scheduled" as const,
}));
const pay = (
  id: string,
  dollars: number,
  on: string,
  kind: "regular" | "payoff" = "regular",
) => ({
  id,
  amountCents: toCents(dollars),
  receivedOn: on,
  kind,
  createdAt: on,
});

// nothing paid, 10 days before first due
let a = allocatePayments(inst, []);
let st = servicingStatus(a.installments, "2026-10-23");
assert.equal(st.nextDue!.dueDate, "2026-11-02");
assert.equal(st.overdue, null);
// payoff right at funding = principal only
assert.equal(
  payoffQuote(a.installments, "2026-10-03", "2026-10-03").totalCents,
  180000,
);
// halfway through period 1 ≈ half the first month's interest
const q = payoffQuote(a.installments, "2026-10-03", "2026-10-18");
console.log("payoff mid-period:", q);
assert.ok(q.interestCents > 1300 && q.interestCents < 1500);

// overdue: today after first due, nothing paid
st = servicingStatus(a.installments, "2026-11-12");
assert.equal(st.overdue!.daysOverdue, 10);
assert.equal(st.overdue!.amountCents, 16588);

// partial then rest
a = allocatePayments(inst, [
  pay("p1", 100, "2026-11-01"),
  pay("p2", 65.88, "2026-11-02"),
]);
assert.equal(a.installments[0].status, "paid");
assert.equal(a.installments[1].status, "scheduled");
a = allocatePayments(inst, [pay("p1", 100, "2026-11-01")]);
assert.equal(a.installments[0].status, "partial");
assert.equal(a.installments[0].amountPaidCents, 10000);
// payment spanning two installments
a = allocatePayments(inst, [pay("p1", 200, "2026-11-01")]);
assert.equal(a.installments[0].status, "paid");
assert.equal(a.installments[1].amountPaidCents, 20000 - 16588);

// all paid as scheduled -> settled
a = allocatePayments(
  inst,
  plan.schedule.map((p) => pay("p" + p.number, p.amount, p.dueDate)),
);
assert.ok(a.settled);
assert.equal(a.settledOn, plan.schedule.at(-1)!.dueDate);
assert.equal(a.unappliedCents, 0);
assert.equal(a.totalPaidCents, toCents(plan.totalOfPayments));

// pay 3 then payoff on day after 3rd due
const three = plan.schedule
  .slice(0, 3)
  .map((p) => pay("p" + p.number, p.amount, p.dueDate));
a = allocatePayments(inst, three);
const asOf = addDays(plan.schedule[2].dueDate, 1);
const po = payoffQuote(a.installments, "2026-10-03", asOf);
const remPrincipal = toCents(plan.schedule[2].balanceAfter);
assert.equal(po.principalCents, remPrincipal);
console.log("payoff after 3 payments:", po, "balance after #3", remPrincipal);
a = allocatePayments(inst, [
  ...three,
  { ...pay("po", po.totalCents / 100, asOf, "payoff") },
]);
assert.ok(a.settled);
assert.ok(a.installments.slice(3).every((i) => i.status === "closed_early"));
assert.ok(a.totalPaidCents < toCents(plan.totalOfPayments));

// overdue interest owed fully in payoff: nothing paid, 40 days after first due
a = allocatePayments(inst, []);
const po2 = payoffQuote(a.installments, "2026-10-03", "2026-12-12");
assert.equal(po2.principalCents, 180000);
assert.ok(
  po2.interestCents >
    toCents(plan.schedule[0].interest) + toCents(plan.schedule[1].interest),
);
console.log("all servicing tests passed");
