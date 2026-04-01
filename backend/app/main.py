from fastapi import FastAPI
from passlib.context import CryptContext
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
import os


load_dotenv()

SECRET_KEY = os.getenv('SECRET_KEY')
ALGORITHM = os.getenv('ALGORITHM')
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES'))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv('REFRESH_TOKEN_EXPIRE_DAYS'))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

app = FastAPI()

bcrypt_context = CryptContext(schemes=['bcrypt'], deprecated='auto')

from app.routers.auth import auth_router
from app.routers.home import home_router
from app.routers.goals import goals_router
from app.routers.tasks import tasks_router

app.include_router(auth_router)
app.include_router(home_router)
app.include_router(goals_router)
app.include_router(tasks_router)

