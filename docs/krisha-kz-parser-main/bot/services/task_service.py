from datetime import datetime, timezone
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from bot.models import Task, TaskStatus


async def create_task(
    session: AsyncSession, name: str, url: str, interval_minutes: int
) -> Task:
    task = Task(name=name, url=url, interval_minutes=interval_minutes, status=TaskStatus.active)
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task


async def list_tasks(session: AsyncSession) -> list[Task]:
    result = await session.execute(
        select(Task).where(Task.status != TaskStatus.deleted).order_by(Task.id)
    )
    return list(result.scalars())


async def get_task(session: AsyncSession, task_id: int) -> Task | None:
    return await session.get(Task, task_id)


async def set_task_status(session: AsyncSession, task_id: int, status: TaskStatus) -> Task | None:
    task = await session.get(Task, task_id)
    if not task:
        return None
    task.status = status
    await session.commit()
    await session.refresh(task)
    return task


async def update_last_run(session: AsyncSession, task_id: int) -> None:
    await session.execute(
        update(Task)
        .where(Task.id == task_id)
        .values(last_run_at=datetime.now(timezone.utc))
    )
    await session.commit()


async def delete_task(session: AsyncSession, task_id: int) -> bool:
    task = await session.get(Task, task_id)
    if not task:
        return False
    # Physical delete — CASCADE removes all listings and phones via FK
    await session.execute(delete(Task).where(Task.id == task_id))
    await session.commit()
    return True
