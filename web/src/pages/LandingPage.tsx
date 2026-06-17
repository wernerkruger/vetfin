import Header from "../components/Header";
import Hero from "../components/Hero";
import HowItWorks from "../components/HowItWorks";
import Audiences from "../components/Audiences";
import Trust from "../components/Trust";
import Footer from "../components/Footer";
import "../App.css";

export default function LandingPage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <Audiences />
        <Trust />
      </main>
      <Footer />
    </>
  );
}
