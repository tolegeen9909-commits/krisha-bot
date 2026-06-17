import asyncio
import logging
import os
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from bot.database import SessionFactory
from bot.models import TaskStatus
from bot.services import task_service, phone_service
from bot.parser.krisha import (
    iter_listing_urls,
    fetch_phones,
    prepare_session,
    CaptchaError,
    SolveBudgetExhausted,
)
from bot.parser.recaptcha import SolveBudget
from bot.secrets import list_account_ids

logger = logging.getLogger(__name__)

# Потолок платных 2captcha solve на один прогон задания (защита от лавины затрат).
_MAX_CAPTCHA_SOLVES_PER_RUN = int(os.environ.get("MAX_CAPTCHA_SOLVES_PER_RUN", "50"))

_scheduler = AsyncIOScheduler()


def get_scheduler() -> AsyncIOScheduler:
    return _scheduler


async def run_task(task_id: int) -> None:
    logger.info("Starting parse run for task_id=%d", task_id)

    # Short-lived session: just check task is still active
    async with SessionFactory() as session:
        task = await task_service.get_task(session, task_id)
        if not task or task.status != TaskStatus.active:
            return
        search_url = task.url

    total_phones = 0
    accounts = list_account_ids()  # e.g. [1, 2]
    account_idx = 0
    http_session = await asyncio.to_thread(prepare_session, accounts[account_idx])
    budget = SolveBudget(_MAX_CAPTCHA_SOLVES_PER_RUN)
    logger.info("Task %d: using account %d (available: %s)", task_id, accounts[account_idx], accounts)

    try:
        async for listing_url, advert_id in iter_listing_urls(search_url, http_session):
            # Уже собрано в прошлый прогон? (listing создаём только после успешного reveal)
            async with SessionFactory() as session:
                if await phone_service.listing_exists(session, task_id, advert_id):
                    continue

            try:
                phones = await fetch_phones(http_session, listing_url, advert_id, budget)
            except SolveBudgetExhausted:
                logger.warning(
                    "Task %d: лимит solve (%d) за прогон исчерпан — стоп до следующего прогона",
                    task_id, _MAX_CAPTCHA_SOLVES_PER_RUN,
                )
                break
            except CaptchaError:
                # Капчу не прошли. Ротация имеет смысл только при >1 аккаунте.
                if len(accounts) > 1:
                    account_idx = (account_idx + 1) % len(accounts)
                    logger.warning(
                        "Task %d: CAPTCHA — ротация на аккаунт %d", task_id, accounts[account_idx]
                    )
                    await asyncio.to_thread(http_session.close)
                    http_session = await asyncio.to_thread(prepare_session, accounts[account_idx])
                    try:
                        phones = await fetch_phones(http_session, listing_url, advert_id, budget)
                    except SolveBudgetExhausted:
                        logger.warning("Task %d: лимит solve исчерпан при ротации — стоп", task_id)
                        break
                    except CaptchaError:
                        logger.warning(
                            "Task %d: CAPTCHA на всех аккаунтах для advert %s — пропуск (повтор в след. прогон)",
                            task_id, advert_id,
                        )
                        continue  # listing НЕ создаём → объявление перепробуется
                else:
                    logger.warning(
                        "Task %d: CAPTCHA (один аккаунт) для advert %s — пропуск (повтор в след. прогон)",
                        task_id, advert_id,
                    )
                    continue  # listing НЕ создаём → объявление перепробуется

            # Сюда — только если капча пройдена ИЛИ телефонов нет без капчи: фиксируем listing.
            async with SessionFactory() as session:
                listing, _ = await phone_service.get_or_create_listing(
                    session, task_id, advert_id, listing_url
                )
                if phones:
                    saved = await phone_service.save_phones(session, task_id, listing.id, phones)
                    total_phones += saved
    finally:
        await asyncio.to_thread(http_session.close)

    async with SessionFactory() as session:
        await task_service.update_last_run(session, task_id)

    logger.info("Task %d done: %d new phone(s) collected", task_id, total_phones)


def schedule_task(task_id: int, interval_minutes: int) -> None:
    job_id = f"task_{task_id}"
    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)
    _scheduler.add_job(
        run_task,
        "interval",
        minutes=interval_minutes,
        id=job_id,
        args=[task_id],
        max_instances=1,
        coalesce=True,
    )
    logger.info("Scheduled task %d every %d min", task_id, interval_minutes)


def unschedule_task(task_id: int) -> None:
    job_id = f"task_{task_id}"
    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)
        logger.info("Unscheduled task %d", task_id)


async def load_active_tasks() -> None:
    async with SessionFactory() as session:
        tasks = await task_service.list_tasks(session)

    active = [t for t in tasks if t.status == TaskStatus.active]
    for task in active:
        schedule_task(task.id, task.interval_minutes)

    logger.info("Loaded %d active task(s) from DB", len(active))


def start() -> None:
    _scheduler.start()


def stop() -> None:
    _scheduler.shutdown(wait=False)
