"""Complete Dagmar application assembled with infrastructure-only host ports."""
from dataclasses import replace
from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import update, case
from uuid import uuid4
from .ports import RuntimePorts, bind, require_session, SessionLocal
from .orchestration import VoiceBridgeManager
from .models import LogicalCall
from .api_core import router as core_router
from .api_memory import router as memory_router

class BoundContext:
    def __init__(self, app, ports):
        self.app, self.ports = app, ports
    async def __call__(self, scope, receive, send):
        with bind(self.ports):
            await self.app(scope, receive, send)

class DagmarApplication:
    def __init__(self, ports: RuntimePorts):
        self.manager = VoiceBridgeManager()
        self.refreshes = {}
        self.ports = replace(ports, application=self)
        self.core = APIRouter()
        self.core.include_router(core_router)
        self.memory = memory_router
        @self.core.post('/calls')
        def create_call(request: Request):
            owner = str(require_session(request)['session_id'])
            identity = uuid4().hex
            with SessionLocal() as db:
                db.add(LogicalCall(id=identity, owner_session_id=owner))
                db.commit()
            return {'logical_call_id': identity}
        @self.core.post('/calls/{identity}/close')
        def close_call(identity: str, request: Request):
            owner = str(require_session(request)['session_id'])
            with SessionLocal() as db:
                changed = db.execute(update(LogicalCall).where(LogicalCall.id==identity, LogicalCall.owner_session_id==owner).values(open=False, greeting=case((LogicalCall.greeting.in_(["pending","requested","started"]), "interrupted"), else_=LogicalCall.greeting)))
                if changed.rowcount != 1:
                    raise HTTPException(404, detail={'code':'call_not_found'})
                db.commit()
            self.manager.forget_task(owner, identity)
            return {'closed': True}
        @self.core.post('/sessions/{identity}/playback-ready')
        async def playback_ready(identity: str, request: Request):
            owner = str(require_session(request)['session_id'])
            bridge = self.manager.get(identity, owner)
            if not bridge:
                raise HTTPException(404, detail={'code':'voice_session_not_found'})
            await bridge.greet()
            return {'ready': True}

    async def shutdown(self):
        with bind(self.ports):
            for task in self.refreshes.values():
                task.cancel()
            await self.manager.shutdown()
