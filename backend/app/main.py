from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from passlib.context import CryptContext
from fastapi.security import OAuth2PasswordBearer
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv
import logging
import os

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Variável de ambiente obrigatória não definida: {name}")
    return value


SECRET_KEY = require_env("SECRET_KEY")
ALGORITHM = require_env("ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = int(require_env("ACCESS_TOKEN_EXPIRE_MINUTES"))
REFRESH_TOKEN_EXPIRE_DAYS = int(require_env("REFRESH_TOKEN_EXPIRE_DAYS"))
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
RESEND_KEY = os.getenv("RESEND_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
ALLOWED_ORIGINS = [origin.strip() for origin in FRONTEND_URL.split(",")]

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

app = FastAPI()

app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

bcrypt_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def client_ip(request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    hops = [hop.strip() for hop in forwarded.split(",") if hop.strip()]
    return hops[-1] if hops else get_remote_address(request)


def user_key(request) -> str:
    from jose import JWTError, jwt

    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        try:
            subject = jwt.decode(header[7:], SECRET_KEY, algorithms=[ALGORITHM]).get("sub")
        except JWTError:
            subject = None
        if subject:
            return f"user:{subject}"
    return client_ip(request)


limiter = Limiter(key_func=client_ip)
app.state.limiter = limiter
def rate_limited(request, exc: RateLimitExceeded):
    response = _rate_limit_exceeded_handler(request, exc)
    response.body = response.render({"detail": "Muitas tentativas seguidas. Espere um minuto e tente de novo."})
    response.headers["content-length"] = str(len(response.body))
    return response


app.add_exception_handler(RateLimitExceeded, rate_limited)

from app.routers.auth import auth_router
from app.routers.home import home_router
from app.routers.goals import goals_router
from app.routers.tasks import tasks_router
from app.routers.stats import stats_router
from app.routers.groups import groups_router
from app.routers.super_goals import super_goals_router
from app.routers.overview import overview_router
from app.routers.fitness import fitness_router
from app.routers.fitness_sessions import fitness_sessions_router
from app.routers.fitness_progress import fitness_progress_router
from app.routers.fitness_overview import fitness_overview_router
from app.routers.fitness_stats import fitness_stats_router
from app.routers.fitness_plans import fitness_plans_router
from app.routers.fitness_profile import fitness_profile_router
from app.routers.fitness_social import fitness_social_router
from app.routers.fitness_challenges import fitness_challenges_router
from app.routers.fitness_feed import fitness_feed_router
from app.routers.fitness_notifications import fitness_notifications_router
from app.routers.fitness_close import fitness_close_router
from app.routers.fitness_live import fitness_live_router
from app.routers.fitness_share import fitness_share_router
from app.routers.fitness_export import fitness_export_router
from app.routers.fitness_gyms import fitness_gyms_router

app.include_router(auth_router)
app.include_router(home_router)
app.include_router(goals_router)
app.include_router(tasks_router)
app.include_router(stats_router)
app.include_router(groups_router)
app.include_router(super_goals_router)
app.include_router(overview_router)
app.include_router(fitness_router)
app.include_router(fitness_sessions_router)
app.include_router(fitness_progress_router)
app.include_router(fitness_overview_router)
app.include_router(fitness_stats_router)
app.include_router(fitness_plans_router)
app.include_router(fitness_profile_router)
app.include_router(fitness_social_router)
app.include_router(fitness_challenges_router)
app.include_router(fitness_feed_router)
app.include_router(fitness_notifications_router)
app.include_router(fitness_close_router)
app.include_router(fitness_live_router)
app.include_router(fitness_share_router)
app.include_router(fitness_export_router)
app.include_router(fitness_gyms_router)
