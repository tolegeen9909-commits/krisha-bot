import asyncio
import logging
from alembic.config import Config
from alembic import command
from bot import scheduler
from bot.mcp_server import mcp

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)

logger = logging.getLogger(__name__)


def run_migrations() -> None:
    logger.info("Running DB migrations...")
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")
    logger.info("Migrations complete.")


async def _main() -> None:
    scheduler.start()
    await scheduler.load_active_tasks()
    await mcp.run_stdio_async()


if __name__ == "__main__":
    run_migrations()          # sync, before event loop starts
    asyncio.run(_main())
