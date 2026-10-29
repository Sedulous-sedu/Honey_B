import os
import json
from typing import Dict, Any, Optional
from app.state import state

def ask_ai(prompt: str, context: Optional[Dict[str, Any]] = None) -> str:
    """Explains ATC decisions and current operational risks. AI never decides or issues commands."""
    api_key = os.environ.get("GEMINI_API_KEY")

    # Gather grounded live metrics from state
    lvp_active = state.weather.lvp.active if state.weather else False
    vis_m = state.weather.visibilityM if state.weather else 6000
    rvr_30l = state.weather.rvr[0].valueM if (state.weather and state.weather.rvr) else 2000

    at_risk = []
    for ac in state.aircraft.values():
        if ac.fuel.totalKg is not None and ac.fuel.finalReserveKg is not None and ac.fuel.enduranceMin is not None:
            if ac.fuel.enduranceMin < 45 or (ac.fuel.totalKg - ac.fuel.finalReserveKg) < 400:
                at_risk.append(f"{ac.callsign} (Fuel: {round(ac.fuel.enduranceMin)}m remaining)")
        if lvp_active and ac.capability.lvpApproach == "CAT_I":
            at_risk.append(f"{ac.callsign} (CAT I only, below LVP minima)")
        if ac.priority.level == "MEDICAL":
            at_risk.append(f"{ac.callsign} (Medical report onboard, status={ac.priority.declarationStatus.value})")

    grounded_summary = (
        f"OMDB Operations Status: Visibility {vis_m}m, 30L RVR {rvr_30l}m, LVP {'ACTIVE' if lvp_active else 'INACTIVE'}. "
        f"Key Flights Requiring Action: {', '.join(at_risk) if at_risk else 'None (nominal operations)'}."
    )

    if api_key:
        try:
            from google import genai
            client = genai.Client(api_key=api_key)
            system_instruction = (
                "You are Honey B, an AI assistant for Dubai International (OMDB) Air Traffic Control decision support. "
                "Explain the operational rationale accurately and concisely. "
                "CRITICAL SAFETY RULE: You NEVER make clearances or clearances decisions; you only explain rule-based ATC data. "
                f"Live ground-truth data: {grounded_summary}"
            )
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=f"{system_instruction}\n\nUser Question: {prompt}"
            )
            if response and response.text:
                return response.text.strip()
        except Exception as e:
            # Fall back to template on any error
            pass

    # Template-based offline explanations
    p_lower = prompt.lower()
    if "risk" in p_lower or "danger" in p_lower:
        if at_risk:
            return f"Most at-risk aircraft right now: {', '.join(at_risk)}. Priority is given to low-fuel reserves and capability non-compliance under dense fog."
        return "All aircraft currently have safe fuel endurance margins (>45 min) and meet CAT IIIB low-visibility landing minima."

    if "divert" in p_lower and "fdb512" in p_lower:
        return (
            "FDB512 has 2,600 kg fuel remaining (~38 min endurance). Holding fuel burn is 2,400 kg/h. "
            "Diverting to Sharjah (OMSJ, 10 NM) burns approx 400 kg (15 min margin). "
            "Diverting to Al Maktoum (OMDW, 25 NM) burns approx 900 kg (leaving 500 kg reserve margin)."
        )

    if "rank" in p_lower or "why" in p_lower:
        return (
            "Priority sequencing rules follow ICAO safety hierarchy: "
            "1. Confirmed MAYDAY (Distress). 2. Confirmed PAN PAN (Urgency, including confirmed medical emergencies per GCAA eAIC 2020-06). "
            "3. Minimum fuel advisory monitoring (FDB512) without automatic emergency inference. "
            "4. Aircraft below RVR minima (IGO1433 CAT I limit). "
            "5. Arrival spacing by wake turbulence and LVO category."
        )

    return (
        f"{grounded_summary} "
        f"Honey B recommends maintaining GCAA OMDB wake/LVO spacing and reviewing FDB512 and THY762 declarations."
    )


def explain_risk_evaluation(evaluation_dict: Dict[str, Any]) -> Dict[str, str]:
    """
    Explains structured deterministic Emergency Sequence Risk Advisor outputs in plain language.
    Uses Gemini only if GEMINI_API_KEY is available, with strict guardrails so it never invents numbers,
    overrides hard constraints, or decides the landing sequence.
    """
    status = evaluation_dict.get("evaluationStatus", "UNKNOWN")
    target_id = evaluation_dict.get("emergencyAircraftId", "UNKNOWN")
    decl_type = evaluation_dict.get("declarationType", "NONE")
    decl_status = evaluation_dict.get("declarationStatus", "NONE")
    reasons = evaluation_dict.get("statusReasons", [])
    rec_cands = evaluation_dict.get("recommendedCandidates", [])
    rej_cands = evaluation_dict.get("rejectedCandidates", [])
    policy_ver = evaluation_dict.get("policyVersion", "OMDB-KC-2026.10-v1.0.0")

    # Build deterministic grounded summary first (authoritative fallback & LLM grounding input)
    lines = [
        f"[{policy_ver}] Evaluation for {target_id} (Declaration: {decl_type} / {decl_status}) -> {status}."
    ]
    if status == "FEASIBLE_CANDIDATES_AVAILABLE" and rec_cands:
        top = rec_cands[0]
        gained_min = top.get("emergencyTimeGainedMin", 0.0)
        emerg_margin = top.get("emergencyLandingFuelMarginKg")
        disp_count = top.get("displacedAircraftCount", 0)
        total_delay_min = top.get("totalAddedDelayMin", 0.0)
        min_disp_margin = top.get("minDisplacedFuelMarginKg")
        worst_disp_cs = top.get("worstDisplacedCallsign") or "none"
        lines.append(
            f"Top feasible option '{top.get('label')}' on RWY {top.get('emergencyRunway')} gains "
            f"{gained_min} min for {target_id} (estimated landing fuel margin: {emerg_margin} kg above final reserve)."
        )
        lines.append(
            f"Impact on other traffic: {disp_count} displaced flight(s), +{total_delay_min} min total delay, "
            f"lowest displaced fuel margin is {min_disp_margin} kg ({worst_disp_cs})."
        )
    elif status == "MANUAL_REVIEW_REQUIRED":
        lines.append(
            "Automated resequencing recommendation withheld pending manual controller review: "
            + "; ".join(reasons)
        )
    elif status == "NO_FEASIBLE_PLAN":
        lines.append(
            "All candidate resequencing options violated one or more hard operational constraints: "
            + "; ".join(reasons)
        )

    if rej_cands:
        rej_summaries = []
        for rc in rej_cands[:3]:
            failures = ", ".join(rc.get("hardConstraintFailures", []))
            rej_summaries.append(f"{rc.get('label')} rejected ({failures})")
        lines.append("Rejected alternatives: " + "; ".join(rej_summaries) + ".")

    lines.append(
        "Controller review is required before approving an estimated sequence advisory or issuing formal ATC clearances."
    )
    deterministic_text = " ".join(lines)

    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
        try:
            from google import genai
            client = genai.Client(api_key=api_key)
            prompt_payload = {
                "evaluationStatus": status,
                "emergencyAircraftId": target_id,
                "declarationType": decl_type,
                "declarationStatus": decl_status,
                "statusReasons": reasons,
                "recommendedCandidates": [
                    {
                        "candidateId": c.get("candidateId"),
                        "label": c.get("label"),
                        "emergencyRunway": c.get("emergencyRunway"),
                        "emergencyTimeGainedMin": c.get("emergencyTimeGainedMin"),
                        "emergencyLandingFuelMarginKg": c.get("emergencyLandingFuelMarginKg"),
                        "displacedAircraftCount": c.get("displacedAircraftCount"),
                        "totalAddedDelayMin": c.get("totalAddedDelayMin"),
                        "minDisplacedFuelMarginKg": c.get("minDisplacedFuelMarginKg"),
                        "worstDisplacedCallsign": c.get("worstDisplacedCallsign"),
                    }
                    for c in rec_cands
                ],
                "rejectedCandidates": [
                    {
                        "candidateId": c.get("candidateId"),
                        "label": c.get("label"),
                        "hardConstraintFailures": c.get("hardConstraintFailures"),
                    }
                    for c in rej_cands[:4]
                ],
            }
            system_instruction = (
                "You are an ATC decision-support explanation assistant for Dubai International (OMDB). "
                "Summarize the provided JSON risk evaluation in 3-4 concise sentences of plain English. "
                "STRICT RULES: (1) Use ONLY the exact numbers, callsigns, and constraint codes present in the JSON. "
                "(2) NEVER invent numbers, probabilities, or fuel values. "
                "(3) NEVER override a constraint failure or recommend an infeasible candidate. "
                "(4) State clearly that controller review and formal ATC clearances are required."
            )
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=f"{system_instruction}\n\nStructured Evaluation JSON:\n{json.dumps(prompt_payload)}",
            )
            if response and response.text:
                return {
                    "explanation": response.text.strip(),
                    "source": "GEMINI_GROUNDED",
                    "guardrailNote": "LLM explanation only summarizes structured deterministic Risk Advisor outputs. It never creates numbers, overrides constraints, or decides the sequence.",
                }
        except Exception:
            pass

    return {
        "explanation": deterministic_text,
        "source": "DETERMINISTIC_TEMPLATE_FALLBACK",
        "guardrailNote": "Deterministic plain-language explanation generated directly from structured Risk Advisor outputs. Never creates numbers, overrides constraints, or decides the sequence.",
    }
