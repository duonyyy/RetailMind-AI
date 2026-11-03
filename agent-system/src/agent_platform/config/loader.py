import os
from pathlib import Path
from typing import Any, Dict
import yaml
from agent_platform.config.settings import PlatformSettings

def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively merges override dictionary into base dictionary."""
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result

def load_settings(
    env: str | None = None,
    config_dir: str | Path | None = None,
) -> PlatformSettings:
    """
    Loads configuration by merging base.yaml + {env}.yaml + ENV overrides,
    validated with Pydantic PlatformSettings.
    """
    if config_dir is None:
        # Default configs path relative to project root or workspace
        # Assuming project structure: enterprise-agentic-ai-template/configs/
        current_file = Path(__file__).resolve()
        # agent_platform/config/loader.py -> up 3 levels to enterprise-agentic-ai-template
        project_root = current_file.parents[3]
        config_dir = project_root / "configs"
    else:
        config_dir = Path(config_dir)

    target_env = env or os.getenv("APP_ENV") or os.getenv("PLATFORM_ENV") or "dev"

    # 1. Load base.yaml
    base_file = config_dir / "base.yaml"
    merged: Dict[str, Any] = {}
    if base_file.exists():
        with open(base_file, "r", encoding="utf-8") as f:
            content = yaml.safe_load(f)
            if isinstance(content, dict):
                merged = content

    # 2. Merge {env}.yaml overlay
    env_file = config_dir / f"{target_env}.yaml"
    if env_file.exists():
        with open(env_file, "r", encoding="utf-8") as f:
            overlay = yaml.safe_load(f)
            if isinstance(overlay, dict):
                merged = _deep_merge(merged, overlay)

    # 3. Environment Variable Overrides
    if "app" not in merged:
        merged["app"] = {}
    if "llm" not in merged:
        merged["llm"] = {}
    if "persistence" not in merged:
        merged["persistence"] = {}

    merged["app"]["env"] = target_env

    if domain_env := os.getenv("APP_DOMAIN"):
        merged["app"]["domain"] = domain_env

    if provider_env := os.getenv("LLM_PROVIDER"):
        merged["llm"]["provider"] = provider_env

    if api_key_env := os.getenv("LLM_API_KEY"):
        merged["llm"]["api_key"] = api_key_env

    if model_env := os.getenv("LLM_MODEL"):
        merged["llm"]["model_name"] = model_env

    if base_url_env := os.getenv("LLM_BASE_URL"):
        merged["llm"]["base_url"] = base_url_env

    if adapter_env := os.getenv("PERSISTENCE_ADAPTER"):
        merged["persistence"]["adapter"] = adapter_env

    if pg_url_env := (os.getenv("AGENT_POSTGRES_URL") or os.getenv("POSTGRES_URL")):
        merged["persistence"]["postgres_url"] = pg_url_env

    if pg_schema_env := os.getenv("AGENT_POSTGRES_SCHEMA"):
        merged["persistence"]["postgres_schema"] = pg_schema_env

    if redis_url_env := os.getenv("REDIS_URL"):
        merged["persistence"]["redis_url"] = redis_url_env

    return PlatformSettings(**merged)
