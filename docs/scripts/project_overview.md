# Project Overview: IDRN (Intelligent Dead Reckoning Navigation System)

The project you have cloned is an **AI-ML based Intelligent Dead Reckoning Navigation System**, designed as a prototype for **SIH (Smart India Hackathon) 2026**. 

It is a web-based dashboard and simulation environment (built using HTML, CSS, JavaScript, and Leaflet for mapping) that demonstrates a robust, continuous navigation pipeline capable of maintaining accurate position tracking even when GNSS (GPS) signals are lost. 

## 🏗️ Architecture & Pipeline

The system is built as a modular pipeline that processes sensor data step-by-step:

1. **Hardware Abstraction Layer (HAL)** 
   Can accept data from a simulation engine or real device sensors (smartphone IMU).
2. **Sensor Processing & Filtering (Step 3)**
   - Pre-processes raw Accelerometer, Gyroscope, and Magnetometer data.
   - Includes sensor calibration, noise filtering (EMA), and shock/vibration detection (e.g., detecting potholes).
3. **Dead Reckoning Engine (Step 4)**
   - Calculates speed, travel distance, heading, and position drift using the deterministic baseline data.
4. **Offline Map Matching (Step 5)**
   - Applies road constraints to the calculated position.
   - Computes lateral deviation and applies soft corrections to align the estimated position with known road geometries.
5. **GNSS + INS Sensor Fusion (Step 6)**
   - Uses an Adaptive Weighted Fusion algorithm to intelligently blend GNSS data, Inertial Navigation System (INS/DR) data, and map matching constraints.
   - Features dynamic weight allocation depending on the availability and confidence of GNSS.
6. **AI Modules**
   - **Handheld Compensation**: Adjusts for device orientation and vehicle frame alignment.
   - **AI Motion Estimator & Drift Correction**: Machine learning models to estimate motion and minimize cumulative drift over time.

## 📂 Codebase Structure

- **`index.html`**: The main dashboard UI, featuring map rendering, sensor status panels, metrics, charts, and pipeline visualization.
- **`css/styles.css`**: Styling for the dashboard, utilizing modern UI design with cards, badges, and grids.
- **`js/`**: Contains the core logic separated into modules:
  - `app.js`, `engine.js`, `ui.js`, `config.js`: Core application setup, rendering, state management, and configuration.
  - `sensors-manager.js`, `sensor-processing.js`: Handles data ingestion from real/simulated hardware and applies filters.
  - `dead-reckoning.js`: Core physics and math for calculating position based on IMU data.
  - `map-matching.js`: Logic to snap the estimated coordinates to mapped roads.
  - `sensor-fusion.js`: Blends different location estimations to provide the most accurate read.
  - `handheld-compensation.js`, `ai-motion-estimator.js`, `ai-drift-correction.js`: Advanced AI/ML components to correct orientation, motion, and drift.
  - `accuracy-benchmark.js`: Computes and logs the error/drift over time for diagnostic benchmarking.

## 🚀 Key Features

- **Real-Time Simulation**: A control panel allows you to simulate GNSS loss, inject outliers, adjust speeds, and trigger road shocks.
- **Dynamic Feedback**: Visual readouts of system health, confidence scores, lateral deviation, and live charts comparing raw vs. filtered data.
- **Fallback Mechanism**: Seamlessly transitions from GNSS-dominant tracking to DR/INS when signals are lost, demonstrating the core value proposition of the system.
