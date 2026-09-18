# NavDR: image prompts, slide blueprint and optimized pitch copy

Prepared 7 September 2026. Working reference: `SIH_2026_PS_26168_NavDR_Final_6Slides.pptx`. This is a production brief, not a revised PowerPoint. No separate example image or new template was attached; the existing six-slide deck is the assumed template. All six existing slides were rendered and inspected. Keep its 16:9 dimensions, required headings, approved logos and footer. The cover mixes a 2026 event title with an SIH 2025 logo: verify the current organizer-supplied master before submission. Team ID and registered team name must be supplied, not invented.

## 1. Research findings and their limits

There is no verified public archive of every SIH winner’s deck. Search results and collections frequently call a file “winning” without corroborating its award. Treat these as presentation references, not proof that a visual style caused a win.

| Reference | What the accessible material establishes | What to borrow for NavDR |
|---|---|---|
| [HexxCode, SIH 2023](https://github.com/pt3002/HexxCode-SIH-2023) | Team-owned repository identifies a winner and links its presentation and demo. [A team member also reports the win](https://www.linkedin.com/posts/prerna-tulsiani-00b894202_hackathonwinners-smartindiahackathon2023-activity-7144000838712172545-3-KM). Canva slide content was not readable through the research tool. | Put implementation evidence beside the pitch: an accessible repository and a demonstration link. No claim about this deck's visual layout. |
| [Cannon Crew public deck](https://www.slideshare.net/slideshow/906186982-sih-2024-winning-ppt-pptx-sih-winning/283925301) | Accessible slide content separates solution, technical architecture, risks and a concrete user story. Reuploads disagree on PS identifiers. A filename alone does not verify a win. | Explain one complete input-to-output mechanism. Pair a named user with a specific operating condition. |
| [TechByte AlertMe](https://www.slideshare.net/slideshow/doc-20240903-wa0022-pptx_20240910_143724_0000-pptx/273221048) | Public proposal describes data inputs, coordination and resource management. Award status was not established. | Tie technology to an operational workflow. Reduce text density instead of reproducing all feature lists. |
| [GeoGuards](https://www.scribd.com/document/916253298/SIH2025-IDEA-Presentation-Format-pptx-5) | Public proposal links sensing and prediction to risk levels and alerts. Award status was not established. | Make the system state understandable at a glance: GNSS available, degraded, denied and recovering. |
| [Public collection marketed as winner resources](https://github.com/Aadiii00/SIH-Winners-PPt-and-Sources) | Lists decks across several years. It is a community collection, not an official award register. | Use for discovery only. Verify provenance independently. |

The [2024 presentation format hosted by CMRIT](https://www.cmrit.ac.in/wp-content/uploads/2024/10/SIH2024_IDEA_Presentation_Format.pdf) specifies six submission slides including the cover, concise visual explanations and PDF submission. This is historical guidance, not confirmation of 2026 rules. [MGIT's current event page](https://mgit.ac.in/events/mgit-internal-hackathon-smart-india-hackathon-sih-2026/) points to the [2026 organizer template](https://sih.gov.in/letters/2026/SIH2026-IDEA-Presentation-Format.pptx). Use the current organizer file to resolve any differences.

My design conclusion: make one physical object explain each slide, keep the mechanism legible, and let actual evidence carry credibility. A winner-inspired presentation should not become a collage of unrelated 3D objects.

## 2. Visual direction: a navigation laboratory inside a phone

Use precision industrial illustration: a recognizable Android phone, miniature Indian roads, a cutaway tunnel, machined sensor layers, restrained signal traces and translucent uncertainty contours. The emotional core is simple: the car keeps moving while the satellite signal becomes unreliable.

**Palette:** retain the template's white canvas and blue footer. Navy #17365D for text, cobalt #146BCB for GNSS, teal #008C82 for estimated motion, amber #E8A136 for degraded reception, coral #D95B55 for rejected observations. Illustrations use off-white ceramic, graphite and brushed aluminum. Never rely on color alone: add editable labels and line styles.

**Composition:** one dominant illustration per slide. Secondary evidence should be a real screenshot, a native chart or a small editable diagram. Avoid rainbow boxes, repeated rounded cards, lens-flare backgrounds, robot heads and floating brains. Use a tree only for branching possibilities, a pyramid only for layers or maturity, and a bucket only if explicitly explaining accumulation. Do not imply that an EKF physically filters water or that a neural model guarantees an exact location.

**Typography:** keep required template heading styles. Within editable content, use a consistent sans serif such as Aptos or Arial. Aim for 20–24 pt body copy and 16–18 pt annotations at this deck size. Shorten content before reducing text size. References can be smaller if they remain readable in the exported PDF.

**Content boundary:** illustrated mechanisms are conceptual. Generate no chart numbers, equations, QR codes, interface text, logos or citations. Add those as editable PowerPoint elements. Do not use an AI-generated console screenshot as prototype evidence.

## 3. Master image-generation prompt

Prepend this to each slide-specific prompt below. Generate images individually, not a six-slide montage. If your generator accepts image references, attach the approved first illustration to later prompts to preserve materials, camera angle and color treatment.

> Create a premium scientific product illustration for a navigation engineering presentation. Use a coherent miniature physical world, precise industrial design and believable scale relationships. Orthographic three-quarter camera, approximately 30 degrees above the subject, long-lens appearance with minimal perspective distortion. Materials: matte off-white ceramic, fine-grain asphalt, brushed aluminum, graphite polymer and lightly frosted glass. Bright neutral studio environment, large soft key light from upper left, subtle ambient occlusion, short grounded shadows, restrained edge highlights, high micro-contrast and crisp silhouettes. Limited palette: navy, cobalt blue, teal and a small amber accent. Keep important geometry sharp throughout; no strong depth-of-field blur. White or transparent background as requested. Make the central mechanism understandable within three seconds at presentation size. Output at the highest available resolution with enough detail for a 4K slide, preferably PNG. No lettering, numbers, logos, watermarks, fake equations, fake charts, QR codes, control panels or ornamental sci-fi interfaces. Every object must explain the navigation concept. Preserve the specified empty areas for editable slide copy.

## 4. Slide-by-slide production plan

All coordinates below use percentages of the full slide, measured from the top-left. Reserve roughly y=0–18% for the existing heading/logos and y=92–100% for the footer. Fit within the actual master, rather than covering required template elements. Text below is final slide copy; presentation notes and generation prompts are not slide text.

### Slide 1: TITLE PAGE

**Purpose:** make the problem memorable before naming the algorithms.

**Paste-ready copy**

NavDR

Smartphone navigation through GNSS outages

Problem Statement ID: 26168

AI-ML based Intelligent Dead Reckoning system for seamless navigation

Organization: ISRO

Theme: [match the current portal]

Category: Software

Team: [registered name]    Team ID: [registered ID]

**Layout:** text x=6–48%, y=27–78%. Hero artwork x=50–96%, y=24–85%. Keep the official problem title readable; the short subtitle supplements it. The metadata has priority over decorative elements.

**Image prompt A: the phone as a road bridge**

> Compose a 4:5 portrait product illustration for the right side of a white presentation. A modern unbranded graphite smartphone lies diagonally in a shallow three-quarter view. Its glass screen becomes a physically coherent miniature road landscape: an open approach road enters a concrete tunnel and exits into daylight. Remove one upper quadrant of the tunnel shell as an architectural cutaway so the interior road is visible. Place one small teal passenger car on the road inside the cutaway, with a correctly oriented nose and realistic wheels. A thin cobalt navigation trace approaches the tunnel; it becomes teal inside the covered section and continues smoothly onto the exit road. The trace follows road curvature precisely. Suggest blocked satellite reception with three faint cobalt rays ending at the opaque roof, never passing through it. Give the car a very subtle translucent elliptical footprint representing uncertain position, not a protective dome. Use engineering-model craftsmanship, asphalt aggregate, concrete edges, tiny lane markings and soft grounded shadows. The scene occupies the center and lower right, with at least 12% breathing room around the full object. The phone and tunnel must read as one visual metaphor. No giant satellites, explosions, map labels, glowing city skyline or text.

**Editable overlay:** a small caption below the artwork: “Concept illustration”.

**Speaker cue:** “NavDR estimates continued movement when a phone can no longer trust satellite positioning.”

### Slide 2: IDEA TITLE

**Purpose:** show the failure and the proposed response in one continuous scene.

**Paste-ready copy**

NavDR: motion continuity when GNSS becomes unreliable

**Problem**
Satellite obstruction interrupts positioning. IMU bias accumulates into position error.

**Proposed solution**
Use phone motion sensors, velocity estimation and road constraints to bridge GNSS outages.

**What distinguishes NavDR**
NavIC-aware handoff is a development goal. The prototype exposes uncertainty and compares navigation methods on the same recording.

**Validation target**
Peak outage position error below 10% of distance travelled during the outage.

**Layout:** hero x=5–64%, y=27–80%. Three short text groups x=68–95%, y=25–81%. Put the target at y=85–90%. Use roughly 70 words, excluding heading. Do not describe the target as an achieved field result.

**Image prompt B: the continuous road through a signal shadow**

> Create a wide 3:2 architectural cutaway of a short road passing through an urban underpass. One uninterrupted road curves naturally from left foreground to right background. Use a single small white car at the center of the covered section. On the left, sparse cobalt signal rays reach the open road; at the concrete roof the rays visibly stop. Through the cutaway, a slender teal estimated path continues on the asphalt. Show a separate, fine coral dotted path gradually departing from the road to represent unconstrained drift, kept visually subordinate to the teal route. On the right, the tunnel ends and a few cobalt rays return. Use amber only at the entrance to mark degrading reception. Make the path colors consistent with the master brief. Include two restrained translucent elliptical contours along the estimated path, slightly broader deeper into the covered section; do not make them look like exact guarantees. The scene should resemble an elegant museum engineering model, not an actual measured trajectory. Leave a blank strip across the lower 15% for three editable phase labels. No illegible map text, extra cars, heroic lighting or decorative network clouds.

**Editable overlay:** “GNSS available”, “Dead reckoning”, “GNSS recovery”. Add “Illustrative trajectories” beside the dotted comparison.

**Speaker cue:** “We use several imperfect sources together and show uncertainty rather than silently presenting every estimate as equally reliable.”

### Slide 3: TECHNICAL APPROACH

**Purpose:** explain the actual pipeline, separating current implementation from planned learning.

**Paste-ready copy**

Phone IMU
Acceleration and rotation

Frame alignment
Fixed mounting configuration

TCN velocity
49,665 parameters, untrained demo

Planar EKF
State estimation and GNSS innovation gating

Road HMM
Road-constrained position output

Current: browser prototype, 100 Hz simulated IMU, recording and replay

Next: trained weights and Android device validation

**Layout:** reserve x=5–61%, y=26–80% for an exploded illustration; x=66–95%, y=24–81% for five short labels. Add current/next statements at the bottom. Connect labels to objects with thin editable leader lines. Do not turn every label into a colored card.

**Image prompt C: an exploded navigation instrument**

> Create a 4:3 exploded technical product illustration of a smartphone navigation instrument, arranged as a vertical stack of five separated physical layers above a graphite phone chassis. Bottom layer: a small inertial sensor package with three mutually perpendicular sensing axes represented by subtle physical rods, no labels. Second layer: a precision gimbal showing coordinate alignment. Third layer: a compact silicon module with eight clearly separated parallel ridged bands and a few orderly short links, suggesting temporal convolution, not a biological brain. Fourth layer: a frosted-glass plane containing a simple uncertain-position ellipse and a central point, representing state estimation. Top layer: a thin miniature road surface with a single branching junction and one continuous teal path following a legal connected branch. Keep the stack wide and stable, with consistent perspective and plausible material thickness. Use teal signal traces to connect the layers without spaghetti wiring. Introduce a small cobalt side input near the estimation layer as a satellite-fix cue. Leave the rightmost 30% completely empty for editable technical labels. Emphasize precision-machined edges, soft contact shadows and subtle glass refraction. No chip brand names, no fabricated mathematical matrices, no giant brain, no unconnected arrows or floating dashboard widgets.

**Accuracy note:** the illustration is a logical stack, not physical hardware added to the phone. Add “Conceptual processing layers”. Retain “planar EKF”; do not label the current implementation “15-state ESKF”.

**Optional inset D: road tree**

> Produce a 3:2 top-down miniature asphalt junction isolated on white. One incoming road divides into three plausible connected outgoing branches. Place small neutral position markers along each branch. Emphasize exactly one continuous teal route through the junction; make the two alternative routes light gray. Add one thin coral jump between disconnected road sections as a rejected possibility. Keep geometry legible and road widths consistent. This is a physical road interpretation of a candidate-path tree, not a probability chart. No numbers, labels, arbitrary probability values or text.

Use D only if replacing part of the main illustration. Add actual HMM states and transition labels as editable diagram elements if needed; the generated image cannot establish mathematical correctness.

### Slide 4: FEASIBILITY AND VIABILITY

**Purpose:** show a credible path from a functioning prototype to validated phone navigation.

**Paste-ready copy**

**Working now**
Navigation console, synthetic sensor stream, planar EKF, road matching and replay comparisons.

**Next validation**
Train the velocity model. Test multiple phones, mounting changes and Indian driving routes.

| Risk | Response |
|---|---|
| Phone moves in its mount | Detect changes and require realignment |
| GNSS reports a large spike | Reject inconsistent innovations |
| IMU samples arrive late | Monitor timestamps and flag gaps |
| Model meets unfamiliar roads | Evaluate on held-out routes and devices |

**Layout:** pyramid artwork x=5–37%, y=29–80%. Editable risk table x=42–95%, y=30–77%. Current/next labels at y=21–28% and y=81–90%. Keep the risk table editable and flat, with generous row spacing.

**Image prompt E: the validation pyramid**

> Create a 4:5 portrait illustration of a four-tier engineering validation pyramid, built as a stepped physical test rig rather than an Egyptian monument. The broad bottom tier contains a smartphone resting securely in a dashboard mount. The next tier holds a small inertial sensor test fixture and tidy waveform-like grooves sculpted into a plate. The third tier contains a miniature repeatable road test loop with one car. The narrow top tier holds two differently sized phones beside a short section of roadway, suggesting validation across devices. Use a solid cobalt accent on the bottom tier and neutral frosted materials on the upper tiers, communicating that later stages remain to be validated. Leave broad uncluttered faces on each step for labels to be added in PowerPoint. Use restrained technical craftsmanship, a white studio background and soft directional light. Maintain a stable grounded silhouette. No trophy, check marks, gold medals, rocket, success symbols or visual suggestion that all stages are completed.

**Editable pyramid labels:** “Prototype”, “Model training”, “Road tests”, “Cross-device validation”. Label upper tiers “Planned”. This is a project maturity metaphor, not a neural architecture.

**Speaker cue:** “The prototype lets us test the pipeline today. Generalization and field accuracy are the work that turns it into a deployable navigation system.”

### Slide 5: IMPACT AND BENEFITS

**Purpose:** show who benefits and what still needs measurement.

**Paste-ready copy**

Navigation continuity using an existing smartphone

Drivers: maintain position awareness through short GNSS outages.

Fleets: evaluate route continuity through tunnels and dense streets.

Deployment goal: no dedicated vehicle sensor hardware.

Success measures: outage error, recovery time, processing latency and phone energy use.

Field impact remains to be validated.

**Layout:** large city-road scene x=38–96%, y=25–84%. Copy x=5–35%, y=26–80%. Do not put a fake savings percentage or safety statistic on this slide. If actual measured results become available, replace one paragraph with a native chart.

**Image prompt F: one road network, several real users**

> Create a 3:2 isometric miniature Indian urban road scene on a clean white base. A single connected roadway links a modest tunnel, a narrow street between medium-rise buildings and an open road. Show a small delivery van, an ordinary passenger car and a modest fleet vehicle at separate points, all at the same realistic scale and travelling within their lanes. Include a subtle cutaway of the dashboard mount inside the nearest vehicle with a recognizable phone, without making the phone tower over the city. A thin continuous teal route links the scene; use cobalt on the open GNSS-visible approach and a small amber transition at the tunnel. Keep the city sparse and legible: a few trees and buildings are enough. Use believable Indian road context without landmark imitation or invented road signs. Place the main visual weight in the right two-thirds and keep the left edge quiet for copy. This should communicate potential application, not a claim of deployed customers. No autonomous-driving steering effects, emergency rescue drama, currency stacks, crowds, brand logos or glowing global network.

**Alternative object:** a branching physical road is more relevant here than a literal tree or bucket. If using a tree metaphor, make the branches roads leading to user groups, and label it as an application map.

### Slide 6: RESEARCH AND REFERENCES

**Purpose:** make the evidence and the project easy to inspect.

**Paste-ready copy**

Research foundations

IO-VNBD: vehicle and smartphone motion data

AI-IMU Dead-Reckoning: learning-assisted inertial estimation

TCN: causal temporal sequence modelling

Valhalla Meili: HMM map matching

Android GnssStatus: satellite signal observations

Prototype status: synthetic demonstration. TCN weights are untrained. Field validation is pending.

**YouTube Demo**
https://youtu.be/GoU52CqyaNI?si=BRUkPWE7Z4fjoDyq

**GitHub Repository**
https://github.com/Sudhanshu-01-ui/gps

**Layout:** references x=5–62%, y=24–63%. Small illustration x=70–94%, y=25–59%. A readable prototype-status line sits at y=68–75%. Put the two project links last, at y=80–89%, above the existing footer. Use real PowerPoint hyperlinks, not merely blue text. A QR code may supplement each link, but generate it from the exact URL with a QR encoder and test it after PDF export. Never ask image generation to draw a functional QR code.

**Image prompt G: the evidence workbench**

> Create a compact square still-life illustration of an engineering evidence workbench, isolated on white. Arrange a small unbranded smartphone, a neatly folded blank road map, three thin research folios with blank spines and one restrained calibration instrument. Use the same graphite, ceramic, brushed aluminum and frosted-glass materials as the other images. The objects should form a low triangular composition, lit from the upper left, with crisp edges and soft shadows. Leave all paper and screen surfaces blank for actual evidence to be inserted separately if required. Convey careful measurement and reproducibility. No decorative charts, fake publications, fabricated graphs, seal of approval, trophy, readable text, logos or QR codes. Keep the silhouette compact so it can occupy less than one-quarter of the slide.

**Citation destinations for the slide**

- [IO-VNBD repository](https://github.com/onyekpeu/IO-VNBD)
- [AI-IMU Dead-Reckoning](https://doi.org/10.1109/TIV.2020.2980758)
- [TCN sequence modelling paper](https://arxiv.org/abs/1803.01271)
- [Valhalla Meili algorithms](https://valhalla.github.io/valhalla/meili/algorithms/)
- [Android GnssStatus](https://developer.android.com/reference/android/location/GnssStatus)

These are research foundations, not evidence that NavDR reproduces their results. The two project URLs above were supplied by the user; browsing could not retrieve their contents in this session, so neither the video content nor repository availability was independently verified.

## 5. Optional visual metaphors for a technical explanation

Use these instead of a primary illustration, not in addition to everything else.

**Accumulation bucket, only for a spoken explanation of drift:** a transparent vessel receives small biased droplets until the water level rises. Pair it with a native graph showing the actual error model. Caption it “Bias accumulates over time”. Do not claim a TCN drains error perfectly. For constant acceleration bias, position error grows quadratically with time, not inherently exponentially.

**Handoff relay:** a real mechanical railway switch transfers a path from cobalt to teal before a roof blocks the signal. Label it “Proposed proactive handoff”. This is suitable only when discussing the future NavIC monitor, not demonstrating an implemented browser C/N₀ listener.

**Uncertainty lens:** a car sits within a translucent ground-plane ellipse that broadens along a covered road. The ellipse is an illustration. Any stated 95% value must come from the estimator and its statistical assumptions, not the artwork.

## 6. Assembly blueprint

1. Duplicate the supplied six-slide deck. Preserve required master elements and section headings. Resolve the year/logo mismatch using the current organizer template.
2. Generate A first. Approve the camera, car, phone and materials before generating B, C, E, F and G. D is optional. Generate separate assets, not complete slide screenshots.
3. Place the artwork according to the percentage bounds above. Use transparent PNG or an exactly matching white background. Do not stretch an image. Keep a clean margin around shadows.
4. Add the paste-ready copy as native text. Build the technical labels, risk table and any graphs with editable PowerPoint objects. Delete unused old text and placeholder slide-number glyphs.
5. Use one bold emphasis per text block. Keep body copy left-aligned. Use the existing footer consistently, avoiding the duplicated footer text in the source deck.
6. Label concept illustrations and simulated results. Replace the source deck's old “85.7% versus 7.5%” chart unless its exact recording and calculation can be reproduced. Avoid carrying old results into a new architecture.
7. Add YouTube Demo and GitHub Repository last on slide 6, linked to the exact supplied URLs. If QR codes are added, use real encoded assets with adequate quiet zones and verify them from the exported PDF.
8. Export a six-page PDF according to the current submission instructions. Check every slide at normal viewing size, then verify all links. Use fades or a restrained sequential reveal only for the live presentation; the PDF must make sense without animation.

## 7. Claims to update before presenting

| Existing wording | Use instead |
|---|---|
| TCN learns velocity | Untrained TCN inference implemented; training planned |
| 15-state ESKF | Six-state planar EKF in the current prototype |
| Automatic mounting-invariant alignment | Fixed mounting configuration; robust realignment planned |
| Proactive NavIC handoff works in the browser | Android signal monitoring is the intended path; browser C/N₀ unavailable |
| Guaranteed 95% position radius | Model-derived uncertainty, subject to assumptions and calibration |
| Less than 10% drift achieved generally | Validation target; report each measured scenario separately |
| ₹0 system cost | No dedicated vehicle sensor hardware intended |
| Offline end to end | Local navigation computation; map availability must be provisioned and tested |

The strongest pitch is a concrete engineering story with an honest evidence boundary. The images should make that story easier to understand, not supply unsupported performance claims.
