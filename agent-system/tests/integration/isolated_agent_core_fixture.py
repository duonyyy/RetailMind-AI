"""Invoked only by the disposable Core/PostgreSQL fixture; uses a scripted model."""
import asyncio
import os
from pathlib import Path

from agent_platform.agents.workflow.builder import build_agent_graph
from agent_platform.agents.workflow.runner import AgentRunner
from agent_platform.domain.pack import DomainPack
from agent_platform.harness.governance.policy import PolicyEngine
from agent_platform.harness.state.principal import Principal
from agent_platform.harness.tools.executor import ToolExecutor
from agent_platform.harness.tools.registry import ToolRegistry
from agent_platform.llm.providers.scripted import ScriptedLLM
from agent_platform.request_credentials import _authorization


async def main():
    domain = Path('domains/retail_store')
    pack = DomainPack.load_from_dir(domain)
    principal = Principal(user_id=os.environ['FIXTURE_CUSTOMER'], role='customer')
    authorization = _authorization.set('Bearer ' + os.environ['FIXTURE_TOKEN'])
    try:
        for call_id in ('first-call', 'after-agent-restart'):
            registry = ToolRegistry()
            registry.load_from_module_file(domain / 'tools.py')
            llm = ScriptedLLM()
            llm.queue_tool_call('create_support_ticket', {
                'order_id': 'ORDER-FIXTURE', 'title': 'Agent fixture', 'description': 'Fixture only',
            }, call_id)
            executor = ToolExecutor(registry, PolicyEngine.load_from_file(domain / 'policies.yaml'))
            runner = AgentRunner(build_agent_graph(pack, llm, registry, executor))
            result = await runner.execute('Tạo phiếu hỗ trợ', principal, thread_id=call_id,
                                          operation_id=os.environ['FIXTURE_OPERATION_ID'], require_operation_id=True)
            assert result['status'] == 'done', result.get('final_answer')
            assert 'Đã xác nhận tạo phiếu hỗ trợ' in result['final_answer']
        print('AGENT_CORE_POSTGRES_FIXTURE_OK')
    finally:
        _authorization.reset(authorization)


if __name__ == '__main__':
    asyncio.run(main())
