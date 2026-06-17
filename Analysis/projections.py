"""
VetFinance — 5-Year Financial Model
Two funding phases:
  Phase 1: 100% equity funded (months 1 → EQUITY_ONLY_MONTHS)
  Phase 2: equity/debt split  (months EQUITY_ONLY_MONTHS+1 → 60)

Run: python vetfinance_model.py
"""

import math
from prettytable import PrettyTable

# ── ASSUMPTIONS ───────────────────────────────────────────────────────────────

# Practice growth
START_PRACTICES     = 5
NEW_PRACTICES       = {1:8, 2:18, 3:25, 4:20, 5:12}  # new signed per month, by year
MONTHLY_CHURN_RATE  = 0.005

# Loan economics
REFERRALS_PER_WEEK  = 3.0
APPROVAL_RATE       = 0.65
AVG_LOAN_SIZE       = 1_800
AVG_REPAY_MONTHS    = 14
ANNUAL_APR          = 0.22
ORIGINATION_FEE     = 0.02
ANNUAL_LOSS_RATE    = 0.06

# Funding structure
EQUITY_ONLY_MONTHS  = 6        # months before debt facility opens
EQUITY_PCT          = 0.10     # equity share of each loan in Phase 2; debt = 1 - EQUITY_PCT
ANNUAL_COST_OF_DEBT = 0.09

# Tax
CORPORATE_TAX_RATE  = 0.25     # federal + state blended; NOL carryforwards applied

# Operating expenses
OPEX_Y1_ANNUAL      = 850_000
OPEX_ANNUAL_GROWTH  = 0.20

# Starting capital
INITIAL_EQUITY      = 1_000_000

# Fundraising rules
EQUITY_RUNWAY_TRIGGER = 3       # raise when equity cash < this many months of opex
EQUITY_RAISE_HORIZON  = 18      # size equity raise to cover this many months forward
DEBT_RAISE_HORIZON    = 18      # size debt facility to cover this many months of projected draws
EQUITY_RAISE_ROUND    = 250_000
DEBT_RAISE_ROUND      = 1_000_000

WEEKS_PER_MONTH = 365 / 12 / 7

# ── HELPERS ───────────────────────────────────────────────────────────────────

def year_of(month):
    return (month - 1) // 12 + 1

def get_opex(month):
    return OPEX_Y1_ANNUAL * (1 + OPEX_ANNUAL_GROWTH) ** (year_of(month) - 1) / 12

def get_eq_pct(month):
    return 1.0 if month <= EQUITY_ONLY_MONTHS else EQUITY_PCT

# ── PASS 1: compute base metrics for all 60 months (no raises) ────────────────

def compute_base():
    base = []
    practices = START_PRACTICES
    portfolio = 0.0

    for month in range(1, 61):
        yr = year_of(month)
        new   = NEW_PRACTICES[yr]
        churn = round(practices * MONTHLY_CHURN_RATE) if month > 1 else 0
        practices = (START_PRACTICES + new) if month == 1 else (practices + new - churn)

        referrals    = practices * REFERRALS_PER_WEEK * WEEKS_PER_MONTH
        approved     = round(referrals * APPROVAL_RATE)
        originations = approved * AVG_LOAN_SIZE

        beg_portfolio = portfolio
        repayments    = beg_portfolio / AVG_REPAY_MONTHS
        charge_offs   = beg_portfolio * ANNUAL_LOSS_RATE / 12
        end_portfolio = max(beg_portfolio + originations - repayments - charge_offs, 0)
        avg_portfolio = (beg_portfolio + end_portfolio) / 2

        interest_income = avg_portfolio * ANNUAL_APR / 12
        orig_fees       = originations * ORIGINATION_FEE
        total_revenue   = interest_income + orig_fees
        opex            = get_opex(month)

        eq_pct  = get_eq_pct(month)
        dbt_pct = 1.0 - eq_pct
        debt_balance  = end_portfolio * dbt_pct
        cost_of_funds = debt_balance * ANNUAL_COST_OF_DEBT / 12

        eq_loans_out = originations * eq_pct
        eq_repay_in  = repayments   * eq_pct

        equity_delta = (
            - eq_loans_out
            + eq_repay_in
            + interest_income
            + orig_fees
            - opex
            - cost_of_funds
        )

        provision  = charge_offs
        net_income = total_revenue - opex - provision - cost_of_funds

        portfolio = end_portfolio

        base.append({
            'month': month, 'year': yr, 'practices': practices,
            'approved': approved, 'originations': originations,
            'repayments': repayments, 'charge_offs': charge_offs,
            'beg_portfolio': beg_portfolio, 'end_portfolio': end_portfolio,
            'avg_portfolio': avg_portfolio, 'interest_income': interest_income,
            'orig_fees': orig_fees, 'total_revenue': total_revenue,
            'opex': opex, 'provision': provision,
            'eq_pct': eq_pct, 'dbt_pct': dbt_pct,
            'eq_loans_out': eq_loans_out, 'eq_repay_in': eq_repay_in,
            'debt_balance': debt_balance, 'cost_of_funds': cost_of_funds,
            'net_income': net_income, 'equity_delta': equity_delta,
        })

    return base

# ── PASS 2: simulate raises on top of base ────────────────────────────────────

def simulate_raises(base):
    equity_cash      = INITIAL_EQUITY
    debt_committed   = 0.0   # committed (approved) credit line size
    raises           = []    # log of all raise events
    nol_carryforward = 0.0   # net operating loss carryforward for tax purposes

    rows = []

    for i, b in enumerate(base):
        month = b['month']
        opex  = b['opex']
        runway_buffer = opex * EQUITY_RUNWAY_TRIGGER

        # ── Equity raise check ─────────────────────────────────────────────
        # Trigger: equity cash will drop below 3-month opex buffer
        equity_raise = 0.0
        projected_after_delta = equity_cash + b['equity_delta']

        if projected_after_delta < runway_buffer:
            # Project equity_cash over the next 18 months assuming no further raises,
            # using base equity_deltas. Find the lowest point.
            projected = equity_cash   # before this month's delta
            worst     = projected
            for j in range(i, min(i + EQUITY_RAISE_HORIZON, len(base))):
                projected += base[j]['equity_delta']
                worst = min(worst, projected)

            # Raise enough so the worst point stays at or above the buffer
            shortfall = runway_buffer - worst
            if shortfall > 0:
                equity_raise = math.ceil(shortfall / EQUITY_RAISE_ROUND) * EQUITY_RAISE_ROUND
                raises.append({
                    'month': month, 'year': b['year'],
                    'type': 'Equity', 'amount': equity_raise,
                    'note': f"Covers projected 18-month equity shortfall; buffer = {EQUITY_RUNWAY_TRIGGER}-mo opex"
                })

        # ── Tax calculation ────────────────────────────────────────────────
        # Tax is on net income (P&L). NOL carryforwards absorb losses before tax kicks in.
        taxable_income = b['net_income']
        if taxable_income > 0 and nol_carryforward > 0:
            used_nol = min(nol_carryforward, taxable_income)
            taxable_income -= used_nol
            nol_carryforward -= used_nol
        elif taxable_income < 0:
            nol_carryforward += abs(taxable_income)
        tax = max(0.0, taxable_income * CORPORATE_TAX_RATE)

        equity_cash += equity_raise + b['equity_delta'] - tax

        # ── Debt facility raise check ──────────────────────────────────────
        # Trigger: the drawn balance this month is about to exceed the committed line.
        # Action:  commit enough to cover the peak draw over the next 18 months.
        # This means you negotiate once every ~18 months, not every month.
        debt_raise = 0.0
        if b['debt_balance'] > debt_committed:
            max_draw_needed = max(
                base[j]['debt_balance']
                for j in range(i, min(i + DEBT_RAISE_HORIZON, len(base)))
            )
            new_commitment = math.ceil(max_draw_needed / DEBT_RAISE_ROUND) * DEBT_RAISE_ROUND
            debt_raise     = new_commitment - debt_committed
            debt_committed = new_commitment
            raises.append({
                'month': month, 'year': b['year'],
                'type': 'Debt Facility',
                'amount': new_commitment,
                'increment': debt_raise,
                'note': f"Committed to cover next {DEBT_RAISE_HORIZON}-mo peak draw of ${max_draw_needed:,.0f}"
            })

        rows.append({
            **b,
            'equity_raise':   equity_raise,
            'equity_cash':    equity_cash,
            'debt_raise':     debt_raise,
            'debt_committed': debt_committed,
            'tax':            tax,
            'net_income_at':  b['net_income'] - tax,
            'nol_remaining':  nol_carryforward,
        })

    return rows, raises

# ── DISPLAY ───────────────────────────────────────────────────────────────────

def d(n):
    return f"${n:,.0f}" if n >= 0 else f"(${abs(n):,.0f})"

def pct(p):
    return f"{p*100:.0f}%"

def print_assumptions():
    t = PrettyTable(["Assumption", "Value"])
    t.align["Assumption"] = "l"; t.align["Value"] = "r"
    t.add_rows([
        ["Model start",                  "Jan 2027"],
        ["Initial equity",               d(INITIAL_EQUITY)],
        ["Phase 1 — equity only",        f"Months 1–{EQUITY_ONLY_MONTHS}"],
        ["Phase 2 — equity share",       pct(EQUITY_PCT)],
        ["Phase 2 — debt share",         pct(1 - EQUITY_PCT)],
        ["APR charged to borrower",      pct(ANNUAL_APR)],
        ["Cost of debt (warehouse)",     pct(ANNUAL_COST_OF_DEBT)],
        ["Net interest spread",          pct(ANNUAL_APR - ANNUAL_COST_OF_DEBT)],
        ["Annual loss rate",             pct(ANNUAL_LOSS_RATE)],
        ["Avg loan size",                d(AVG_LOAN_SIZE)],
        ["Avg repayment period",         f"{AVG_REPAY_MONTHS} months"],
        ["Year-1 opex (annual)",         d(OPEX_Y1_ANNUAL)],
        ["Equity raise trigger",         f"< {EQUITY_RUNWAY_TRIGGER} months opex in cash"],
        ["Equity raise horizon",         f"{EQUITY_RAISE_HORIZON} months forward"],
        ["Debt facility horizon",        f"{DEBT_RAISE_HORIZON} months forward"],
        ["Corporate tax rate",           pct(CORPORATE_TAX_RATE)],
    ])
    print("\nVETFINANCE — 5-YEAR MODEL")
    print(t)

def print_monthly(rows, show):
    t = PrettyTable()
    t.field_names = [
        "Mo", "Yr", "Ph", "Prac",
        "Originations", "Eq Funded", "Debt Funded",
        "Repayments", "End Portfolio", "Debt Drawn", "Debt Committed",
        "Revenue", "Opex", "CoF", "Net Inc", "Tax",
        "Eq Raise", "Equity Cash",
    ]
    for f in t.field_names: t.align[f] = "r"
    t.align["Ph"] = "c"

    for r in rows:
        if r['month'] not in show: continue
        t.add_row([
            r['month'], r['year'],
            "P1" if r['month'] <= EQUITY_ONLY_MONTHS else "P2",
            r['practices'],
            d(r['originations']),
            d(r['eq_loans_out']),
            d(r['originations'] * r['dbt_pct']),
            d(r['repayments']),
            d(r['end_portfolio']),
            d(r['debt_balance']),
            d(r['debt_committed']),
            d(r['total_revenue']),
            d(r['opex']),
            d(r['cost_of_funds']),
            d(r['net_income']),
            d(r['tax']) if r['tax'] else "—",
            d(r['equity_raise']) if r['equity_raise'] else "—",
            d(r['equity_cash']),
        ])

    print("\nMONTHLY DETAIL")
    print(t)

def print_annual(rows):
    t = PrettyTable()
    t.field_names = ["Metric", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"]
    t.align["Metric"] = "l"
    for f in ["Year 1","Year 2","Year 3","Year 4","Year 5"]: t.align[f] = "r"

    metrics = [
        ("Practices at yr-end",        'practices',      'last', False),
        ("Total originations",          'originations',   'sum',  True),
        ("Loans funded (count)",        'approved',       'sum',  False),
        ("End portfolio",               'end_portfolio',  'last', True),
        ("Avg portfolio",               'avg_portfolio',  'avg',  True),
        (None,None,None,None),
        ("Total revenue",               'total_revenue',  'sum',  True),
        ("  Interest income",           'interest_income','sum',  True),
        ("  Origination fees",          'orig_fees',      'sum',  True),
        ("Opex",                        'opex',           'sum',  True),
        ("Provision / losses",          'provision',      'sum',  True),
        ("Cost of funds",               'cost_of_funds',  'sum',  True),
        ("Net income (pre-tax)",         'net_income',     'sum',  True),
        ("Tax",                          'tax',            'sum',  True),
        ("Net income (after-tax)",       'net_income_at',  'sum',  True),
        (None,None,None,None),
        ("Equity raised (cumulative)",  'equity_raise',   'cumsum', True),
        ("Debt facility (yr-end)",      'debt_committed', 'last', True),
        ("Equity cash (yr-end)",        'equity_cash',    'last', True),
    ]

    cumsum_eq = 0.0
    for label, field, agg, is_dollar in metrics:
        if label is None:
            t.add_row(["─"*30] + ["─"*14]*5)
            continue
        row = [label]
        for y in range(1,6):
            yr_rows = [r for r in rows if r['year'] == y]
            if agg == 'sum':
                val = sum(r[field] for r in yr_rows)
            elif agg == 'last':
                val = yr_rows[-1][field]
            elif agg == 'avg':
                val = sum(r[field] for r in yr_rows) / len(yr_rows)
            elif agg == 'cumsum':
                cumsum_eq += sum(r[field] for r in yr_rows)
                val = cumsum_eq
            row.append(d(val) if is_dollar else f"{val:,.0f}")
        t.add_row(row)

    print("\nANNUAL SUMMARY")
    print(t)

def print_valuation(rows):
    yr5 = [r for r in rows if r['year'] == 5]
    revenue_y5    = sum(r['total_revenue'] for r in yr5)
    ni_after_tax  = sum(r['net_income_at'] for r in yr5)
    portfolio_y5  = yr5[-1]['end_portfolio']
    equity_cash   = yr5[-1]['equity_cash']
    equity_book   = equity_cash + portfolio_y5 * EQUITY_PCT   # cash + equity-funded loans

    print("\nYEAR-5 VALUATION ANALYSIS")

    # Key metrics table
    m = PrettyTable(["Metric", "Value"])
    m.align["Metric"] = "l"; m.align["Value"] = "r"
    m.add_rows([
        ["Revenue (Year 5)",               d(revenue_y5)],
        ["Net income after tax (Year 5)",  d(ni_after_tax)],
        ["Loan portfolio (Year 5)",        d(portfolio_y5)],
        ["Equity book value (Year 5)",     d(equity_book)],
        ["  = Equity cash",               d(equity_cash)],
        [f"  + Equity-funded loans ({pct(EQUITY_PCT)})", d(portfolio_y5 * EQUITY_PCT)],
        ["Total equity raised",            d(sum(r['equity_raise'] for r in rows) + INITIAL_EQUITY)],
    ])
    print(m)

    # Valuation scenarios
    scenarios = [
        # (label, basis_label, basis_val, lo_mult, hi_mult, note)
        ("Bear — mature lender P/E",   "After-tax NI", ni_after_tax,  10, 12,
         "Treated like LendingClub / Synchrony; capital-intensive, no growth premium"),
        ("Base — growth fintech P/E",  "After-tax NI", ni_after_tax,  18, 25,
         "Niche fintech with defensible distribution; 874 vet practices at year-end"),
        ("Base — revenue multiple",    "Revenue",      revenue_y5,     5,  7,
         "5–7x revenue; typical for profitable niche lending platform"),
        ("Base — price to book",       "Equity book",  equity_book,    3,  5,
         "3–5x book; growth lender premium over 1.1–1.7x for plain-vanilla banks"),
        ("Bull — strategic acquirer",  "Revenue",      revenue_y5,    10, 16,
         "Synchrony / PE roll-up paying for vet practice network moat"),
    ]

    t = PrettyTable(["Scenario", "Basis", "Basis Value", "Low Multiple", "High Multiple",
                     "Low Value", "High Value", "Note"])
    t.align["Scenario"] = "l"; t.align["Basis"] = "l"; t.align["Note"] = "l"
    for f in ["Basis Value","Low Value","High Value"]: t.align[f] = "r"
    for f in ["Low Multiple","High Multiple"]: t.align[f] = "r"

    for label, basis_label, basis_val, lo, hi, note in scenarios:
        t.add_row([
            label, basis_label, d(basis_val),
            f"{lo}x", f"{hi}x",
            d(basis_val * lo), d(basis_val * hi),
            note,
        ])
    print(t)

    # MOIC table
    total_equity_in = sum(r['equity_raise'] for r in rows) + INITIAL_EQUITY
    moic = PrettyTable(["Exit Valuation", "Total Equity In", "MOIC"])
    moic.align["Exit Valuation"] = "r"; moic.align["Total Equity In"] = "r"; moic.align["MOIC"] = "r"
    for label, val in [
        ("Bear low",     ni_after_tax * 10),
        ("Bear high",    ni_after_tax * 12),
        ("Base low",     ni_after_tax * 18),
        ("Base high",    revenue_y5   *  7),
        ("Bull low",     revenue_y5   * 10),
        ("Bull high",    revenue_y5   * 16),
    ]:
        moic.add_row([f"{label}: {d(val)}", d(total_equity_in), f"{val/total_equity_in:.1f}x"])
    print(moic)

    print("""
How valuation works for a lending business:
  P/E  — buyer pays N× annual after-tax profit. Financial buyers (PE) anchor here.
  Rev  — buyer pays N× annual revenue. Used for growth platforms with a distribution moat.
  P/B  — buyer pays N× equity book value. Used when acquiring the balance sheet (bank M&A).
  Strategic premium — acquirer pays above financial multiples for distribution lock-in
                      (e.g. Synchrony paying to own the vet financing relationship vs. CareCredit).
  Note: Year-1 NOL carryforward absorbs most of Year-2 tax; taxes bite fully from Year 3 onward.""")


def print_raise_schedule(raises, rows):
    t = PrettyTable()
    t.field_names = ["Mo", "Yr", "Type", "Amount / Line Size", "Increment", "Note"]
    t.align["Mo"] = "r"; t.align["Yr"] = "r"
    t.align["Type"] = "l"; t.align["Amount / Line Size"] = "r"
    t.align["Increment"] = "r"; t.align["Note"] = "l"

    total_equity = INITIAL_EQUITY
    # Initial equity
    t.add_row([0, "—", "Equity (seed)", d(INITIAL_EQUITY), d(INITIAL_EQUITY),
               "Pre-launch capital"])

    for ev in raises:
        if ev['type'] == 'Equity':
            total_equity += ev['amount']
            t.add_row([
                ev['month'], ev['year'], "Equity raise",
                d(ev['amount']), d(ev['amount']), ev['note']
            ])
        else:
            t.add_row([
                ev['month'], ev['year'], "Debt facility",
                d(ev['amount']),
                d(ev.get('increment', ev['amount'])),
                ev['note']
            ])

    print("\nFUNDRAISING SCHEDULE")
    print(t)

    # Summary
    debt_events = [e for e in raises if e['type'] == 'Debt Facility']
    s = PrettyTable(["Summary", "Value"])
    s.align["Summary"] = "l"; s.align["Value"] = "r"
    s.add_rows([
        ["Total equity raised (incl seed)",  d(total_equity)],
        ["Number of equity raises",          str(1 + sum(1 for e in raises if e['type']=='Equity'))],
        ["Debt facility — peak commitment",  d(max((e['amount'] for e in debt_events), default=0))],
        ["Number of debt facility events",   str(len(debt_events))],
        ["Equity cash — end of Year 5",      d(rows[-1]['equity_cash'])],
        ["Debt drawn — end of Year 5",       d(rows[-1]['debt_balance'])],
        ["Loan portfolio — end of Year 5",   d(rows[-1]['end_portfolio'])],
    ])
    print(s)

# ── MAIN ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    base          = compute_base()
    rows, raises  = simulate_raises(base)

    print_assumptions()
    show = list(range(1, 13)) + [24, 36, 48, 60]
    print_monthly(rows, show)
    print_annual(rows)
    print_raise_schedule(raises, rows)
    print_valuation(rows)
"""
VetFinance — 5-Year Financial Model
Two funding phases:
  Phase 1: 100% equity funded (months 1 → EQUITY_ONLY_MONTHS)
  Phase 2: equity/debt split  (months EQUITY_ONLY_MONTHS+1 → 60)

Run: python vetfinance_model.py
"""

import math
from prettytable import PrettyTable

# ── ASSUMPTIONS ───────────────────────────────────────────────────────────────

# Practice growth
START_PRACTICES     = 5
NEW_PRACTICES       = {1:8, 2:18, 3:25, 4:20, 5:12}  # new signed per month, by year
MONTHLY_CHURN_RATE  = 0.005

# Loan economics
REFERRALS_PER_WEEK  = 3.0
APPROVAL_RATE       = 0.65
AVG_LOAN_SIZE       = 1
