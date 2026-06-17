from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Integer, DateTime, ForeignKey, Enum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from bot.database import Base


class TaskStatus(str, PyEnum):
    active = "active"
    paused = "paused"
    deleted = "deleted"


class WahaStatus(str, PyEnum):
    pending = "pending"
    sent = "sent"
    failed = "failed"


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    interval_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus), nullable=False, default=TaskStatus.active
    )
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    listings: Mapped[list["Listing"]] = relationship(back_populates="task", cascade="all, delete-orphan")
    phones: Mapped[list["Phone"]] = relationship(back_populates="task", cascade="all, delete-orphan")


class Listing(Base):
    __tablename__ = "listings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    advert_id: Mapped[str] = mapped_column(String(64), nullable=False)
    listing_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    parsed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    task: Mapped["Task"] = relationship(back_populates="listings")
    phones: Mapped[list["Phone"]] = relationship(back_populates="listing", cascade="all, delete-orphan")


class Phone(Base):
    __tablename__ = "phones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id", ondelete="CASCADE"))
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    waha_status: Mapped[WahaStatus] = mapped_column(
        Enum(WahaStatus), nullable=False, default=WahaStatus.pending
    )
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    task: Mapped["Task"] = relationship(back_populates="phones")
    listing: Mapped["Listing"] = relationship(back_populates="phones")
