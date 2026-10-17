import type { RepaymentOption } from "../lib/api";
import { formatPct, formatUsdCents } from "../lib/format";
import "./TruthInLending.css";

export default function RepaymentPlanPicker({
  options,
  selectedTerm,
  onSelect,
}: {
  options: RepaymentOption[];
  selectedTerm: number | null;
  onSelect: (termMonths: number) => void;
}) {
  return (
    <fieldset className="plan-options">
      <legend className="sr-only">Choose a repayment plan</legend>
      {options.map((o) => {
        const selected = selectedTerm === o.termMonths;
        return (
          <label
            key={o.termMonths}
            className={`plan-option ${selected ? "plan-option--selected" : ""}`}
          >
            <input
              type="radio"
              name="repayment-plan"
              value={o.termMonths}
              checked={selected}
              onChange={() => onSelect(o.termMonths)}
            />
            <p className="plan-option-term">{o.termMonths} months</p>
            <p className="plan-option-payment">
              {formatUsdCents(o.monthlyPayment)} <small>/ month</small>
            </p>
            <dl className="plan-option-facts">
              <div>
                <dt>Interest rate</dt>
                <dd>{o.interestRatePct}%</dd>
              </div>
              <div>
                <dt>APR (incl. fee)</dt>
                <dd>{formatPct(o.apr)}</dd>
              </div>
              <div>
                <dt>Total cost of credit</dt>
                <dd>{formatUsdCents(o.financeCharge)}</dd>
              </div>
              <div>
                <dt>Total of monthly payments</dt>
                <dd>{formatUsdCents(o.totalOfPayments)}</dd>
              </div>
              {o.finalPayment !== o.monthlyPayment ? (
                <div>
                  <dt>Final payment</dt>
                  <dd>{formatUsdCents(o.finalPayment)}</dd>
                </div>
              ) : null}
            </dl>
          </label>
        );
      })}
    </fieldset>
  );
}
