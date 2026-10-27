from pydantic import ConfigDict, Field, SecretStr

from app.schemas.common import CamelModel


class DemoResetRequest(CamelModel):
    model_config = ConfigDict(extra="forbid")
    confirmation: str = Field(max_length=100)
    username: str = Field(max_length=15)
    password: SecretStr = Field(min_length=1, max_length=1024)
    acknowledged: bool = Field(strict=True)
    target_id: str = Field(min_length=64, max_length=64)


class DemoResetTarget(CamelModel):
    environment: str
    database_host: str
    database_port: int | None
    database_name: str
    database_schema: str
    requires_production_override: bool
    enabled: bool
    target_id: str


class DemoResetResult(CamelModel):
    deleted: dict[str, int]
    message: str
