import asyncio
import json
from pathlib import Path
import httpx

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from agent_platform.agents.enterprise_agent import EnterpriseAgent
from agent_platform.config.loader import load_settings
from agent_platform.domain.pack import DomainPack
from agent_platform.harness.state.principal import Principal
from agent_platform.harness.tools.registry import ToolRegistry
from agent_platform.llm.providers.gemini import GeminiLLM
from agent_platform.llm.providers.scripted import ScriptedLLM
from agent_platform.llm.resilient import ResilientLLMClient
from agent_platform.harness import AgentHarness
from agent_platform.config.settings import PlatformSettings


def test_tool_history_preserves_call_and_corresponding_result():
    pack = DomainPack.load_from_dir(Path('domains/retail_store'))
    llm = ScriptedLLM()
    llm.queue_answer('Đã nhận kết quả.')
    agent = EnterpriseAgent(pack=pack, llm=llm, tool_registry=ToolRegistry())
    messages = [HumanMessage(content='Kiểm tra'),
                AIMessage(content='', tool_calls=[{'id': 'call-1', 'name': 'check_inventory', 'args': {'sku': 'ABC'}}]),
                ToolMessage(content='còn 2', name='check_inventory', tool_call_id='call-1')]
    asyncio.run(agent.process({'messages': messages, 'principal': Principal(user_id='alice', role='customer')}))
    sent = llm.history_calls[0]
    call = next(message for message in sent if message['role'] == 'assistant' and message.get('tool_calls'))
    reply = next(message for message in sent if message['role'] == 'tool')
    assert call['tool_calls'][0]['id'] == reply['tool_call_id'] == 'call-1'
    assert json.loads(call['tool_calls'][0]['function']['arguments']) == {'sku': 'ABC'}
    converted = GeminiLLM()._convert_messages(sent)
    assert any(part.get('functionCall') == {'name': 'check_inventory', 'args': {'sku': 'ABC'}}
               for message in converted for part in message['parts'])
    response = next(part for message in converted for part in message['parts'] if 'functionResponse' in part)
    assert response['functionResponse']['name'] == 'check_inventory'
    assert response['functionResponse']['response']['output'] == 'còn 2'


def test_llm_model_override(monkeypatch):
    monkeypatch.setenv('LLM_MODEL', 'fixture-model')
    assert load_settings(env='dev').llm.model_name == 'fixture-model'


def test_gemini_system_rules_are_separate_from_user_contents():
    sent = []
    def handler(request):
        sent.append(json.loads(request.content))
        return httpx.Response(200, json={'candidates': [{'content': {'parts': [{'text': 'ok'}]}}]})
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            await GeminiLLM(api_key='fixture', http_client=client).complete([
                {'role': 'system', 'content': 'Do not invent a budget.'},
                {'role': 'user', 'content': 'Any affordable laptops?'},
            ])
    asyncio.run(run())
    assert sent[0]['systemInstruction']['parts'] == [{'text': 'Do not invent a budget.'}]
    assert sent[0]['contents'] == [{'role': 'user', 'parts': [{'text': 'Any affordable laptops?'}]}]


def test_gemini_uses_json_schema_for_pydantic_tool_constraints():
    from pydantic import BaseModel, Field

    class Arguments(BaseModel):
        amount: int = Field(gt=0)

    schema = Arguments.model_json_schema()
    declaration = GeminiLLM()._convert_tools([{'function': {
        'name': 'example', 'description': 'example', 'parameters': schema,
    }}])[0]['functionDeclarations'][0]
    assert 'parameters' not in declaration
    assert declaration['parametersJsonSchema']['properties']['amount']['exclusiveMinimum'] == 0


def test_gemini_call_ids_are_unique_across_model_turns():
    def handler(request):
        return httpx.Response(200, json={'candidates': [{'content': {'parts': [
            {'functionCall': {'name': 'check_inventory', 'args': {'sku': 'ABC'}}}
        ]}}]})
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = GeminiLLM(api_key='fixture', http_client=client)
            first = await provider.complete([{'role': 'user', 'content': 'kiểm tra'}])
            second = await provider.complete([{'role': 'user', 'content': 'kiểm tra lại'}])
            assert first.tool_calls[0].id != second.tool_calls[0].id
    asyncio.run(run())


def test_live_provider_failure_abstains_without_mock_fallback():
    class FailingProvider:
        async def complete(self, *args, **kwargs):
            raise RuntimeError('provider failure')
    pack = DomainPack.load_from_dir(Path('domains/retail_store'))
    provider = ResilientLLMClient(FailingProvider(), max_retries=0)
    agent = EnterpriseAgent(pack=pack, llm=provider, tool_registry=ToolRegistry())
    result = asyncio.run(agent.process({'messages': [HumanMessage(content='Xin chào')],
                                        'principal': Principal(user_id='alice', role='customer')}))
    assert result['status'] == 'abstained'
    assert 'không khả dụng' in result['final_answer'] and '[Mock Response]' not in result['final_answer']
    harness = AgentHarness.__new__(AgentHarness)
    harness.settings = PlatformSettings(llm={'provider': 'gemini', 'model_name': 'test-model'})
    assert harness._create_llm_client().fallback is None
