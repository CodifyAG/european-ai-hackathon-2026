"""Request schema for optional Agentgateway audit webhooks."""

from pydantic import BaseModel


class GuardMessage(BaseModel):
    role: str
    content: str


class GuardBody(BaseModel):
    messages: list[GuardMessage]


class GuardRequest(BaseModel):
    body: GuardBody
