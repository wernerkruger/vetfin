import "./Trust.css";

const pillars = [
  {
    title: "Responsible lending",
    text: "Underwriting built for veterinary use cases—not generic personal loans with hidden traps.",
  },
  {
    title: "Verified data",
    text: "Bank and credit connections (including partners like Plaid) help us make fast, fair decisions.",
  },
  {
    title: "Compliance first",
    text: "Licensing, disclosures, and state-by-state rules are part of the product—not an afterthought.",
  },
];

export default function Trust() {
  return (
    <section className="section section--alt trust">
      <div className="section-inner trust-inner">
        <div className="trust-copy">
          <span className="section-label">Trust &amp; security</span>
          <h2 className="section-title">Built for a regulated industry</h2>
          <p className="section-lead trust-lead">
            VetFin is being built as a specialty finance platform—not a payday
            workaround. Your financial data stays encrypted in transit and at
            rest, and we only pull what we need to decision your application.
          </p>
        </div>
        <ul className="trust-pillars">
          {pillars.map((pillar) => (
            <li key={pillar.title} className="trust-pillar">
              <h3>{pillar.title}</h3>
              <p>{pillar.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
