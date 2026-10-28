import datetime
from typing import Optional, Dict, Any, Tuple
from app.state import state
from app.models import (
    CommandIssuedPayload,
    CommandStatusPayload,
    CommandStatus,
    PilotResponse,
    InstructionType,
    ErrorPayload
)

class CommandManager:
    @staticmethod
    def issue_command(
        aircraft_id: str,
        controller_id: str,
        instruction_type: InstructionType,
        displayText: str,
        params: Dict[str, Any],
        related_suggestion_id: Optional[str] = None,
        bypass_controller_check: bool = False
    ) -> Tuple[Optional[CommandIssuedPayload], Optional[ErrorPayload]]:
        """Issues an ATC command. Enforces single ownership and claims."""
        aircraft = state.aircraft.get(aircraft_id)
        if not aircraft:
            return None, ErrorPayload(code="UNKNOWN_AIRCRAFT", message=f"Aircraft {aircraft_id} not found.")

        # Check controller ownership
        if not bypass_controller_check and aircraft.assignedControllerId:
            if aircraft.assignedControllerId != controller_id:
                ctrl = state.controllers.get(aircraft.assignedControllerId)
                ctrl_name = ctrl["name"] if ctrl else aircraft.assignedControllerId
                return None, ErrorPayload(
                    code="CONTROLLER_CONFLICT",
                    message=f"{aircraft_id} is currently controlled by {ctrl_name} ({aircraft.assignedControllerId})."
                )

        controller = state.controllers.get(controller_id)
        controller_name = controller["name"] if controller else "ATC"

        # Check resource claims
        if instruction_type == InstructionType.RUNWAY_CHANGE:
            new_rwy = params.get("newRunway")
            claim_key = f"runway_slot:{new_rwy}"
            if claim_key in state.claims and state.claims[claim_key]["aircraftId"] != aircraft_id:
                claimant = state.claims[claim_key]["aircraftId"]
                return None, ErrorPayload(
                    code="RESOURCE_CONFLICT",
                    message=f"Runway {new_rwy} approach slot is currently reserved for {claimant}."
                )
            state.claims[claim_key] = {"aircraftId": aircraft_id, "controllerId": controller_id, "claimedAt": state.get_sim_time_iso()}

        # Supersede any existing pending/executing command of the same instruction type
        superseded_cmd_id = None
        for existing_id, cmd in list(state.commands.items()):
            if cmd.aircraftId == aircraft_id and cmd.status in [CommandStatus.SENT, CommandStatus.STANDBY]:
                superseded_cmd_id = existing_id
                CommandManager.supersede_command(existing_id, reason="Replaced by new controller instruction")

        cmd_id = state.next_command_id()
        issued_at = state.get_sim_time_iso()
        # Default 90 seconds expiry
        t_exp = state.sim_start_time + datetime.timedelta(seconds=state.sim_time_sec + 90)
        expires_at = t_exp.strftime("%Y-%m-%dT%H:%M:%SZ")

        cmd = CommandIssuedPayload(
            commandId=cmd_id,
            aircraftId=aircraft_id,
            source="ATC",
            controllerId=controller_id,
            controllerName=controller_name,
            instructionType=instruction_type,
            targetAltitudeFt=params.get("targetAltitudeFt"),
            targetHeadingDeg=params.get("targetHeadingDeg"),
            turnDirection=params.get("turnDirection"),
            targetSpeedKt=params.get("targetSpeedKt"),
            fix=params.get("fix"),
            holdAltitudeFt=params.get("holdAltitudeFt"),
            expectFurtherClearanceUtc=params.get("expectFurtherClearanceUtc"),
            legTimeMin=params.get("legTimeMin"),
            newRunway=params.get("newRunway"),
            newApproach=params.get("newApproach"),
            approach=params.get("approach"),
            runway=params.get("runway"),
            windText=params.get("windText"),
            alternateIcao=params.get("alternateIcao"),
            routeText=params.get("routeText"),
            text=params.get("text"),
            displayText=displayText,
            allowedResponses=["WILCO", "UNABLE", "STANDBY"] if instruction_type != InstructionType.INFORMATION else [],
            status=CommandStatus.SENT,
            issuedAt=issued_at,
            expiresAt=expires_at,
            supersedes=superseded_cmd_id,
            relatedSuggestionId=related_suggestion_id
        )

        state.commands[cmd_id] = cmd
        state.command_history.insert(0, cmd.model_dump())
        state.log_event("ATC", f"Command {cmd_id} issued to {aircraft_id}: '{displayText}' by {controller_name}.")

        return cmd, None

    @staticmethod
    def handle_pilot_response(
        command_id: str,
        aircraft_id: str,
        response: PilotResponse,
        reason_text: Optional[str] = None
    ) -> Tuple[Optional[CommandStatusPayload], Optional[ErrorPayload]]:
        cmd = state.commands.get(command_id)
        if not cmd:
            return None, ErrorPayload(code="UNKNOWN_COMMAND", message=f"Command {command_id} not found.", commandId=command_id)

        if cmd.status not in [CommandStatus.SENT, CommandStatus.STANDBY]:
            return None, ErrorPayload(
                code="COMMAND_NOT_AWAITING_RESPONSE",
                message=f"Command {command_id} is in {cmd.status} status and not awaiting response.",
                commandId=command_id
            )

        prev_status = cmd.status
        changed_at = state.get_sim_time_iso()

        if response == PilotResponse.WILCO:
            cmd.status = CommandStatus.ACKNOWLEDGED
            state.log_event("PILOT", f"{aircraft_id} acknowledged {command_id} with WILCO.")
        elif response == PilotResponse.UNABLE:
            cmd.status = CommandStatus.UNABLE
            state.log_event("PILOT", f"{aircraft_id} responded UNABLE to {command_id}. Reason: {reason_text or 'No reason'}.")
        elif response == PilotResponse.STANDBY:
            cmd.status = CommandStatus.STANDBY
            state.log_event("PILOT", f"{aircraft_id} requested STANDBY for {command_id}.")

        status_payload = CommandStatusPayload(
            commandId=command_id,
            status=cmd.status,
            previousStatus=prev_status,
            response=response,
            reason=reason_text,
            supersededBy=None,
            changedAt=changed_at
        )
        return status_payload, None

    @staticmethod
    def supersede_command(command_id: str, new_command_id: Optional[str] = None, reason: str = "Superseded") -> Optional[CommandStatusPayload]:
        cmd = state.commands.get(command_id)
        if not cmd:
            return None
        prev_status = cmd.status
        cmd.status = CommandStatus.SUPERSEDED
        changed_at = state.get_sim_time_iso()
        state.log_event("ATC", f"Command {command_id} superseded by {new_command_id or 'newer command'}.")
        return CommandStatusPayload(
            commandId=command_id,
            status=CommandStatus.SUPERSEDED,
            previousStatus=prev_status,
            response=None,
            reason=reason,
            supersededBy=new_command_id,
            changedAt=changed_at
        )

    @staticmethod
    def cancel_command(command_id: str, reason: str = "Cancelled by controller") -> Optional[CommandStatusPayload]:
        cmd = state.commands.get(command_id)
        if not cmd:
            return None
        prev_status = cmd.status
        cmd.status = CommandStatus.CANCELLED
        changed_at = state.get_sim_time_iso()
        state.log_event("ATC", f"Command {command_id} cancelled by controller.")
        return CommandStatusPayload(
            commandId=command_id,
            status=CommandStatus.CANCELLED,
            previousStatus=prev_status,
            response=None,
            reason=reason,
            supersededBy=None,
            changedAt=changed_at
        )

    @staticmethod
    def check_expirations():
        now_dt = state.sim_start_time + datetime.timedelta(seconds=state.sim_time_sec)
        for cmd_id, cmd in list(state.commands.items()):
            if cmd.status in [CommandStatus.SENT, CommandStatus.STANDBY]:
                exp_dt = datetime.datetime.fromisoformat(cmd.expiresAt.replace("Z", "+00:00"))
                if now_dt > exp_dt:
                    prev = cmd.status
                    cmd.status = CommandStatus.EXPIRED
                    state.log_event("SYSTEM", f"Command {cmd_id} expired with no pilot response within 90s.")
