# SIH 2026 Pitch Script: NavDR (Intelligent Dead Reckoning System)

**Target Duration:** 2.5 - 3 minutes (Approx. 25-30 seconds per speaker)
**Team Size:** 6 Members

---
> 💡 **PROTOTYPE DRIVER CUE:** Before starting, ensure `index.html` is open, zoomed to 100%, and scrolled to the top so the map and main Control Panel are visible.

### **Speaker 1: Team Lead (Introduction & Problem)**
*(Screen Action: Click the **"Start Simulation"** button in the Control Panel so the vehicle starts moving on the map with GNSS active.)*

"Good morning, judges. We are presenting **NavDR**, our solution for Problem Statement 26168. Today, modern navigation completely breaks down in tunnels, parking garages, and urban canyons when GNSS signals are lost. If we rely purely on a smartphone's internal IMU, the position drifts wildly within seconds. Our solution, NavDR, is an AI-augmented Intelligent Dead Reckoning system that provides seamless, uninterrupted navigation using *zero* external hardware—just the smartphone in your pocket. I'll hand it over to our AI Engineer to explain the core."

### **Speaker 2: AI/ML Engineer (AI Motion Estimation & TCN)**
*(Screen Action: Scroll down slightly to highlight the **Sensor Processing (Step 3)** charts, or point to the **AI/ML Engine** sidebar showing the active pipeline steps.)*

"Thank you. Traditional physics-based smartphone dead reckoning fails due to cheap sensors. We fix this using a **Temporal Convolutional Network (TCN)**. Our lightweight, 50,000-parameter neural network listens to the phone’s accelerometer and gyroscope at 100 Hertz. It learns the complex patterns of human driving to accurately predict the vehicle's forward velocity, entirely eliminating the rapid drift associated with traditional IMU integration."

### **Speaker 3: Sensor Fusion Specialist (ESKF & Dead Reckoning)**
*(Screen Action: Scroll down to the **GNSS + INS Sensor Fusion (Step 6)** section. Hover your mouse over the **Dynamic Sensor Weight Allocation** bar and the **Confidence Score**.)*

"Knowing our speed is only half the battle; we also need our exact heading and orientation. I handle the **Sensor Fusion** layer. We pass the AI’s speed predictions and the raw IMU data into a 15-state Error-State Kalman Filter, or ESKF. The ESKF acts as the mathematical brain of the system, gracefully blending the data to determine our position while dynamically applying Non-Holonomic Constraints. It also generates a 'Confidence Ring'—giving the user real-time visual feedback on their position uncertainty."

### **Speaker 4: Mapping Engineer (Map Matching & HMM)**
*(Screen Action: Scroll up slightly to the **Offline Map Matching (Step 5)** section. Toggle the **"Map Matching: ENABLED"** button off and on to show the UI react, or point to the Lateral Deviation chart.)*

"Even with AI and sensor fusion, minor drift is inevitable over long outages. We counter this using **Offline Map Matching** with a Hidden Markov Model and the Viterbi algorithm, snapping our position to OpenStreetMap road networks. By constraining our trajectory to legal road geometries, we actively correct lateral deviation. Importantly, even our classical proxy baseline alone brings drift down to 7.5%—and our full AI model trained on IO-VNBD will push this accuracy even further."

### **Speaker 5: Systems Engineer (NavIC Integration & Integrity)**
*(Screen Action: Scroll back up to the top Control Panel. Right as Speaker 5 says "trigger a proactive transition", click the red **"Simulate GNSS Loss"** button! Let the judges see the map banner turn red/orange and the system seamlessly switch to Dead Reckoning mode.)*

"A system is only as good as its handoff mechanism. Our Android application actively monitors GNSS and specifically **NavIC** signal integrity. Instead of waiting for the signal to drop completely, we analyze the signal-to-noise degradation in real-time. This allows NavDR to trigger a *proactive* transition to Dead Reckoning before the outage even occurs. Furthermore, by building this around NavIC, we are strengthening the resilience of India's indigenous navigation ecosystem."

### **Speaker 6: Deployment Strategist (Impact & Conclusion)**
*(Screen Action: Click the green **"Restore GNSS"** button to show the system smoothly fusing back to normal operation as the conclusion wraps up.)*

"Ultimately, NavDR is built for extreme scalability. Because it requires absolutely zero OBD-II or dedicated vehicle hardware, it is fully compatible with budget smartphones. This makes it instantly deployable for emergency responders, logistics fleets, ride-hailing apps, and everyday commuters navigating Indian roads. With NavDR, you never lose your way—even when you lose your signal. Thank you, and we are now open to your questions."

---

### 💡 **Tips for the Team:**
*   **The Prototype Driver:** Designate one person (usually Speaker 1 or Speaker 6 since they are at the ends) to operate the mouse. Practice clicking the buttons exactly on the scripted cues.
*   **Pacing:** Speak confidently at a moderate pace. 130-150 words per minute is ideal.
*   **Transitions:** Don't pause awkwardly between speakers. As one person says their last few words, the next person should take a breath and be ready to speak immediately.
