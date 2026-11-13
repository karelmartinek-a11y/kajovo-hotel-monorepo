"""Hotel messaging endpoints retire after the CML history handover."""
from app.main import create_app


def test_hotel_does_not_publish_chat_routes_or_start_chat_senders():
    app = create_app()
    assert not any(route.path.startswith('/api/v1/chat') for route in app.routes)
    assert not any(route.path.startswith('/api/v1/reports') for route in app.routes)
    assert 'chat_push_scheduler_task' not in vars(app.state)
