import asyncio
import subprocess
import sys
import click
from bot.database import SessionFactory
from bot.models import TaskStatus, WahaStatus
from bot.services import task_service, phone_service
from bot import scheduler as sched


def run(coro):
    return asyncio.run(coro)


@click.group()
def cli():
    """krisha-bot — парсер телефонов с krisha.kz."""


@cli.command()
def serve():
    """Запустить бота (MCP-сервер + планировщик)."""
    subprocess.run([sys.executable, "main.py"], check=True)


# --- task ---

@cli.group()
def task():
    """Управление заданиями парсинга."""


@task.command("add")
@click.option("--name", required=True, help="Название задания")
@click.option("--url", required=True, help="URL поиска krisha.kz")
@click.option("--interval", default=30, show_default=True, help="Интервал проверки (минуты)")
def task_add(name, url, interval):
    """Создать новое задание."""
    async def _run():
        async with SessionFactory() as session:
            t = await task_service.create_task(session, name, url, interval)
            click.echo(f"Создано задание #{t.id}: {t.name} (каждые {t.interval_minutes} мин)")
    run(_run())


@task.command("list")
def task_list():
    """Список заданий."""
    async def _run():
        async with SessionFactory() as session:
            tasks = await task_service.list_tasks(session)
            if not tasks:
                click.echo("Заданий нет.")
                return
            for t in tasks:
                stats = await phone_service.get_stats(session, t.id)
                last = t.last_run_at.strftime("%Y-%m-%d %H:%M") if t.last_run_at else "—"
                click.echo(
                    f"#{t.id} [{t.status.value:7}] {t.name} | каждые {t.interval_minutes}мин"
                    f" | последний прогон: {last}"
                    f" | pending={stats['pending']} sent={stats['sent']} failed={stats['failed']}"
                )
    run(_run())


@task.command("start")
@click.argument("task_id", type=int)
def task_start(task_id):
    """Запустить/возобновить задание."""
    async def _run():
        async with SessionFactory() as session:
            t = await task_service.set_task_status(session, task_id, TaskStatus.active)
            if not t:
                click.echo(f"Задание #{task_id} не найдено.", err=True)
                return
            click.echo(f"Задание #{task_id} активно.")
    run(_run())


@task.command("run")
@click.argument("task_id", type=int)
def task_run(task_id):
    """Запустить прогон парсинга прямо сейчас (не ждать расписания)."""
    from bot.scheduler import run_task
    click.echo(f"Запускаю прогон задания #{task_id}...")
    run(run_task(task_id))
    click.echo("Прогон завершён.")


@task.command("pause")
@click.argument("task_id", type=int)
def task_pause(task_id):
    """Поставить задание на паузу."""
    async def _run():
        async with SessionFactory() as session:
            t = await task_service.set_task_status(session, task_id, TaskStatus.paused)
            if not t:
                click.echo(f"Задание #{task_id} не найдено.", err=True)
                return
            click.echo(f"Задание #{task_id} на паузе.")
    run(_run())


# --- phones ---

@cli.group()
def phones():
    """Просмотр собранных телефонов."""


@phones.command("list")
@click.option("--task", "task_id", required=True, type=int, help="ID задания")
@click.option("--status", default="pending", show_default=True, help="pending / sent / failed")
@click.option("--limit", default=50, show_default=True)
def phones_list(task_id, status, limit):
    """Показать телефоны по заданию."""
    async def _run():
        async with SessionFactory() as session:
            phones_list = await phone_service.get_phones(
                session, task_id, limit, WahaStatus(status)
            )
            if not phones_list:
                click.echo("Номеров нет.")
                return
            for p in phones_list:
                click.echo(f"#{p.id} {p.phone} [{p.waha_status}] {p.collected_at}")
    run(_run())


# --- status ---

@cli.command()
def status():
    """Состояние бота: БД и задания."""
    async def _run():
        try:
            async with SessionFactory() as session:
                tasks = await task_service.list_tasks(session)
                total_stats = await phone_service.get_stats(session)
            click.echo(f"БД: OK")
            click.echo(f"Заданий: {len(tasks)} (активных: {sum(1 for t in tasks if t.status == TaskStatus.active)})")
            click.echo(f"Телефонов: pending={total_stats['pending']} sent={total_stats['sent']} failed={total_stats['failed']}")
        except Exception as e:
            click.echo(f"БД: ОШИБКА — {e}", err=True)
    run(_run())


if __name__ == "__main__":
    cli()
