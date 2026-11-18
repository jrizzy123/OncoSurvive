export default function Explainer() {
  const box = { border: "1px solid #888", borderRadius: 8, padding: "4px 16px", margin: "16px 0", textAlign: "left" };
  const h = { margin: "14px 0 4px" };
  const p = { margin: "0 0 8px", lineHeight: 1.5 };
  return (
    <details id="explainer" style={box}>
      <summary style={{ cursor: "pointer", fontWeight: "bold", padding: "10px 0" }}>
        How to read a survival curve
      </summary>

      <h4 style={h}>What the line shows</h4>
      <p style={p}>
        Each point is the share of patients who had <em>not</em> died of this cancer by that many months after
        diagnosis. Every curve starts at 100% (everyone is alive at diagnosis) and can only go down.
        If the line is at 72% at month 60, then about 72 out of 100 similar patients were still living
        5 years after diagnosis, as far as this cancer is concerned.
      </p>

      <h4 style={h}>Why it moves in steps</h4>
      <p style={p}>
        The line drops each time patients in the data die of the cancer, so it falls in small steps.
        A steep drop early on means many patients died soon after diagnosis. A flat stretch means few deaths
        were happening in that period.
      </p>

      <h4 style={h}>What "censoring" means</h4>
      <p style={p}>
        Not every patient was followed to the end of their life. Someone who was still alive when the data
        was collected, or who died of something unrelated to this cancer, is called <strong>censored</strong>.
        We only know they survived the cancer <em>at least</em> up to that point. The method counts them
        while we have information about them and then stops counting them, instead of wrongly treating
        them as deaths or as survivors forever.
      </p>

      <h4 style={h}>Median survival</h4>
      <p style={p}>
        The median is the time at which the curve crosses 50%, meaning half of the patients had died of the
        cancer. If a curve never falls to 50% (as with early-stage disease), there is no median to read.
      </p>

      <h4 style={h}>Comparing groups</h4>
      <p style={p}>
        A larger gap between two lines means a bigger difference in survival between those groups.
        But the groups can differ in many ways besides the one you picked, such as other health conditions
        or treatment choices, so a gap does not show that one factor <em>caused</em> the difference.
      </p>

      <h4 style={h}>Important limits</h4>
      <p style={p}>
        These curves describe groups of past patients. They cannot predict what will happen to any one
        person, and they are not medical advice. Anyone with questions about a diagnosis should talk to
        their care team.
      </p>
    </details>
  );
}