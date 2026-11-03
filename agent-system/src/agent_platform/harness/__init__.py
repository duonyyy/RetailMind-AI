import uuid
from typing import Optional, Dict, Any, AsyncIterator, Literal
from langgraph.checkpoint.memory import MemorySaver
from agent_platform.config.settings import PlatformSettings
from agent_platform.domain.pack import DomainPack
from agent_platform.harness.state.principal import Principal
from agent_platform.harness.state.contracts import AgentState
from agent_platform.harness.tools.registry import ToolRegistry
from agent_platform.harness.tools.executor import ToolExecutor
from agent_platform.harness.tools.idempotency import IdempotencyManager
from agent_platform.harness.tools.builtin.search_knowledge import search_knowledge
from agent_platform.harness.governance.policy import PolicyEngine
from agent_platform.harness.governance.audit_ledger import TamperEvidentHashChainLedger
from agent_platform.harness.hitl.approval_store import ApprovalStore, ApprovalRequest
from agent_platform.harness.observability.finops import FinOpsLedger
from agent_platform.harness.memory import EnterpriseMemoryManager
from agent_platform.harness.persistence.memory.adapter import MemoryKVStore
from agent_platform.harness.persistence.sqlite.adapter import SqliteKVStore
from agent_platform.harness.persistence.postgres.adapter import PostgresKVStore
from agent_platform.harness.persistence.redis.adapter import RedisKVStore
from agent_platform.harness.persistence.checkpointer import create_checkpointer
from agent_platform.agents.workflow import (
    build_orchestration_graph,
    OrchestratorRunner,
)
from agent_platform.llm.base import LLMPort, Usage
from agent_platform.llm.providers.scripted import ScriptedLLM
from agent_platform.llm.providers.mock import MockLLMClient
from agent_platform.llm.providers.openai_compat import OpenAICompatibleLLM
from agent_platform.llm.providers.gemini import GeminiLLM
from agent_platform.llm.resilient import ResilientLLMClient
from agent_platform.harness.guards.pii import PIIMasker


class AgentHarness:
    """
    Central Controller for the 10-layer Enterprise Agent Platform.
    Adheres to: Agent = Model + Harness.
    """

    def __init__(self, settings: PlatformSettings, pack: DomainPack) -> None:
        self.settings = settings
        self.pack = pack

        # 1. Persistence Adapter (memory | sqlite | postgres | redis)
        adapter_type = settings.persistence.adapter
        pg_url = settings.persistence.postgres_url
        pg_schema = getattr(settings.persistence, "postgres_schema", "agent")
        if adapter_type == "sqlite":
            self.kv_store = SqliteKVStore(settings.persistence.sqlite_path)
        elif adapter_type == "postgres":
            self.kv_store = PostgresKVStore(dsn=pg_url, schema=pg_schema)
        elif adapter_type == "redis":
            self.kv_store = RedisKVStore(settings.persistence.redis_url)
        else:
            self.kv_store = MemoryKVStore()

        # 2. Checkpointer (Enterprise Multi-Adapter Persistent Checkpointer)
        self.checkpointer = create_checkpointer(self.settings)

        # 3. Governance: Policy, Audit & FinOps Ledger
        policy_path = pack.pack_dir / pack.policies if pack.pack_dir else "policies.yaml"
        self.policy_engine = PolicyEngine.load_from_file(policy_path)
        self.audit_ledger = TamperEvidentHashChainLedger(
            dsn=pg_url if adapter_type == "postgres" else "",
            schema=pg_schema,
            adapter="postgres" if adapter_type == "postgres" else "memory",
        )
        self.finops_ledger = FinOpsLedger()

        # 3b. Enterprise Multi-Tier Memory Engine (VinAI Track 3 architecture)
        self.memory = EnterpriseMemoryManager(
            short_term_capacity=pack.limits.max_steps,
            total_context_tokens=pack.limits.context_token_budget,
        )

        # 4. Tools Platform
        self.tool_registry = ToolRegistry()
        self.tool_registry.register(search_knowledge)
        if pack.pack_dir and (pack.pack_dir / pack.tools.module).exists():
            self.tool_registry.load_from_module_file(pack.pack_dir / pack.tools.module)

        self.idempotency = IdempotencyManager(
            dsn=pg_url if adapter_type == "postgres" else "",
            schema=pg_schema,
            adapter="postgres" if adapter_type == "postgres" else "memory",
        )
        self.tool_executor = ToolExecutor(
            registry=self.tool_registry,
            policy_engine=self.policy_engine,
            audit_ledger=self.audit_ledger,
            idempotency_manager=self.idempotency,
        )

        # 5. HITL Store
        self.approval_store = ApprovalStore(self.kv_store)

        # 6. LLM Subsystem
        self.llm = self._create_llm_client()

        # 7. Orchestration Graph & Runner
        self.compiled_graph = build_orchestration_graph(
            pack=self.pack,
            llm=self.llm,
            registry=self.tool_registry,
            executor=self.tool_executor,
            checkpointer=self.checkpointer,
        )
        self.runner = OrchestratorRunner(self.compiled_graph)

    def _create_llm_client(self) -> LLMPort:
        provider = self.settings.llm.provider
        if provider == "scripted":
            client = ScriptedLLM(model_name=self.settings.llm.model_name)
            client.queue_answer("Dạ hệ thống đã nhận được câu hỏi và sẵn sàng hỗ trợ.")
            return client
        elif provider == "mock":
            return MockLLMClient(model_name=self.settings.llm.model_name)
        elif provider == "openai_compat":
            primary = OpenAICompatibleLLM(
                base_url=self.settings.llm.base_url or "https://api.openai.com/v1",
                api_key=self.settings.llm.api_key,
                model_name=self.settings.llm.model_name,
                timeout_seconds=self.settings.llm.timeout_seconds,
            )
            return ResilientLLMClient(primary_client=primary)
        elif provider == "gemini":
            primary = GeminiLLM(
                api_key=self.settings.llm.api_key,
                model_name=self.settings.llm.model_name,
                timeout_seconds=self.settings.llm.timeout_seconds,
            )
            return ResilientLLMClient(primary_client=primary)
        return MockLLMClient()

    async def execute(
        self,
        query: str,
        principal: Principal,
        thread_id: Optional[str] = None,
        operation_id: Optional[str] = None,
    ) -> AgentState:
        """Executes full agent reasoning cycle, records FinOps telemetry, updates memory, and returns completed state."""
        session_key = thread_id or f"thread_{uuid.uuid4().hex[:12]}"
        user_id = principal.user_id if principal else None

        if principal and principal.role != "guest":
            owner_key = f"chat_owner:{session_key}"
            existing_owner = await self.kv_store.get(owner_key)
            if existing_owner is None:
                if hasattr(self.kv_store, "claim_or_verify_thread_owner"):
                    claimed = await self.kv_store.claim_or_verify_thread_owner(
                        thread_id=session_key,
                        user_id=principal.user_id,
                        tenant_id=principal.tenant_id,
                        role=principal.role,
                    )
                    if (
                        claimed.get("user_id") != principal.user_id
                        or claimed.get("tenant_id") != principal.tenant_id
                    ):
                        raise PermissionError(
                            "Access denied: thread belongs to another principal."
                        )
                else:
                    await self.kv_store.set(
                        owner_key,
                        {
                            "user_id": principal.user_id,
                            "tenant_id": principal.tenant_id,
                        },
                    )
            elif (
                not isinstance(existing_owner, dict)
                or existing_owner.get("user_id") != principal.user_id
                or existing_owner.get("tenant_id") != principal.tenant_id
            ):
                raise PermissionError(
                    "Access denied: thread belongs to another principal."
                )

        context_tuple = self.memory.retrieve_merged_context(
            user_id=user_id or "",
            session_id=session_key,
            query=query,
        )
        mem_ctx = context_tuple[0] if isinstance(context_tuple, tuple) else context_tuple

        state = await self.runner.execute(
            query=query,
            principal=principal,
            thread_id=session_key,
            memory_context=mem_ctx if mem_ctx else None,
            operation_id=operation_id,
            require_operation_id=True,
        )

        # Persist HITL approval request durably whenever workflow pauses for approval
        if state.get("status") == "awaiting_approval":
            t_call = state.get("approval_call") or {}
            if (t_call.get("name") != "request_return_or_refund"
                    or not t_call.get("id") or not principal or principal.role == "guest"):
                state["status"] = "abstained"
                state["final_answer"] = "Không thể tạo yêu cầu phê duyệt an toàn."
                return state
            t_name = t_call["name"]
            t_args = {**t_call.get("arguments", {}), "call_id": t_call["id"],
                      "policy_rule": t_call.get("rule"), "intent_complete": False}
            run_id_val = state.get("run_id", f"run_{uuid.uuid4().hex[:6]}")
            req = await self.approval_store.create_request(
                thread_id=session_key,
                run_id=run_id_val,
                tool_name=t_name,
                arguments=t_args,
                approver_role="admin",
                requester_user_id=principal.user_id if principal else None,
                requester_tenant_id=principal.tenant_id if principal else None,
            )
            state["approval_id"] = req.approval_id  # type: ignore[typeddict-unknown-key]

        # Update Tier 1 working memory turns (masked to prevent raw PII accumulation)
        self.memory.add_working_turn(session_key, "user", PIIMasker.mask(query, fail_closed=False))
        if ans_text := state.get("final_answer"):
            self.memory.add_working_turn(session_key, "assistant", PIIMasker.mask(ans_text, fail_closed=False))

        # Record FinOps usage in Decimal ledger
        ans_text = state.get("final_answer") or ""
        prompt_toks = max(12, len(query.split()) * 4)
        comp_toks = max(8, len(ans_text.split()) * 3)
        usage = Usage(
            prompt_tokens=prompt_toks,
            completion_tokens=comp_toks,
            total_tokens=prompt_toks + comp_toks,
        )
        self.finops_ledger.record_usage(
            thread_id=state.get("thread_id", thread_id or "default_thread"),
            run_id=state.get("run_id", "default_run"),
            model=self.settings.llm.model_name or "default",
            provider=self.settings.llm.provider,
            usage=usage,
        )
        return state

    async def get_thread_state(
        self, thread_id: str, principal: Principal
    ) -> Optional[Dict[str, Any]]:
        """Loads durable checkpoint state for `thread_id` after verifying principal ownership."""
        if not principal or principal.role == "guest":
            raise PermissionError("Anonymous principal cannot reload persisted threads.")
        owner = await self.kv_store.get(f"chat_owner:{thread_id}")
        if (
            not isinstance(owner, dict)
            or owner.get("user_id") != principal.user_id
            or owner.get("tenant_id") != principal.tenant_id
        ):
            raise PermissionError("Access denied: thread belongs to another principal.")

        cp_tuple = await self.checkpointer.aget_tuple(
            {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}}
        )
        if cp_tuple is None:
            return None
        return cp_tuple.checkpoint.get("channel_values", {})

    async def aclose(self) -> None:
        """Closes checkpointer pools and underlying persistence resources."""
        if hasattr(self.checkpointer, "aclose"):
            await self.checkpointer.aclose()

    async def resolve_and_resume_hitl(
        self,
        approval_id: str,
        decision: Literal["approved", "rejected"],
        approver: Principal,
        note: str = "",
    ) -> Dict[str, Any]:
        """Record a decision only. No backend execution or graph resume is enabled."""
        if approver.role != "admin":
            raise PermissionError("Admin authorization required.")
        current = await self.approval_store.get_request(approval_id)
        if (not current or not current.requester_user_id or
                current.requester_tenant_id != approver.tenant_id):
            raise KeyError("Approval not found.")
        owner = await self.kv_store.get(f"chat_owner:{current.thread_id}")
        if not isinstance(owner, dict) or owner.get("user_id") != current.requester_user_id or owner.get("tenant_id") != current.requester_tenant_id:
            raise KeyError("Approval not found.")
        # Existing records lack a complete immutable intent. Never let a reviewer
        # attest to an action whose exact contents cannot be established.
        if decision == "approved":
            raise PermissionError("Approval unavailable: complete intent and backend authorization are not available.")
        if current.status != "pending":
            if current.status == decision and current.decision_by == approver.user_id:
                return {"approval": current, "resumed_output": None}
            raise ValueError("Approval request is already resolved.")
        resolved: ApprovalRequest = await self.approval_store.resolve(
            approval_id=approval_id,
            decision=decision,
            approver_user_id=approver.user_id,
            note=note,
        )

        self.audit_ledger.record_event(
            event_id=f"audit_hitl_{approval_id}",
            thread_id=resolved.thread_id,
            user_id=approver.user_id,
            role="admin",
            tenant_id=approver.tenant_id,
            tool_name=resolved.tool_name,
            input_masked={"approval_id": approval_id, "decision": decision, "note": PIIMasker.mask(note, fail_closed=False)},
            decision=f"hitl_{decision}",
        )

        return {
            "approval": resolved,
            "resumed_output": None,
        }
