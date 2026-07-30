"""Tiny in-process pub/sub for live updates over WebSocket.

Publishers (e.g. the sales service) call `broadcaster.publish(msg)`; each
connected WebSocket owns a queue it drains and forwards to the client. This is
single-process only — for multiple API workers, swap the internals for Redis
pub/sub while keeping this same interface.
"""

import asyncio
from typing import Any

Message = dict[str, Any]


class Broadcaster:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[Message]] = set()

    def subscribe(self) -> asyncio.Queue[Message]:
        queue: asyncio.Queue[Message] = asyncio.Queue()
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[Message]) -> None:
        self._subscribers.discard(queue)

    async def publish(self, message: Message) -> None:
        """Fan a message out to every subscriber (non-blocking)."""
        for queue in list(self._subscribers):
            queue.put_nowait(message)


broadcaster = Broadcaster()


async def publish_unit_status(unit_id: int, status: str) -> None:
    """Convenience emitter for the most common event."""
    await broadcaster.publish({"type": "unit_status", "unit_id": unit_id, "status": status})


async def publish_lead_update(pipeline_id: int) -> None:
    """Tell clients a lead changed in a pipeline so they refresh the board."""
    await broadcaster.publish({"type": "lead_update", "pipeline_id": pipeline_id})
