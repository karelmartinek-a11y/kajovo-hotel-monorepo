"""Normal authenticated owner connection flow. No confirmation or credential browser endpoint."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from voice_core_server import VoiceError

from .api_core import require_voice_admin
from .ports import require_session
from .smart import SmartError
from .smartplan import SmartPlanClient, owner_subject

router = APIRouter(prefix='/smartplan', tags=['smartplan'], dependencies=[Depends(require_voice_admin)])


class SmartPlanConnection(BaseModel):
    status: str
    owner_confirmation_url: str | None = None


@router.get('', response_model=SmartPlanConnection)
async def connection(request: Request):
    client = None
    try:
        client = SmartPlanClient(owner_subject(str(require_session(request)['session_id'])))
        await client.initialize()
        return SmartPlanConnection(status='ready')
    except (VoiceError, SmartError) as exc:
        code = exc.category if isinstance(exc, VoiceError) else str(exc)
        return SmartPlanConnection(status=code)
    finally:
        if client:
            await client.close()


@router.post('/link', response_model=SmartPlanConnection)
async def link(request: Request):
    client = None
    try:
        client = SmartPlanClient(owner_subject(str(require_session(request)['session_id'])))
        result = await client.link()
        return SmartPlanConnection(status='ready' if result['approved'] else 'owner_link_required',
                                   owner_confirmation_url=result['owner_confirmation_url'])
    except (VoiceError, SmartError) as exc:
        code = exc.category if isinstance(exc, VoiceError) else str(exc)
        raise HTTPException(503, detail={'code': code}) from None
    finally:
        if client:
            await client.close()
