import type { TilaDisclosure } from "../lib/api";
import {
  formatCalendarDate,
  formatPct,
  formatShortDate,
  formatTimestamp,
  formatUsdCents,
} from "../lib/format";
import "./TruthInLending.css";

/**
 * Truth in Lending (Regulation Z) closed-end credit disclosure.
 * Renders exactly what the API built — the same JSON is stored when the borrower accepts.
 */
export default function TruthInLendingDisclosure({
  disclosure,
}: {
  disclosure: TilaDisclosure;
}) {
  const d = disclosure;

  return (
    <section className="tila" aria-labelledby="tila-title">
      <header className="tila-header">
        <h2 id="tila-title" className="tila-title">
          Truth in Lending Disclosure Statement
        </h2>
        <p className="tila-subtitle">Federal Truth in Lending Act — closed-end consumer loan</p>
      </header>

      <dl className="tila-parties">
        <div>
          <dt>Creditor (lender)</dt>
          <dd>
            {d.creditor.name}
            {d.creditor.address ? <span className="tila-muted">{d.creditor.address}</span> : null}
          </dd>
        </div>
        <div>
          <dt>Borrower</dt>
          <dd>
            {d.borrower.name}
            {d.borrower.address ? <span className="tila-muted">{d.borrower.address}</span> : null}
          </dd>
        </div>
        <div>
          <dt>Loan purpose</dt>
          <dd>
            Veterinary care at {d.clinic.name}
            {d.clinic.location ? <span className="tila-muted">{d.clinic.location}</span> : null}
          </dd>
        </div>
        <div>
          <dt>Application</dt>
          <dd>
            <code className="tila-code">{d.applicationId.slice(0, 8)}</code>
            <span className="tila-muted">Disclosure date: {formatShortDate(d.generatedAt)}</span>
          </dd>
        </div>
      </dl>

      <div className="tila-box" role="group" aria-label="Key loan terms">
        <div className="tila-box-cell">
          <p className="tila-box-label">Annual Percentage Rate</p>
          <p className="tila-box-desc">The cost of your credit as a yearly rate.</p>
          <p className="tila-box-value">{formatPct(d.apr)}</p>
        </div>
        <div className="tila-box-cell">
          <p className="tila-box-label">Finance Charge</p>
          <p className="tila-box-desc">The dollar amount the credit will cost you.</p>
          <p className="tila-box-value">{formatUsdCents(d.financeCharge)}</p>
        </div>
        <div className="tila-box-cell">
          <p className="tila-box-label">Amount Financed</p>
          <p className="tila-box-desc">The amount of credit provided to you or on your behalf.</p>
          <p className="tila-box-value">{formatUsdCents(d.amountFinanced)}</p>
        </div>
        <div className="tila-box-cell">
          <p className="tila-box-label">Total of Payments</p>
          <p className="tila-box-desc">
            The amount you will have paid after you have made all payments as scheduled.
          </p>
          <p className="tila-box-value">{formatUsdCents(d.totalOfPayments)}</p>
        </div>
      </div>

      <h3 className="tila-heading">Your payment schedule</h3>
      <table className="tila-table">
        <thead>
          <tr>
            <th scope="col">Number of payments</th>
            <th scope="col">Amount of payments</th>
            <th scope="col">When payments are due</th>
          </tr>
        </thead>
        <tbody>
          {d.paymentSchedule.map((line, i) => (
            <tr key={i}>
              <td>{line.count}</td>
              <td>{formatUsdCents(line.amount)}</td>
              <td>{line.when}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="tila-terms">
        <div>
          <dt>Security</dt>
          <dd>{d.security}</dd>
        </div>
        <div>
          <dt>Late charge</dt>
          <dd>{d.lateCharge}</dd>
        </div>
        <div>
          <dt>Prepayment</dt>
          <dd>{d.prepayment}</dd>
        </div>
      </dl>
      <p className="tila-small">{d.additionalTerms}</p>
      {d.isEstimate ? (
        <p className="tila-small">
          Payment dates are estimates assuming your loan is funded on{" "}
          {formatCalendarDate(d.assumedFundingDate)}. Your first payment is due 30 days after the
          loan is actually funded, and monthly after that.
        </p>
      ) : null}

      <h3 className="tila-heading">Itemization of the Amount Financed</h3>
      <table className="tila-table tila-table--compact">
        <tbody>
          <tr>
            <td>Amount paid to {d.clinic.name} on your behalf (your loan amount)</td>
            <td>{formatUsdCents(d.itemization.paidToClinicOnYourBehalf)}</td>
          </tr>
          <tr>
            <td>Amount given to you directly</td>
            <td>{formatUsdCents(d.itemization.paidToYouDirectly)}</td>
          </tr>
          <tr>
            <td>
              Less: prepaid finance charge (origination fee, paid by you before the loan is
              funded)
            </td>
            <td>−{formatUsdCents(d.itemization.prepaidFinanceCharge)}</td>
          </tr>
          <tr className="tila-total">
            <td>Amount Financed</td>
            <td>{formatUsdCents(d.amountFinanced)}</td>
          </tr>
        </tbody>
      </table>
      <dl className="tila-terms">
        <div>
          <dt>Interest rate</dt>
          <dd>
            {d.interestRatePct}% per year on your {formatUsdCents(d.loanAmount)} loan amount,
            charged monthly on the unpaid balance.
          </dd>
        </div>
        <div>
          <dt>Origination fee</dt>
          <dd>
            {formatUsdCents(d.originationFee)} ({d.originationFeePct}% of the loan amount), payable
            by you before the loan is funded. It is not added to your loan. Because it is a finance
            charge, it is included in the Finance Charge and the Annual Percentage Rate above, which
            is why the APR is higher than the {d.interestRatePct}% interest rate.
          </dd>
        </div>
      </dl>

      <details className="tila-details">
        <summary>Full payment schedule ({d.schedule.length} payments)</summary>
        <table className="tila-table tila-table--compact">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Est. due date</th>
              <th scope="col">Payment</th>
              <th scope="col">Principal</th>
              <th scope="col">Interest</th>
              <th scope="col">Balance after</th>
            </tr>
          </thead>
          <tbody>
            {d.schedule.map((p) => (
              <tr key={p.number}>
                <td>{p.number}</td>
                <td>{formatShortDate(p.dueDate)}</td>
                <td>{formatUsdCents(p.amount)}</td>
                <td>{formatUsdCents(p.principal)}</td>
                <td>{formatUsdCents(p.interest)}</td>
                <td>{formatUsdCents(p.balanceAfter)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {d.acceptance ? (
        <div className="tila-accepted">
          <strong>Accepted and signed electronically</strong> by {d.acceptance.signatureName} on{" "}
          {formatTimestamp(d.acceptance.acceptedAt)}.
        </div>
      ) : null}
    </section>
  );
}
