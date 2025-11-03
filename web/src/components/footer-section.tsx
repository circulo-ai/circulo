import Aurora from "./aurora";

export function FooterSection() {
  return (
    <footer className="main-section relative" id="contact-us">
      <Aurora
        blend={1}
        speed={0.5}
        colorStops={["#f0fdfa", "#cbfbf1", "#ecfcca", "#022f2e", "#f7fee7"]} // These are from the tailwindColorMap that is being used in the hero section
      />

      <div className=""></div>
    </footer>
  );
}
