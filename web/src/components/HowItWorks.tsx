import "./HowItWorks.css";

const steps = [
  {
    number: "01",
    title: "Get the estimate at the clinic",
    description:
      "Your veterinarian shares the treatment plan and cost. VetFin is offered right there—no separate trip or paperwork pile.",
  },
  {
    number: "02",
    title: "Apply in minutes on your phone",
    description:
      "A short application verifies your identity and income using secure connections to your bank and credit profile.",
  },
  {
    number: "03",
    title: "We pay the practice; you repay VetFin",
    description:
      "If approved, funds go directly to the clinic so treatment can start. You choose a repayment plan that fits your budget.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="section section--alt">
      <div className="section-inner">
        <span className="section-label">How it works</span>
        <h2 className="section-title">Financing built for the exam room</h2>
        <p className="section-lead">
          Most pet owners don&apos;t plan for a $2,000 ER visit. VetFin is designed
          for the moment you&apos;re standing at the front desk, not weeks later at
          home.
        </p>
        <ol className="steps">
          {steps.map((step) => (
            <li key={step.number} className="step">
              <span className="step-number">{step.number}</span>
              <h3 className="step-title">{step.title}</h3>
              <p className="step-description">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
