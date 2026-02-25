# routers/websocket_router.py — Real-time WebSocket support
import json
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, Set, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from jose import jwt, JWTError

router = APIRouter(tags=["WebSocket"])
logger = logging.getLogger("infinity-os.ws")


class ConnectionManager:
    """Manages WebSocket connections per organisation"""

    def __init__(self):
        self._connections: Dict[str, Dict[str, WebSocket]] = {}  # org_id -> {user_id -> ws}
        self._subscriptions: Dict[str, Set[str]] = {}  # channel -> {user_ids}

    async def connect(self, websocket: WebSocket, user_id: str, org_id: str):
        await websocket.accept()
        if org_id not in self._connections:
            self._connections[org_id] = {}
        self._connections[org_id][user_id] = websocket
        logger.info(f"WS connected: user={user_id[:8]} org={org_id[:8]}")

    def disconnect(self, user_id: str, org_id: str):
        if org_id in self._connections:
            self._connections[org_id].pop(user_id, None)
            if not self._connections[org_id]:
                del self._connections[org_id]
        # Remove from all subscriptions
        for channel in list(self._subscriptions.keys()):
            self._subscriptions[channel].discard(user_id)
        logger.info(f"WS disconnected: user={user_id[:8]}")

    def subscribe(self, user_id: str, channel: str):
        if channel not in self._subscriptions:
            self._subscriptions[channel] = set()
        self._subscriptions[channel].add(user_id)

    def unsubscribe(self, user_id: str, channel: str):
        if channel in self._subscriptions:
            self._subscriptions[channel].discard(user_id)

    async def send_to_user(self, user_id: str, org_id: str, message: dict):
        if org_id in self._connections and user_id in self._connections[org_id]:
            try:
                await self._connections[org_id][user_id].send_json(message)
            except Exception:
                self.disconnect(user_id, org_id)

    async def broadcast_to_org(self, org_id: str, message: dict, exclude_user: Optional[str] = None):
        if org_id not in self._connections:
            return
        disconnected = []
        for uid, ws in self._connections[org_id].items():
            if uid == exclude_user:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(uid)
        for uid in disconnected:
            self.disconnect(uid, org_id)

    async def broadcast_to_channel(self, channel: str, org_id: str, message: dict):
        if channel not in self._subscriptions:
            return
        for user_id in self._subscriptions[channel]:
            await self.send_to_user(user_id, org_id, message)

    def get_online_users(self, org_id: str) -> list:
        if org_id not in self._connections:
            return []
        return list(self._connections[org_id].keys())

    def get_stats(self) -> dict:
        total = sum(len(conns) for conns in self._connections.values())
        return {
            "total_connections": total,
            "organisations": len(self._connections),
            "channels": len(self._subscriptions),
        }


# Global connection manager
manager = ConnectionManager()


def _verify_ws_token(token: str) -> Optional[dict]:
    """Verify JWT token for WebSocket authentication"""
    import os
    secret = os.getenv("JWT_SECRET_KEY", "")
    if not secret:
        return None
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
):
    """Main WebSocket endpoint for real-time communication"""
    # Authenticate
    payload = _verify_ws_token(token)
    if not payload:
        await websocket.close(code=4001, reason="Authentication failed")
        return

    user_id = payload.get("sub")
    org_id = payload.get("organisation_id")
    if not user_id or not org_id:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await manager.connect(websocket, user_id, org_id)

    # Send welcome message
    await websocket.send_json({
        "type": "connected",
        "user_id": user_id,
        "organisation_id": org_id,
        "online_users": manager.get_online_users(org_id),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    # Notify others
    await manager.broadcast_to_org(org_id, {
        "type": "user.online",
        "user_id": user_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }, exclude_user=user_id)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong", "timestamp": datetime.now(timezone.utc).isoformat()})

            elif msg_type == "subscribe":
                channel = data.get("channel", "")
                if channel:
                    manager.subscribe(user_id, channel)
                    await websocket.send_json({"type": "subscribed", "channel": channel})

            elif msg_type == "unsubscribe":
                channel = data.get("channel", "")
                if channel:
                    manager.unsubscribe(user_id, channel)
                    await websocket.send_json({"type": "unsubscribed", "channel": channel})

            elif msg_type == "broadcast":
                # Broadcast to organisation
                await manager.broadcast_to_org(org_id, {
                    "type": "message",
                    "from": user_id,
                    "payload": data.get("payload", {}),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }, exclude_user=user_id)

            elif msg_type == "channel.message":
                channel = data.get("channel", "")
                if channel:
                    await manager.broadcast_to_channel(channel, org_id, {
                        "type": "channel.message",
                        "channel": channel,
                        "from": user_id,
                        "payload": data.get("payload", {}),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

            elif msg_type == "direct":
                target_user = data.get("to")
                if target_user:
                    await manager.send_to_user(target_user, org_id, {
                        "type": "direct",
                        "from": user_id,
                        "payload": data.get("payload", {}),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

    except WebSocketDisconnect:
        manager.disconnect(user_id, org_id)
        await manager.broadcast_to_org(org_id, {
            "type": "user.offline",
            "user_id": user_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(user_id, org_id)


@router.get("/ws/stats")
async def websocket_stats():
    """Get WebSocket connection statistics"""
    return manager.get_stats()