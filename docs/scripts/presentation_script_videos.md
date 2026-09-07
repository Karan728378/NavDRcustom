# SIH 2026 Pitch Script: NavDR (Modular Video Format)

**Format:** 6 separate video clips to be stitched together.
**Target Duration:** ~30-35 seconds per video clip (Total: ~3.5 minutes).
**Style:** Self-sufficient clips. No "handing off" to the next person. Each person starts with a quick introduction and speaks directly to the camera (or does a voiceover on a screen recording).

---

### **Video 1: The Problem (Speaker 1)**
*(Visual Idea: Speaker talking, possibly with a B-roll or graphic of a car entering a tunnel and losing GPS).*
"Hello, my name is **[Your Name]**, and I am the Team Lead for this project. The challenge for Problem Statement 26168 is maintaining navigation without GNSS. Modern navigation breaks down the moment you enter a tunnel, parking garage, or urban canyon. When GNSS signals drop, traditional smartphone apps freeze. If they try to rely purely on the phone's internal sensors, the position drifts wildly within seconds due to compounding errors. We needed an intelligent Dead Reckoning system that works without relying on expensive, dedicated vehicle hardware."

### **Video 2: The Solution Overview (Speaker 2)**
*(Visual Idea: Show the main NavDR Dashboard zooming in on the "Outage accuracy" section).*
"Hi, I'm **[Your Name]**. Our solution to this problem is **NavDR**. We have built an AI-augmented Intelligent Dead Reckoning system that works entirely on a standard Android smartphone. Our pipeline completely abandons traditional physics-based dead reckoning. Instead, we combine a Temporal Convolutional Network to predict velocity, a Planar Extended Kalman Filter for sensor fusion, and a Hidden Markov Model to mathematically snap the trajectory to legal road geometries. The result? NavDR achieves less than 10% drift during total GNSS denial."

### **Video 3: Feature Deep Dive - AI Velocity (Speaker 3)**
*(Visual Idea: Screen recording of the "Trajectory error" plot showing the blue and red lines).*
"Hello, my name is **[Your Name]**, and I am the AI Engineer on this project. To solve the rapid drift caused by cheap smartphone sensors, we built a Temporal Convolutional Network—or TCN. This lightweight, 50,000-parameter neural network listens to the phone’s accelerometer and gyroscope at 100 Hertz. Instead of multiplying noisy sensor data, our AI learns the complex vibration patterns of human driving to directly and accurately predict forward velocity. This completely eliminates the exponential drift that plagues classical double-integration methods."

### **Video 4: Feature Deep Dive - Sensor Fusion & EKF (Speaker 4)**
*(Visual Idea: Screen recording pointing to the "EKF 95% radius" updating in real-time).*
"Hi, I'm **[Your Name]**, specializing in Sensor Fusion. Speed estimation must be paired with precise heading and orientation. We achieve this using a rigorous Planar Extended Kalman Filter, or EKF. The EKF acts as the mathematical core of our system, gracefully blending the AI’s speed predictions with raw inertial data. Crucially, it maintains a true covariance matrix to generate a strict 95% uncertainty radius. This real-time confidence metric allows our system to reject wild GPS multi-path spikes before they can corrupt the user's route."

### **Video 5: Feature Deep Dive - Map Matching (Speaker 5)**
*(Visual Idea: Screen recording showing the vehicle locking onto the road network, highlighting the "Match status" text).*
"Hello, I'm **[Your Name]**, our Mapping Engineer. Even with AI and an EKF, minor drift is inevitable over extended outages. To counter this, we utilize Offline Map Matching. We don't just snap to the nearest line—we employ a Hidden Markov Model powered by the Viterbi algorithm. This system evaluates sequences of road candidates against imported OpenStreetMap graphs. By calculating transition probabilities and mathematically constraining our trajectory to legal road bounds, we actively pull lateral deviation down to meet the strict SIH targets."

### **Video 6: Validation & NavIC Integration (Speaker 6)**
*(Visual Idea: Screen recording scrolling down to the "Run evidence" ablation table, then pointing to the NavIC status).*
"Hi, I'm **[Your Name]**, our Test and Deployment Strategist. To prove the robustness of our architecture, we built a rigorous evaluation workbench directly into our prototype. We can run 'ablations' on recorded trajectories—toggling the AI, EKF, and HMM independently to measure their exact impact on drift reduction. Furthermore, for real-world deployment, our Android application actively monitors NavIC Carrier-to-Noise degradation. This allows NavDR to trigger a proactive transition to Dead Reckoning *before* an outage even occurs, ensuring uninterrupted resilience on Indian roads."

---

### 💡 **Tips for Recording Separately:**
*   **Fill in the Blanks:** Don't forget to replace **[Your Name]** with your actual name! You can also adjust the job title if your team prefers different designations.
*   **Screen Recordings:** Since you are remote, the easiest way to do this is for each person to record their screen using OBS or Zoom while they talk over the dashboard feature they are explaining. 
*   **Energy Levels:** Because you aren't feeding off each other in the same room, make sure everyone starts their clip with high energy!
*   **Editing:** When stitching these together, use a simple crossfade or a 1-second title card between clips (e.g., a card that says *"2. The NavDR Solution"* before Video 2 plays).
