"""WebSocket endpoint that streams live events to authenticated clients.

The browser connects to `/api/ws?token=<access token>`; we validate the token,
then forward every broadcast message to the socket until it disconnects.
"""

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.core.realtime import broadcaster
from app.core.security import decode_token

router = APIRouter()


@router.websocket("/ws")
async def realtime_ws(websocket: WebSocket) -> None:
    # Auth: token is passed as a query param (WebSocket has no Authorization header).
    token = websocket.query_params.get("token", "")
    try:
        decode_token(token, expected_type="access")
    except jwt.PyJWTError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    queue = broadcaster.subscribe()
    try:
        while True:
            message = await queue.get()
            await websocket.send_json(message)
    except (WebSocketDisconnect, RuntimeError):
        # RuntimeError: send after the client already went away.
        pass
    finally:
        broadcaster.unsubscribe(queue)
