import logging
from mcp.server.fastmcp import FastMCP
from bot.database import SessionFactory
from bot.models import TaskStatus, WahaStatus
from bot.services import task_service, phone_service
from bot import scheduler

logger = logging.getLogger(__name__)

mcp = FastMCP("krisha-bot")


@mcp.tool()
async def create_task(name: str, url: str, interval_minutes: int = 30) -> dict:
    """Create a new parsing task. url — krisha.kz search URL with filters applied."""
    async with SessionFactory() as session:
        task = await task_service.create_task(session, name, url, interval_minutes)
        scheduler.schedule_task(task.id, task.interval_minutes)
        return {"id": task.id, "name": task.name, "status": task.status, "interval_minutes": task.interval_minutes}


@mcp.tool()
async def list_tasks() -> list[dict]:
    """List all tasks (excluding deleted) with status and phone counts."""
    async with SessionFactory() as session:
        tasks = await task_service.list_tasks(session)
        result = []
        for t in tasks:
            stats = await phone_service.get_stats(session, t.id)
            result.append({
                "id": t.id,
                "name": t.name,
                "url": t.url,
                "interval_minutes": t.interval_minutes,
                "status": t.status,
                "last_run_at": t.last_run_at.isoformat() if t.last_run_at else None,
                "phones": stats,
            })
        return result


@mcp.tool()
async def get_task(task_id: int) -> dict | None:
    """Get details of a single task by ID."""
    async with SessionFactory() as session:
        task = await task_service.get_task(session, task_id)
        if not task:
            return None
        stats = await phone_service.get_stats(session, task_id)
        return {
            "id": task.id,
            "name": task.name,
            "url": task.url,
            "interval_minutes": task.interval_minutes,
            "status": task.status,
            "last_run_at": task.last_run_at.isoformat() if task.last_run_at else None,
            "created_at": task.created_at.isoformat(),
            "phones": stats,
        }


@mcp.tool()
async def start_task(task_id: int) -> dict:
    """Resume a paused task."""
    async with SessionFactory() as session:
        task = await task_service.set_task_status(session, task_id, TaskStatus.active)
        if not task:
            return {"error": f"Task {task_id} not found"}
        scheduler.schedule_task(task.id, task.interval_minutes)
        return {"id": task.id, "status": task.status}


@mcp.tool()
async def pause_task(task_id: int) -> dict:
    """Pause an active task."""
    async with SessionFactory() as session:
        task = await task_service.set_task_status(session, task_id, TaskStatus.paused)
        if not task:
            return {"error": f"Task {task_id} not found"}
        scheduler.unschedule_task(task_id)
        return {"id": task.id, "status": task.status}


@mcp.tool()
async def delete_task(task_id: int) -> dict:
    """Delete a task and all its collected phones."""
    async with SessionFactory() as session:
        ok = await task_service.delete_task(session, task_id)
        if not ok:
            return {"error": f"Task {task_id} not found"}
        scheduler.unschedule_task(task_id)
        return {"deleted": task_id}


@mcp.tool()
async def get_phones(task_id: int, limit: int = 100, status: str = "pending") -> list[dict]:
    """Get phone numbers for a task filtered by waha_status (pending/sent/failed)."""
    try:
        waha_status = WahaStatus(status)
    except ValueError:
        return [{"error": f"Invalid status '{status}'. Use: pending, sent, failed"}]

    async with SessionFactory() as session:
        phones = await phone_service.get_phones(session, task_id, limit, waha_status)
        return [
            {
                "id": p.id,
                "phone": p.phone,
                "waha_status": p.waha_status,
                "collected_at": p.collected_at.isoformat(),
            }
            for p in phones
        ]


@mcp.tool()
async def mark_phones(phone_ids: list[int], status: str) -> dict:
    """Mark phones as sent or failed. status: 'sent' | 'failed'."""
    try:
        waha_status = WahaStatus(status)
    except ValueError:
        return {"error": f"Invalid status '{status}'. Use: sent, failed"}

    async with SessionFactory() as session:
        count = await phone_service.mark_phones(session, phone_ids, waha_status)
        return {"updated": count, "status": status}


@mcp.tool()
async def get_stats(task_id: int | None = None) -> dict:
    """Get phone statistics. Optionally filter by task_id."""
    async with SessionFactory() as session:
        stats = await phone_service.get_stats(session, task_id)
        return stats
