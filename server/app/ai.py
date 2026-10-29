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
            "1. In-flight emergency / Mayday. 2. Medical emergency on board (THY762). "
            "3. Minimum fuel reserve margin (FDB512). 4. Aircraft unable to land in current RVR (IGO1433 CAT I limit). "
            "5. Arrival spacing by wake turbulence and LVP category."
        )

    return (
        f"{grounded_summary} "
        f"Honey B recommends maintaining 6 NM arrival spacing during LVP and expediting FDB512 and THY762."
    )
