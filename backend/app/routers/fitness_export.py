import csv
import io
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.dates import br_day_start_utc, today_br
from app.models import User
from app.fitness_models import BodyWeightEntry, Gym, WorkoutSession
from app.fitness_pdf import PdfDocument
from app.fitness_sets import WARMUP, entry_volume, working
from .auth import get_current_user
from .fitness_sessions import COMPLETED, aware, series_count

fitness_export_router = APIRouter(prefix="/fitness", tags=["fitness"])

BR = timezone(timedelta(hours=-3))
PERIOD_DAYS = {"30d": 30, "90d": 90, "365d": 365}
PERIOD_LABEL = {"30d": "últimos 30 dias", "90d": "últimos 3 meses", "365d": "último ano", "all": "todo o histórico"}
WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
TECHNIQUE_LABEL = {"normal": "Normal", "warmup": "Aquecimento", "drop": "Drop", "rest_pause": "Rest-pause", "failure": "Até a falha"}
SIDE_LABEL = {"left": "E", "right": "D"}
SIDE_NAME = {"left": "Esquerda", "right": "Direita"}


def number(value, decimals: int = 2) -> str:
    text = f"{float(value):,.{decimals}f}".rstrip("0").rstrip(".") if decimals else f"{float(value):,.0f}"
    return text.replace(",", "_").replace(".", ",").replace("_", ".")


def local(dt: datetime) -> datetime:
    return aware(dt).astimezone(BR)


def clock(seconds: int | None) -> str:
    seconds = int(seconds or 0)
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes}:{secs:02d}"


def duration_text(start: datetime, end: datetime | None) -> str:
    if not end:
        return ""
    minutes = max(0, round((aware(end) - aware(start)).total_seconds() / 60))
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h {minutes:02d}min" if hours else f"{minutes} min"


def completed_sessions(user: User, db: Session, period: str, newest_first: bool, gym: Gym | None = None) -> list[WorkoutSession]:
    query = db.query(WorkoutSession).filter(WorkoutSession.user_id == user.id, WorkoutSession.status == COMPLETED)
    if gym is not None:
        query = query.filter(WorkoutSession.gym_id == gym.id)
    if period in PERIOD_DAYS:
        query = query.filter(WorkoutSession.started_at >= br_day_start_utc(today_br() - timedelta(days=PERIOD_DAYS[period] - 1)))
    order = WorkoutSession.started_at.desc() if newest_first else WorkoutSession.started_at
    return query.order_by(order, WorkoutSession.id).all()


def body_weights(user: User, db: Session, period: str, newest_first: bool) -> list[BodyWeightEntry]:
    query = db.query(BodyWeightEntry).filter(BodyWeightEntry.user_id == user.id)
    if period in PERIOD_DAYS:
        query = query.filter(BodyWeightEntry.measured_on >= today_br() - timedelta(days=PERIOD_DAYS[period] - 1))
    order = (BodyWeightEntry.measured_on.desc(), BodyWeightEntry.measured_time.desc()) if newest_first else (BodyWeightEntry.measured_on, BodyWeightEntry.measured_time)
    return query.order_by(*order).all()


def series_labels(entries) -> dict[int, str]:
    labels, count, pairs = {}, 0, {}
    for entry in entries:
        if entry.kind == WARMUP:
            labels[entry.id] = "Aq"
            continue
        if entry.side:
            if entry.position not in pairs:
                count += 1
                pairs[entry.position] = str(count)
            labels[entry.id] = pairs[entry.position]
            continue
        count += 1
        labels[entry.id] = str(count)
    return labels


def load_text(weight, bodyweight: bool) -> str:
    if bodyweight:
        return f"PC + {number(weight)} kg" if weight > 0 else "Peso corporal"
    return f"{number(weight)} kg" if weight > 0 else "Peso corporal"


def set_text(item, entry) -> str:
    tracking = item.tracking or "reps"
    if entry.kind == WARMUP:
        return "Aquecimento feito"
    if tracking == "cardio":
        parts = [clock(entry.duration_seconds)]
        if entry.distance_km:
            parts.append(f"{number(entry.distance_km)} km")
        if entry.speed_kmh:
            parts.append(f"{number(entry.speed_kmh, 1)} km/h")
        if entry.level:
            parts.append(f"nível {entry.level}")
        if entry.incline_pct is not None:
            parts.append(f"inclinação {number(entry.incline_pct, 1)}%")
        if entry.calories:
            parts.append(f"{entry.calories} kcal")
        return " · ".join(parts)
    bodyweight = item.equipment == "bodyweight"
    if tracking == "time":
        text = clock(entry.duration_seconds)
        return f"{text} · {load_text(entry.weight_kg, bodyweight)}" if entry.weight_kg > 0 else text
    text = f"{load_text(entry.weight_kg, bodyweight)} × {entry.reps}"
    if item.load_mode == "side" and entry.weight_kg > 0 and not bodyweight:
        text += f" ({number(entry.weight_kg / 2)} kg cada lado)"
    if entry.side:
        text = f"{SIDE_LABEL[entry.side]} {text}"
    extras = []
    if entry.kind == "failure":
        extras.append("até a falha")
    elif entry.rir is not None:
        extras.append(f"RIR {'4+' if entry.rir >= 4 else entry.rir}")
    stages = entry.stages or []
    if entry.kind == "drop" and stages:
        extras.append("drops: " + ", ".join(f"{load_text(stage['weight_kg'], bodyweight)} × {stage['reps']}" for stage in stages))
    if entry.kind == "rest_pause" and stages:
        extras.append("pausas: " + ", ".join(str(stage["reps"]) for stage in stages))
    return " · ".join([text, *extras])


def session_summary(workout_session: WorkoutSession) -> tuple[int, Decimal]:
    strength = [item for item in workout_session.exercises if (item.tracking or "reps") != "cardio"]
    sets = sum(series_count(item.sets) for item in strength)
    volume = sum((entry_volume(entry) for item in strength for entry in working(item.sets)), Decimal(0))
    return sets, volume


def session_meta(workout_session: WorkoutSession) -> str:
    started = local(workout_session.started_at)
    sets, volume = session_summary(workout_session)
    parts = [
        f"{WEEKDAYS[started.weekday()]}, {started:%d/%m/%Y} às {started:%H:%M}",
        workout_session.gym.name if workout_session.gym else "",
        duration_text(workout_session.started_at, workout_session.completed_at),
        f"{sets} {'série' if sets == 1 else 'séries'}",
    ]
    if volume > 0:
        parts.append(f"{number(volume, 0)} kg de volume")
    return " · ".join(part for part in parts if part)


def report_blocks(user: User, sessions, weights, period: str, gym: Gym | None = None) -> list[tuple[str, str, int]]:
    scope = f" · {gym.name}" if gym is not None and sessions is not None else ""
    blocks = [
        ("title", "GymGoals", 0),
        ("subtitle", f"{user.name} · exportado em {datetime.now(BR):%d/%m/%Y às %H:%M} · {PERIOD_LABEL[period]}{scope}", 0),
    ]
    if sessions is not None:
        blocks.append(("section", f"Treinos ({len(sessions)})", 0))
        if not sessions:
            blocks.append(("note", "Nenhum treino concluído nesse período.", 0))
        for workout_session in sessions:
            blocks.append(("rule", "", 0))
            blocks.append(("heading", workout_session.name, 0))
            blocks.append(("meta", session_meta(workout_session), 0))
            for index, item in enumerate((i for i in workout_session.exercises if i.sets), start=1):
                blocks.append(("exercise", f"{index}. {item.exercise_name}", 0))
                labels = series_labels(item.sets)
                for entry in item.sets:
                    blocks.append(("text", f"{labels[entry.id]:<4} {set_text(item, entry)}", 14))
                if item.note:
                    blocks.append(("note", f"Obs.: {item.note}", 14))
    if weights is not None:
        blocks.append(("section", f"Peso corporal ({len(weights)})", 0))
        if not weights:
            blocks.append(("note", "Nenhuma pesagem nesse período.", 0))
        for entry in weights:
            when = f"{entry.measured_on:%d/%m/%Y}" + (f" às {entry.measured_time:%H:%M}" if entry.measured_time else "")
            note = f" · {entry.note}" if entry.note else ""
            blocks.append(("text", f"{when}   {number(entry.weight_kg)} kg{note}", 0))
    return blocks


def as_text(blocks) -> str:
    lines = []
    for style, text, indent in blocks:
        if style == "rule":
            lines.append("")
            lines.append("-" * 48)
            continue
        if style == "section":
            lines.extend(["", "", text.upper(), "=" * 48])
            continue
        if style == "exercise":
            lines.append("")
        lines.append(" " * (indent // 4) + text)
    return "\n".join(lines).strip() + "\n"


def as_pdf(blocks) -> bytes:
    document = PdfDocument()
    for style, text, indent in blocks:
        if style == "rule":
            document.rule()
        else:
            document.add(style, text, indent)
    return document.build()


WORKOUT_COLUMNS = [
    "Data", "Hora", "Treino", "Academia", "Exercício", "Série", "Lado", "Técnica", "Carga (kg)", "Repetições", "RIR",
    "Etapas", "Duração (s)", "Distância (km)", "Velocidade (km/h)", "Nível", "Inclinação (%)", "Calorias", "Observação",
]


def optional(value, decimals: int = 2) -> str:
    return "" if value is None else number(value, decimals)


def workouts_csv(sessions) -> list[list[str]]:
    rows = [WORKOUT_COLUMNS]
    for workout_session in sessions:
        started = local(workout_session.started_at)
        for item in workout_session.exercises:
            labels = series_labels(item.sets)
            for entry in item.sets:
                stages = entry.stages or []
                rows.append([
                    f"{started:%d/%m/%Y}",
                    f"{started:%H:%M}",
                    workout_session.name,
                    workout_session.gym.name if workout_session.gym else "",
                    item.exercise_name,
                    labels[entry.id],
                    SIDE_NAME.get(entry.side, ""),
                    TECHNIQUE_LABEL.get(entry.kind or "normal", entry.kind),
                    "" if entry.kind == WARMUP or item.tracking == "cardio" else number(entry.weight_kg),
                    "" if entry.kind == WARMUP or (item.tracking or "reps") != "reps" else str(entry.reps),
                    "" if entry.rir is None else str(entry.rir),
                    " | ".join(f"{number(stage['weight_kg'])} x {stage['reps']}" for stage in stages),
                    "" if entry.duration_seconds is None else str(entry.duration_seconds),
                    optional(entry.distance_km),
                    optional(entry.speed_kmh, 1),
                    "" if entry.level is None else str(entry.level),
                    optional(entry.incline_pct, 1),
                    "" if entry.calories is None else str(entry.calories),
                    item.note or "",
                ])
    return rows


def weights_csv(weights) -> list[list[str]]:
    rows = [["Data", "Hora", "Peso (kg)", "Observação"]]
    for entry in weights:
        rows.append([
            f"{entry.measured_on:%d/%m/%Y}",
            f"{entry.measured_time:%H:%M}" if entry.measured_time else "",
            number(entry.weight_kg),
            entry.note or "",
        ])
    return rows


def as_csv(rows) -> bytes:
    buffer = io.StringIO()
    csv.writer(buffer, delimiter=";", lineterminator="\r\n").writerows(rows)
    return ("﻿" + buffer.getvalue()).encode("utf-8")


def download(content: bytes, media_type: str, filename: str) -> Response:
    return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@fitness_export_router.get("/export")
def export_data(
    format: Literal["csv", "txt", "pdf"] = Query("pdf"),
    content: Literal["workouts", "weights", "all"] = Query("all"),
    period: Literal["30d", "90d", "365d", "all"] = Query("all"),
    gym_id: int | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stamp = f"{today_br():%Y-%m-%d}"
    gym = None
    if gym_id is not None:
        gym = db.get(Gym, gym_id)
        if gym is None or gym.user_id != user.id:
            raise HTTPException(status_code=404, detail="Academia não encontrada.")
    if format == "csv":
        if content == "all":
            raise HTTPException(status_code=400, detail="No CSV, escolha treinos ou peso corporal.")
        if content == "workouts":
            rows = workouts_csv(completed_sessions(user, db, period, newest_first=False, gym=gym))
            return download(as_csv(rows), "text/csv; charset=utf-8", f"gymgoals-treinos-{stamp}.csv")
        rows = weights_csv(body_weights(user, db, period, newest_first=False))
        return download(as_csv(rows), "text/csv; charset=utf-8", f"gymgoals-peso-{stamp}.csv")
    sessions = completed_sessions(user, db, period, newest_first=True, gym=gym) if content in ("workouts", "all") else None
    weights = body_weights(user, db, period, newest_first=True) if content in ("weights", "all") else None
    blocks = report_blocks(user, sessions, weights, period, gym)
    suffix = {"workouts": "-treinos", "weights": "-peso", "all": ""}[content]
    if format == "txt":
        return download(as_text(blocks).encode("utf-8"), "text/plain; charset=utf-8", f"gymgoals{suffix}-{stamp}.txt")
    return download(as_pdf(blocks), "application/pdf", f"gymgoals{suffix}-{stamp}.pdf")
