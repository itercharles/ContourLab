# Risk Management Plan

**Standard:** ISO 14971:2019, IEC 62304:2006+AMD1:2015 §4.2, IEC 82304-1:2016 §5
**Status:** Active

## 1. Scope

This risk management plan covers ContourLab across its full lifecycle: development, release,
post-market maintenance, and retirement.

Lifecycle phases in scope: design, implementation, verification, validation, release,
and post-production surveillance.

## 2. Intended Use and Reasonably Foreseeable Misuse

**Intended use:** ContourLab is used by qualified radiation therapy treatment planners to
create, review, and export radiation treatment plans for cancer patients. The software
assists in contouring anatomical structures, defining beam geometry, calculating dose
distributions, and generating DICOM-RT objects for delivery.

**Intended users:** Radiation therapy treatment planners, dosimetrists, radiation oncologists.

**Intended environment:** Clinical workstation with modern browser (Chrome/Chromium),
connected to a hospital DICOMweb-compatible PACS or DICOM repository.

**Reasonably foreseeable misuse:**
- Using the system without qualified clinical oversight
- Relying on contour suggestions or dose calculations without independent verification
- Operating on patient data outside of a validated network environment
- Using an unvalidated browser or OS configuration

## 3. Risk Management Responsibilities

A designated risk manager is responsible for overseeing all risk management activities.
All personnel performing risk analysis, risk control, or risk review must demonstrate
competence through relevant education, training, or experience in medical device software.

## 4. Risk Acceptability Criteria

Risk acceptability is determined using a 5×5 severity-probability matrix:

| | Negligible (1) | Minor (2) | Serious (3) | Critical (4) | Catastrophic (5) |
|---|---|---|---|---|---|
| **Improbable (1)** | Acceptable | Acceptable | Acceptable | ALARP | Unacceptable |
| **Remote (2)** | Acceptable | Acceptable | ALARP | Unacceptable | Unacceptable |
| **Occasional (3)** | Acceptable | ALARP | Unacceptable | Unacceptable | Unacceptable |
| **Probable (4)** | ALARP | Unacceptable | Unacceptable | Unacceptable | Unacceptable |
| **Frequent (5)** | Unacceptable | Unacceptable | Unacceptable | Unacceptable | Unacceptable |

**ALARP:** As Low As Reasonably Practicable — risk control required; residual risk must be
justified by clinical benefit.

**Severity scale:**
- Negligible (1): No patient impact
- Minor (2): Reversible minor injury or treatment delay
- Serious (3): Reversible serious injury or significant treatment error
- Critical (4): Irreversible serious injury
- Catastrophic (5): Death or permanent severe disability

## 5. Risk Management Activities

Risk management activities are tracked in ContourLab DHF as:
- **RISK items**: hazard identification, hazard situation, foreseeable sequence of events,
  severity, probability, risk score before control
- **RCM items**: risk control measure, implementation evidence, residual risk after control

All RISK and RCM items are linked to relevant SYS/SRS requirements where applicable.
The traceability chain `RISK → RCM` is checked by `medharness --dhf DHF dhf validate traceability`.

### 5.1 Hazard Identification

Hazards are identified through:
- Review of intended use and foreseeable misuse scenarios
- Analysis of software failure modes by component (see Development Plan §6.1)
- Review of similar device incident reports and literature
- Structured hazard analysis at each major feature addition (triggered by UC/CRS review)

### 5.2 Risk Estimation and Evaluation

Each identified hazard is assigned:
- Severity (1–5) before risk control
- Probability (1–5) before risk control
- Risk score = Severity × Probability → compared to acceptability criteria

### 5.3 Risk Control

Risk controls are implemented as:
- Inherently safe design (architecture decisions that prevent hazard occurrence)
- Protective measures (software safeguards, warnings, confirmations)
- Information for safety (user documentation, labelling, training requirements)

Each RCM item records the control type, implementation evidence, and residual risk.

### 5.4 Residual Risk Evaluation

After all controls are applied:
- Residual risk must be Acceptable or ALARP
- ALARP residual risks require documented benefit justification
- Overall residual risk is evaluated in the risk management report at each release

## 6. Risk Management File

The risk management file comprises:
- This plan
- All RISK items in ContourLab DHF
- All RCM items in ContourLab DHF
- DHF traceability report (generated at each main-branch build)
- Risk management report (generated at each release review)

## 7. Post-Market Surveillance

Post-production feedback is monitored through user-reported issues and incident reports.
Any new hazard identified post-release triggers a CR item and risk re-assessment.
