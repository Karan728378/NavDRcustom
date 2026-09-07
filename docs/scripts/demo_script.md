# NavDR Live Demo Script (Post-Pitch)

**Target Duration:** 45 - 60 seconds (Approx. 100-130 words)
**Context:** This is to be read *live* while the simulation is running on screen, right after the main pitch concludes.

---

### **The Live Demo (Demo Lead)**

*(Screen Action: Click **Restart** on the simulation, wait for the vehicle to enter the red 'Simulated Outage Zone', then begin speaking).*

"To prove our architecture, let's look at the live NavDR Instrument Console. 

As the vehicle enters the simulated tunnel here in central Delhi, GNSS is entirely lost. Traditional apps would freeze, but NavDR immediately falls back to inertial navigation. 

If you look at the **Trajectory Error** plot below, the red line represents raw dead reckoning—without our AI and Map Matching, the error compounds rapidly. The teal line is our selected NavDR output. By fusing our TCN velocity estimates with our Planar EKF and Road HMM, we forcefully constrain that lateral deviation.

*(Screen Action: Point to the large blue percentage on the right).*

As you can see in the **Outage Accuracy** panel, even over a massive 2-kilometer, 3-minute GNSS outage, our system maintains a drift of just **2.0%**—completely crushing the SIH target of 10%. 

*(Screen Action: Scroll down to the Run Evidence table).*

And because we believe in rigorous validation, our **Ablation Workbench** lets us instantly export this exact run and test it against different configurations, mathematically proving that our AI-augmented pipeline is what keeps the vehicle on the road.

Thank you, we are now ready for your questions!"

---

### 💡 **Demo Tips:**
*   **Pacing:** Take a slight pause when pointing out the 2.0% drift so the judges have time to process the huge blue number on the right side of the screen.
*   **The Numbers:** In your screenshot, the drift shows as 2.0%. If the number changes during the actual live run, just smoothly read whatever number appears on the screen (e.g., *"maintains a drift of just 2.4%"*).
*   **Transition:** This is the perfect ending to your pitch because it transitions directly into the Q&A session while leaving the impressive 2.0% metric glowing on the screen for the judges to stare at!
