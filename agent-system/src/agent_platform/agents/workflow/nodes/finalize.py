from agent_platform.harness.state.contracts import AgentState
from agent_platform.harness.guards.output_guard import OutputGuardrail

def finalize_node(state: AgentState) -> dict:
    """Finalizes verified output, sanitizes exfiltration links and formats citations."""
    raw_answer = state.get("final_answer") or ""
    evidence = state.get("matched_evidence", [])

    if evidence and "Nguồn trích dẫn:" not in raw_answer:
        sources = list(dict.fromkeys(ev.source_document for ev in evidence))
        citation_str = "\n\n**Nguồn trích dẫn:** " + ", ".join(sources)
        raw_answer += citation_str

    # Apply Output Guardrail (blocks markdown image exfiltration, secret leaks & phishing)
    final_answer = OutputGuardrail.sanitize(raw_answer)

    return {
        "final_answer": final_answer,
        "status": "done",
    }

